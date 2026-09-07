/**
 * Token-bucket rate limiter for signed transaction endpoints.
 *
 * Robinhood allows 40 requests / 60 seconds (others differ). Signed tx
 * submissions (sendTx / sendTxBatch / nextNonce) all count against the same
 * budget, so all callers share one limiter instance.
 */
export interface RateLimiterOptions {
  /** Max requests per window. */
  maxRequests: number;
  /** Window size in ms. */
  windowMs: number;
}

interface ScheduledRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: number;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  /** Timestamps of recently-allowed requests (sliding window). */
  private recent: number[] = [];
  private queue: ScheduledRequest<any>[] = [];
  private draining = false;

  constructor(options: Partial<RateLimiterOptions> = {}) {
    this.maxRequests = options.maxRequests ?? 40;
    this.windowMs = options.windowMs ?? 60_000;
  }

  /** Milliseconds until the next slot frees up (0 = available now). */
  msUntilNextSlot(): number {
    const now = Date.now();
    this.recent = this.recent.filter((t) => now - t < this.windowMs);
    if (this.recent.length < this.maxRequests) return 0;
    const oldest = this.recent[0]!;
    const wait = this.windowMs - (now - oldest);
    return Math.max(wait, 0);
  }

  /** Number of requests currently allowed without waiting. */
  availableSlots(): number {
    const now = Date.now();
    this.recent = this.recent.filter((t) => now - t < this.windowMs);
    return Math.max(this.maxRequests - this.recent.length, 0);
  }

  /** Record an external request that already happened (e.g. WS attempt). */
  recordRequest(): void {
    this.recent.push(Date.now());
  }

  /**
   * Run `fn` as soon as a rate slot is available. Requests submitted while
   * the bucket is empty are queued FIFO and executed when slots free up.
   * Lower `priority` runs first when the queue backs up (default 0).
   */
  async run<T>(fn: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, priority });
      this.drain();
    });
  }

  /** Try to run `fn` immediately if a slot is free; returns null otherwise. */
  async tryRun<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.msUntilNextSlot() > 0) return null;
    this.recordRequest();
    return fn();
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;

    const step = () => {
      // Sort by priority (lower first), stable within same priority
      if (this.queue.length > 0) {
        this.queue.sort((a, b) => a.priority - b.priority);
      }

      const next = this.queue.shift();
      if (!next) {
        this.draining = false;
        return;
      }

      const wait = this.msUntilNextSlot();
      if (wait > 0) {
        // Put it back at the front and wait
        this.queue.unshift(next);
        setTimeout(step, wait);
        return;
      }

      this.recordRequest();
      next
        .fn()
        .then(next.resolve, (err: Error) => next.reject(err))
        .finally(() => {
          // Continue draining on next tick of the event loop
          if (this.queue.length > 0) {
            setImmediate(step);
          } else {
            this.draining = false;
          }
        });
    };

    step();
  }

  /** Drop all queued requests (used on shutdown). */
  clearQueue(): void {
    const dropped = this.queue.splice(0);
    for (const req of dropped) {
      req.reject(new Error('RateLimiter: request dropped (shutdown)'));
    }
  }
}

/**
 * Robinhood public API rate limit (measured): 40 requests / 60 seconds.
 * Use a conservative 36 to leave headroom for retries and WS auth.
 */
export function createRobinhoodRateLimiter(): RateLimiter {
  return new RateLimiter({ maxRequests: 36, windowMs: 60_000 });
}