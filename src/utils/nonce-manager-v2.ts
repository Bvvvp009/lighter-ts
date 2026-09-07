/**
 * Optimistic nonce manager with per-key lazy fetch and per-key send locks —
 * a TypeScript port of lighter-python's `OptimisticNonceManager` +
 * `process_api_key_and_nonce` (upstream commits 7457fec "lazy nonce locks").
 *
 * Semantics:
 * - Lazily fetches the base nonce per API key on FIRST use
 *   (`server_nonce - 1`), so constructing the manager performs no network I/O.
 * - `nextNonce()` increments locally — no server round-trip per tx.
 * - `acknowledgeFailure()` decrements, so a tx that failed BEFORE reaching
 *   the sequencer reuses its nonce (no sequence gap).
 * - `hardRefreshNonce()` re-fetches from the server (used on "invalid nonce"
 *   errors, e.g. after a tx was accepted but the response was lost).
 * - `runExclusive(key, fn)` serializes same-key operations so concurrent
 *   sends on one key reach the sequencer in nonce order; different keys run
 *   in parallel.
 * - `rotateKey()` round-robins across the configured keys — callers pick the
 *   key OUTSIDE the lock so concurrent calls spread across keys.
 */

export type FetchNonceCallback = (apiKeyIndex: number) => Promise<number>;

export interface OptimisticNonceManagerOptions {
  /** API key indexes available for signing (rotation order). */
  apiKeys: number[];
  /** Fetches the next server nonce for a key (HTTP GET /api/v1/nextNonce). */
  fetchNonce: FetchNonceCallback;
}

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

export class OptimisticNonceManager {
  private readonly apiKeys: number[];
  private readonly fetchNonce: FetchNonceCallback;
  /** apiKeyIndex → last assigned nonce (base = server - 1). */
  private readonly nonce = new Map<number, number>();
  /** apiKeyIndex → promise-chain mutex. */
  private readonly locks = new Map<number, Promise<void>>();
  /** apiKeyIndex → in-flight base fetch. */
  private readonly fetching = new Map<number, Promise<number>>();
  private current = 0;

  constructor(options: OptimisticNonceManagerOptions) {
    if (options.apiKeys.length === 0) {
      throw new Error('OptimisticNonceManager: at least one API key is required');
    }
    this.apiKeys = [...options.apiKeys];
    this.fetchNonce = options.fetchNonce;
  }

  /** Round-robin to the next API key (call outside the per-key lock). */
  rotateKey(): number {
    this.current = (this.current + 1) % this.apiKeys.length;
    return this.apiKeys[this.current];
  }

  /** All configured API keys. */
  getApiKeys(): number[] {
    return [...this.apiKeys];
  }

  /**
   * Ensure the base nonce for a key is fetched (lazy, single-flight).
   * Base = server_nonce - 1 so the first `nextNonce()` returns server_nonce.
   */
  private async ensureBase(apiKeyIndex: number): Promise<void> {
    if (this.nonce.has(apiKeyIndex)) return;
    let fetch = this.fetching.get(apiKeyIndex);
    if (!fetch) {
      fetch = this.fetchNonce(apiKeyIndex);
      this.fetching.set(apiKeyIndex, fetch);
    }
    try {
      const serverNonce = await fetch;
      if (!this.nonce.has(apiKeyIndex)) {
        this.nonce.set(apiKeyIndex, serverNonce - 1);
      }
    } finally {
      this.fetching.delete(apiKeyIndex);
    }
  }

  /**
   * Get the next nonce for a key. Lazy-fetches the base on first use.
   * Callers should hold the key's lock (runExclusive) when assigning AND
   * sending so same-key txs arrive in nonce order.
   */
  async nextNonce(apiKeyIndex: number): Promise<number> {
    await this.ensureBase(apiKeyIndex);
    const next = (this.nonce.get(apiKeyIndex) ?? 0) + 1;
    this.nonce.set(apiKeyIndex, next);
    return next;
  }

  /**
   * Take `count` sequential nonces for a batch (same key, one lock scope).
   * On batch failure, call `acknowledgeFailure(key, count)` to roll all back.
   */
  async nextNonces(apiKeyIndex: number, count: number): Promise<number[]> {
    await this.ensureBase(apiKeyIndex);
    const base = this.nonce.get(apiKeyIndex) ?? 0;
    const nonces: number[] = [];
    for (let i = 1; i <= count; i++) nonces.push(base + i);
    this.nonce.set(apiKeyIndex, base + count);
    return nonces;
  }

  /**
   * A tx failed before reaching the sequencer — roll back the assigned
   * nonce(s) so the next send reuses them. `count` defaults to 1.
   */
  acknowledgeFailure(apiKeyIndex: number, count = 1): void {
    if (!this.nonce.has(apiKeyIndex)) return;
    const rolled = (this.nonce.get(apiKeyIndex) ?? 0) - count;
    this.nonce.set(apiKeyIndex, rolled);
  }

  /**
   * The sequencer's nonce got out of sync (e.g. "invalid nonce" after a lost
   * response) — re-fetch the base from the server. Base = server - 1 so the
   * next `nextNonce()` uses the server's value.
   */
  async hardRefreshNonce(apiKeyIndex: number): Promise<void> {
    const serverNonce = await this.fetchNonce(apiKeyIndex);
    this.nonce.set(apiKeyIndex, serverNonce - 1);
  }

  /** True if the error is a nonce-sequence error from the venue. */
  static isNonceError(error: any): boolean {
    if (!error) return false;
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return msg.includes('invalid nonce');
  }

  /**
   * Run `fn` while holding the per-key mutex. Same-key operations queue in
   * submission order; different keys run in parallel.
   */
  async runExclusive<T>(apiKeyIndex: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(apiKeyIndex) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(apiKeyIndex, prev.then(() => gate));

    try {
      await prev;
      return await fn();
    } finally {
      release();
    }
  }
}