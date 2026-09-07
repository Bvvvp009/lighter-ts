import { EventEmitter } from 'events';
import { SignerClient, OrderType, TimeInForce, type CreateOrderParams } from '../signer/wasm-signer-client';
import { WasmSignerClient } from '../signer/wasm-signer';
import { WsPrivateClient } from '../ws/ws-private-client';
import { TransactionApi } from '../api/transaction-api';
import { logger } from '../utils/logger';
import { RateLimiter } from '../utils/rate-limiter';
import { OptimisticNonceManager } from '../utils/nonce-manager-v2';
import { NETWORKS } from '../network';
import {
  resolveAttributionFromEnv,
  verifyRegistryIntegrity,
  type AttributionDecision,
} from '../attribution';

// ============================================================================
// Types
// ============================================================================

export interface WsExecutorConfig {
  /** Fallback to HTTP if WS send fails (default true). */
  httpFallback?: boolean;
  /** Shared rate limiter for HTTP fallback sends (default: no limiting). */
  rateLimiter?: RateLimiter;
  /** Timeout for WS tx responses before falling back (default 5000). */
  wsTxTimeoutMs?: number;
  /**
   * Venue used to resolve partner attribution for orders that arrive without
   * integrator fields. Defaults to the signer's configured network.
   */
  attributionNetwork?: string;
}

export interface PlaceOrderResult {
  clientOrderIndex: number;
  txHash: string;
  txInfo: any;
  error: string | null;
}

export interface CancelResult {
  txHash: string;
  error: string | null;
}

export interface RequoteParams {
  /** Orders to cancel (marketIndex + orderIndex pairs). */
  cancels: Array<{ marketIndex: number; orderIndex: number }>;
  /** Orders to place. */
  creates: CreateOrderParams[];
}

export interface RequoteResult {
  cancelHashes: string[];
  createHashes: string[];
  errors: string[];
}

export interface EmergencyStopResult {
  cancelAllHash: string | null;
  flattenHashes: string[];
  errors: string[];
}

// ============================================================================
// WsExecutor
// ============================================================================

/**
 * WsExecutor executes signed transactions for market-making strategies over
 * the merged WsPrivateClient (/stream) — one socket for subscriptions AND
 * order submission (lighter-python parity).
 *
 * Submission path per operation:
 *   1. Pick an API key (round-robin across apiPrivateKeys, outside the lock).
 *   2. Hold the key's nonce lock: assign nonce(s), sign via WASM, submit.
 *   3. WS `jsonapi/sendtx` / `jsonapi/sendtxbatch` (verified wire format).
 *   4. On failure: nonce repair (decrement or hard-refresh on invalid nonce),
 *      then a single HTTP fallback (rate-limited) if enabled.
 *
 * A full requote (cancel old + place new) is ONE sendtxbatch message.
 */
export class WsExecutor extends EventEmitter {
  private signer: SignerClient;
  /** Cast to access private members: wallet (WasmSignerClient), config, apiClient */
  private signerInternal: any;
  private ws: WsPrivateClient;
  private transactionApi: TransactionApi;
  private httpFallback: boolean;
  private rateLimiter: RateLimiter | null;
  private wsTxTimeoutMs: number;
  /** Optimistic nonce manager with per-key locks + rotation. */
  private nonceManager: OptimisticNonceManager;
  /** Default API key (single-key accounts). */
  private defaultApiKeyIndex: number;
  /** Venue for attribution fallback; resolved once in the constructor. */
  private attributionNetwork: string | undefined;
  /** Lazily-resolved attribution fallback (see `attributionFallback`). */
  private attributionDecision: AttributionDecision | null = null;
  private attributionResolved = false;

  constructor(
    signer: SignerClient,
    wsClient: WsPrivateClient,
    config?: WsExecutorConfig,
  ) {
    super();
    this.signer = signer;
    this.signerInternal = signer as any;
    this.ws = wsClient;
    this.transactionApi = new TransactionApi(this.signerInternal.apiClient);
    this.httpFallback = config?.httpFallback ?? true;
    this.rateLimiter = config?.rateLimiter ?? null;
    this.wsTxTimeoutMs = config?.wsTxTimeoutMs ?? 5000;
    this.nonceManager = signer.getOptimisticNonceManager();
    this.defaultApiKeyIndex = this.signerInternal.config.apiKeyIndex;
    verifyRegistryIntegrity();
    this.attributionNetwork = config?.attributionNetwork ?? this.inferNetworkName();
  }

  /**
   * Best-effort venue name from the signer config, for attribution fallback.
   * Accepts a `Network` object, a registry name, or a bare API URL.
   */
  private inferNetworkName(): string | undefined {
    const cfg = this.signerInternal?.config ?? {};
    const net = cfg.network;
    if (typeof net === 'string') return net;
    if (net && typeof net === 'object' && typeof net.name === 'string') return net.name;
    const url = typeof cfg.url === 'string' ? cfg.url.replace(new RegExp('/+$'), '') : '';
    if (url) {
      for (const entry of Object.values(NETWORKS)) {
        if (entry.apiUrl.replace(new RegExp('/+$'), '') === url) return entry.name;
      }
    }
    return undefined;
  }

  /**
   * Partner-attribution enforcement, layer 3 of 3 — the last line before the
   * WASM signer. Orders that reach here without integrator fields (a caller
   * that never set them, or a strategy config that lost them) still get
   * attributed, so attribution cannot be dropped by editing a single call
   * site. Honours the user's opt-out: when `BUILDER_ATTRIBUTION=off` the
   * decision is `enabled: false` and the fields stay zero.
   */
  private attributionFallback(): AttributionDecision | null {
    if (this.attributionResolved) return this.attributionDecision;
    this.attributionResolved = true;
    if (!this.attributionNetwork) return null;
    try {
      this.attributionDecision = resolveAttributionFromEnv(this.attributionNetwork);
    } catch (err) {
      logger.warning(`Attribution fallback unavailable: ${(err as Error).message}`);
      this.attributionDecision = null;
    }
    return this.attributionDecision;
  }

  // --------------------------------------------------------------------------
  // Connection management — delegated to the merged WsPrivateClient
  // --------------------------------------------------------------------------

  /** Connect the merged WS client (idempotent). */
  async connectWs(): Promise<void> {
    if (!this.ws.isConnectedToWebSocket()) {
      await this.ws.connect();
    }
    this.emit('wsConnected');
  }

  /** Disconnect the merged WS client. */
  async disconnectWs(): Promise<void> {
    await this.ws.destroy();
    this.emit('wsDisconnected');
  }

  /** Check if WS is ready for sending. */
  isWsReady(): boolean {
    return this.ws.isConnectedToWebSocket();
  }

  // --------------------------------------------------------------------------
  // Internal: sign + submit with nonce management
  // --------------------------------------------------------------------------

  /** Pick the API key for the next operation (rotation, outside the lock). */
  private pickApiKey(): number {
    const keys = this.nonceManager.getApiKeys();
    if (keys.length <= 1) return this.defaultApiKeyIndex;
    return this.nonceManager.rotateKey();
  }

  /**
   * Sign + submit ONE tx over WS while holding the key's nonce lock.
   * `sign` receives the assigned nonce. On WS failure, nonce repair runs and
   * (if enabled) a single HTTP fallback re-signs with a fresh nonce.
   */
  private async signAndSend(
    apiKeyIndex: number,
    sign: (nonce: number) => Promise<{ txType: number; txInfo: string; txHash?: string; error?: string }>,
  ): Promise<{ txHash: string; error: string | null }> {
    return this.nonceManager.runExclusive(apiKeyIndex, async () => {
      const nonce = await this.nonceManager.nextNonce(apiKeyIndex);
      let signed;
      try {
        signed = await sign(nonce);
      } catch (e) {
        this.nonceManager.acknowledgeFailure(apiKeyIndex);
        return { txHash: '', error: e instanceof Error ? e.message : String(e) };
      }
      if (signed.error) {
        // Signing failed locally — the nonce was never sent.
        this.nonceManager.acknowledgeFailure(apiKeyIndex);
        return { txHash: '', error: signed.error };
      }

      // Submit over WS
      if (this.isWsReady()) {
        try {
          const resp = await this.withTimeout(
            this.ws.sendTransaction(signed.txType, signed.txInfo),
            this.wsTxTimeoutMs,
            'jsonapi/sendtx',
          );
          if (resp.code === 200) {
            const hash = typeof resp.tx_hash === 'string' ? resp.tx_hash : '';
            return { txHash: hash || signed.txHash || '', error: null };
          }
          // Server rejected: if nonce-related, the nonce WAS consumed.
          if (!isNonceErrorFromResponse(resp)) {
            // Non-nonce rejection: nonce not consumed by the sequencer
            // (e.g. invalid params). Roll back to avoid a gap.
            this.nonceManager.acknowledgeFailure(apiKeyIndex);
          } else {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          }
          const errMsg = formatWsError(resp);
          logger.warning('WsExecutor: WS tx rejected', { error: errMsg });
          return { txHash: '', error: errMsg };
        } catch (wsError) {
          // Timeout / disconnect: the tx MAY have reached the sequencer.
          // Hard-refresh so the next nonce comes from the server.
          const errMsg = wsError instanceof Error ? wsError.message : String(wsError);
          logger.warning('WsExecutor: WS send failed', { error: errMsg });
          this.emit('wsError', { operation: 'signAndSend', error: wsError });
          try {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          } catch {}
          if (!this.httpFallback) {
            return { txHash: '', error: errMsg };
          }
          // fall through to HTTP fallback below
        }
      } else {
        // WS not connected — release the lock scope and use the HTTP path.
        // (Still under the lock: same key must stay serialized.)
      }

      // HTTP fallback — re-sign with a fresh nonce from the same key.
      try {
        const freshNonce = await this.nonceManager.nextNonce(apiKeyIndex);
        const resubmitted = await sign(freshNonce);
        if (resubmitted.error) {
          this.nonceManager.acknowledgeFailure(apiKeyIndex);
          return { txHash: '', error: resubmitted.error };
        }
        const send = async () => {
          const resp = await this.transactionApi.sendTxWithIndices(
            resubmitted.txType,
            resubmitted.txInfo,
            this.signerInternal.config.accountIndex,
            apiKeyIndex,
          );
          return resp;
        };
        const resp = this.rateLimiter ? await this.rateLimiter.run(send) : await send();
        if (resp.code !== undefined && resp.code !== 200) {
          const errMsg = resp.message || `sendTx failed with code ${resp.code}`;
          if (errMsg.toLowerCase().includes('invalid nonce')) {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          } else {
            this.nonceManager.acknowledgeFailure(apiKeyIndex);
          }
          return { txHash: '', error: errMsg };
        }
        const hash = (resp as any).tx_hash || (resp as any).hash || resubmitted.txHash || '';
        return { txHash: hash, error: null };
      } catch (httpError) {
        const errMsg = httpError instanceof Error ? httpError.message : String(httpError);
        if (OptimisticNonceManager.isNonceError(httpError)) {
          try {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          } catch {}
        } else {
          this.nonceManager.acknowledgeFailure(apiKeyIndex);
        }
        this.emit('error', { operation: 'signAndSend', error: httpError });
        return { txHash: '', error: errMsg };
      }
    });
  }

  /**
   * Sign + submit a BATCH over WS as one sendtxbatch message, under a single
   * key's lock with sequential nonces.
   */
  private async signAndSendBatch(
    apiKeyIndex: number,
    count: number,
    signMany: (nonces: number[]) => Promise<
      Array<{ txType: number; txInfo: string; txHash?: string; error?: string }>
    >,
  ): Promise<{ txHashes: string[]; errors: string[] }> {
    return this.nonceManager.runExclusive(apiKeyIndex, async () => {
      const nonces = await this.nonceManager.nextNonces(apiKeyIndex, count);
      let signed;
      try {
        signed = await signMany(nonces);
      } catch (e) {
        this.nonceManager.acknowledgeFailure(apiKeyIndex, count);
        const errMsg = e instanceof Error ? e.message : String(e);
        return { txHashes: [], errors: [errMsg] };
      }
      const signErrors = signed.filter((s) => s.error).map((s) => s.error!);
      if (signErrors.length > 0) {
        // Nothing was submitted — roll back all assigned nonces.
        this.nonceManager.acknowledgeFailure(apiKeyIndex, count);
        return { txHashes: [], errors: signErrors };
      }

      const txTypes = signed.map((s) => s.txType);
      const txInfos = signed.map((s) => s.txInfo);

      // Submit over WS as one batch message
      if (this.isWsReady()) {
        try {
          const resp = await this.withTimeout(
            this.ws.sendBatchTransactions(txTypes, txInfos),
            this.wsTxTimeoutMs,
            'jsonapi/sendtxbatch',
          );
          if (resp.code === 200) {
            const raw = resp.tx_hash;
            const hashes = Array.isArray(raw) ? raw.map(String) : [String(raw ?? '')];
            return { txHashes: hashes, errors: [] };
          }
          if (!isNonceErrorFromResponse(resp)) {
            this.nonceManager.acknowledgeFailure(apiKeyIndex, count);
          } else {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          }
          const errMsg = formatWsError(resp);
          return { txHashes: [], errors: [errMsg] };
        } catch (wsError) {
          const errMsg = wsError instanceof Error ? wsError.message : String(wsError);
          logger.warning('WsExecutor: WS batch send failed', { error: errMsg });
          this.emit('wsError', { operation: 'signAndSendBatch', error: wsError });
          try {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          } catch {}
          if (!this.httpFallback) {
            return { txHashes: [], errors: [errMsg] };
          }
          // fall through to HTTP fallback
        }
      }

      // HTTP fallback — one sendTxBatch request (re-sign with fresh nonces)
      try {
        const freshNonces = await this.nonceManager.nextNonces(apiKeyIndex, count);
        const resubmitted = await signMany(freshNonces);
        const reErrors = resubmitted.filter((s) => s.error).map((s) => s.error!);
        if (reErrors.length > 0) {
          this.nonceManager.acknowledgeFailure(apiKeyIndex, count);
          return { txHashes: [], errors: reErrors };
        }
        const send = async () => {
          const resp = await this.transactionApi.sendTransactionBatch({
            tx_types: JSON.stringify(resubmitted.map((s) => s.txType)),
            tx_infos: JSON.stringify(resubmitted.map((s) => s.txInfo)),
          });
          return resp;
        };
        const resp = this.rateLimiter ? await this.rateLimiter.run(send) : await send();
        const raw: any = (resp as any).tx_hash ?? (resp as any).hashes ?? [];
        const code = (resp as any).code;
        if (code !== undefined && code !== 200 && raw.length === 0) {
          const errMsg = (resp as any).message || `sendTxBatch failed with code ${code}`;
          if (errMsg.toLowerCase().includes('invalid nonce')) {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          } else {
            this.nonceManager.acknowledgeFailure(apiKeyIndex, count);
          }
          return { txHashes: [], errors: [errMsg] };
        }
        const hashes = (Array.isArray(raw) ? raw : [raw]).map(String);
        return { txHashes: hashes, errors: [] };
      } catch (httpError) {
        const errMsg = httpError instanceof Error ? httpError.message : String(httpError);
        if (OptimisticNonceManager.isNonceError(httpError)) {
          try {
            await this.nonceManager.hardRefreshNonce(apiKeyIndex);
          } catch {}
        } else {
          this.nonceManager.acknowledgeFailure(apiKeyIndex, count);
        }
        this.emit('error', { operation: 'signAndSendBatch', error: httpError });
        return { txHashes: [], errors: [errMsg] };
      }
    });
  }

  /** Reject a promise if it doesn't settle within `ms`. */
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  // --------------------------------------------------------------------------
  // Public operations
  // --------------------------------------------------------------------------

  /** Place a single order (WS jsonapi/sendtx, HTTP fallback). */
  async placeOrder(params: CreateOrderParams): Promise<PlaceOrderResult> {
    const clientOrderIndex = params.clientOrderIndex;
    const apiKeyIndex = this.pickApiKey();

    const result = await this.signAndSend(apiKeyIndex, (nonce) =>
      this.signCreateOrderTx(apiKeyIndex, params, nonce),
    );

    if (result.error) {
      this.emit('error', { operation: 'placeOrder', error: new Error(result.error) });
      return { clientOrderIndex, txHash: '', txInfo: null, error: result.error };
    }
    this.emit('orderPlaced', { clientOrderIndex, txHash: result.txHash, apiKeyIndex });
    return { clientOrderIndex, txHash: result.txHash, txInfo: null, error: null };
  }

  /** Cancel a single order (WS, HTTP fallback). */
  async cancelOrder(marketIndex: number, orderIndex: number): Promise<CancelResult> {
    const apiKeyIndex = this.pickApiKey();
    const result = await this.signAndSend(apiKeyIndex, (nonce) =>
      this.signCancelOrderTx(apiKeyIndex, marketIndex, orderIndex, nonce),
    );
    if (result.error) {
      this.emit('error', { operation: 'cancelOrder', error: new Error(result.error) });
      return { txHash: '', error: result.error };
    }
    this.emit('orderCanceled', { marketIndex, orderIndex, txHash: result.txHash });
    return { txHash: result.txHash, error: null };
  }

  /**
   * Cancel all orders. If marketIndex is provided, cancels only that market;
   * otherwise cancels all markets (255 = NIL_MARKET_INDEX). time=0 = now.
   */
  async cancelAllOrders(marketIndex?: number): Promise<CancelResult> {
    const cancelMarketIndex = marketIndex ?? 255;
    const apiKeyIndex = this.pickApiKey();
    const result = await this.signAndSend(apiKeyIndex, (nonce) =>
      this.signCancelAllTx(apiKeyIndex, 0, 0, cancelMarketIndex, nonce),
    );
    if (result.error) {
      this.emit('error', { operation: 'cancelAllOrders', error: new Error(result.error) });
      return { txHash: '', error: result.error };
    }
    this.emit('cancelAllSent', { marketIndex: cancelMarketIndex, txHash: result.txHash });
    return { txHash: result.txHash, error: null };
  }

  /**
   * Atomically cancel old orders and place new ones — ONE sendtxbatch message
   * (or ONE sendTxBatch HTTP request on fallback). Up to 15 txs total.
   */
  async requote(params: RequoteParams): Promise<RequoteResult> {
    const totalTx = params.cancels.length + params.creates.length;
    if (totalTx === 0) {
      return { cancelHashes: [], createHashes: [], errors: [] };
    }
    if (totalTx > 15) {
      return {
        cancelHashes: [],
        createHashes: [],
        errors: [`Batch size ${totalTx} exceeds max 15`],
      };
    }

    const apiKeyIndex = this.pickApiKey();
    const result = await this.signAndSendBatch(apiKeyIndex, totalTx, async (nonces) => {
      const signed: Array<{ txType: number; txInfo: string; txHash?: string; error?: string }> = [];
      let nonceIdx = 0;

      for (const cancel of params.cancels) {
        const s = await this.signCancelOrderTx(apiKeyIndex, cancel.marketIndex, cancel.orderIndex, nonces[nonceIdx++]);
        signed.push(s);
      }
      for (const create of params.creates) {
        const s = await this.signCreateOrderTx(apiKeyIndex, create, nonces[nonceIdx++]);
        signed.push(s);
      }
      return signed;
    });

    if (result.errors.length > 0) {
      this.emit('error', { operation: 'requote', error: new Error(result.errors.join('; ')) });
      return { cancelHashes: [], createHashes: [], errors: result.errors };
    }

    this.emit('batchSent', {
      cancels: params.cancels.length,
      creates: params.creates.length,
      hashes: result.txHashes,
    });

    const cancelHashes = result.txHashes.slice(0, params.cancels.length);
    const createHashes = result.txHashes.slice(params.cancels.length);
    return { cancelHashes, createHashes, errors: [] };
  }

  /**
   * Emergency stop: cancel all orders, then flatten positions via the
   * 'emergencyStopFlatten' event (the strategy provides position data).
   */
  async emergencyStop(): Promise<EmergencyStopResult> {
    const errors: string[] = [];
    let cancelAllHash: string | null = null;

    try {
      const cancelResult = await this.cancelAllOrders();
      cancelAllHash = cancelResult.txHash || null;
      if (cancelResult.error) {
        errors.push(`cancelAll: ${cancelResult.error}`);
      }
    } catch (e) {
      errors.push(`cancelAll: ${e instanceof Error ? e.message : String(e)}`);
    }

    this.emit('emergencyStop', { phase: 'orders_canceled', errors });
    this.emit('emergencyStopFlatten', { errors });

    return { cancelAllHash, flattenHashes: [], errors };
  }

  /** Modify an existing order (HTTP path — SignerClient handles it). */
  async modifyOrder(
    marketIndex: number,
    orderIndex: number,
    baseAmount: number,
    price: number,
    triggerPrice: number = 0,
    nonce?: number,
  ): Promise<CancelResult> {
    try {
      const [, txHash, error] = await this.signer.modifyOrder(
        marketIndex,
        orderIndex,
        baseAmount,
        price,
        triggerPrice,
        nonce ?? -1,
      );
      this.emit('orderModified', { marketIndex, orderIndex, txHash });
      return { txHash, error };
    } catch (httpError) {
      const errMsg = httpError instanceof Error ? httpError.message : String(httpError);
      this.emit('error', { operation: 'modifyOrder', error: httpError });
      return { txHash: '', error: errMsg };
    }
  }

  // --------------------------------------------------------------------------
  // Internal: WASM signing helpers
  // --------------------------------------------------------------------------

  private async signCreateOrderTx(
    apiKeyIndex: number,
    params: CreateOrderParams,
    nonce: number,
  ): Promise<{ txType: number; txInfo: string; txHash?: string; error?: string }> {
    const orderExpiry = params.orderExpiry ?? Date.now() + 28 * 24 * 60 * 60 * 1000;
    const timeInForce = params.timeInForce ?? TimeInForce.GOOD_TILL_TIME;

    const wasmResp = await (this.signerInternal.wallet as WasmSignerClient).signCreateOrder({
      marketIndex: params.marketIndex,
      clientOrderIndex: params.clientOrderIndex,
      baseAmount: params.baseAmount,
      price: params.price,
      isAsk: params.isAsk ? 1 : 0,
      orderType: params.orderType ?? OrderType.LIMIT,
      timeInForce,
      reduceOnly: (params.reduceOnly ?? false) ? 1 : 0,
      triggerPrice: params.triggerPrice ?? 0,
      orderExpiry: timeInForce === TimeInForce.IMMEDIATE_OR_CANCEL ? 0 : orderExpiry,
      ...this.resolveIntegratorFields(params),
      selfTradeBehaviorMode: (params as any).selfTradeBehaviorMode ?? 0,
      selfTradeEqualityMode: (params as any).selfTradeEqualityMode ?? 0,
      skipNonce: 0,
      nonce,
      apiKeyIndex,
      accountIndex: this.signerInternal.config.accountIndex,
    });

    if (wasmResp.error) {
      return { txType: 0, txInfo: '', error: wasmResp.error };
    }
    return { txType: wasmResp.txType || 14, txInfo: wasmResp.txInfo, txHash: wasmResp.txHash };
  }

  /**
   * Integrator fields for an outgoing order: whatever the caller supplied,
   * else the venue's attribution fallback, else zeros.
   */
  private resolveIntegratorFields(params: CreateOrderParams): {
    integratorAccountIndex: number;
    integratorTakerFee: number;
    integratorMakerFee: number;
  } {
    const supplied = params.integratorAccountIndex;
    if (supplied !== undefined && supplied > 0) {
      return {
        integratorAccountIndex: supplied,
        integratorTakerFee: params.integratorTakerFee ?? 0,
        integratorMakerFee: params.integratorMakerFee ?? 0,
      };
    }
    if (supplied === 0) {
      // Explicit opt-out by the caller - respected verbatim.
      return { integratorAccountIndex: 0, integratorTakerFee: 0, integratorMakerFee: 0 };
    }
    const decision = this.attributionFallback();
    if (decision && decision.enabled) {
      return {
        integratorAccountIndex: decision.accountIndex,
        integratorTakerFee: decision.takerFee,
        integratorMakerFee: decision.makerFee,
      };
    }
    return { integratorAccountIndex: 0, integratorTakerFee: 0, integratorMakerFee: 0 };
  }

  private async signCancelOrderTx(
    apiKeyIndex: number,
    marketIndex: number,
    orderIndex: number,
    nonce: number,
  ): Promise<{ txType: number; txInfo: string; txHash?: string; error?: string }> {
    const wasmResp = await (this.signerInternal.wallet as WasmSignerClient).signCancelOrder({
      marketIndex,
      orderIndex,
      nonce,
      apiKeyIndex,
      accountIndex: this.signerInternal.config.accountIndex,
    });

    if (wasmResp.error) {
      return { txType: 0, txInfo: '', error: wasmResp.error };
    }
    return { txType: wasmResp.txType || 15, txInfo: wasmResp.txInfo, txHash: wasmResp.txHash };
  }

  private async signCancelAllTx(
    apiKeyIndex: number,
    timeInForce: number,
    time: number,
    marketIndex: number,
    nonce: number,
  ): Promise<{ txType: number; txInfo: string; txHash?: string; error?: string }> {
    const wasmResp = await (this.signerInternal.wallet as WasmSignerClient).signCancelAllOrders({
      timeInForce,
      time,
      cancelAllMarketIndex: marketIndex,
      nonce,
      apiKeyIndex,
      accountIndex: this.signerInternal.config.accountIndex,
    });

    if (wasmResp.error) {
      return { txType: 0, txInfo: '', error: wasmResp.error };
    }
    return { txType: wasmResp.txType || 16, txInfo: wasmResp.txInfo, txHash: wasmResp.txHash };
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  async destroy(): Promise<void> {
    await this.disconnectWs();
    this.removeAllListeners();
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isNonceErrorFromResponse(resp: any): boolean {
  const msg = String(resp?.error?.message ?? '').toLowerCase();
  return msg.includes('invalid nonce');
}

function formatWsError(resp: any): string {
  const code = resp?.error?.code ?? 'UNKNOWN';
  const msg = resp?.error?.message ?? JSON.stringify(resp);
  return `[${code}] ${msg}`;
}