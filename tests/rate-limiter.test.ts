import { RateLimiter } from '../src/utils/rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('allows up to maxRequests immediately', () => {
    const rl = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
    expect(rl.availableSlots()).toBe(3);
    expect(rl.msUntilNextSlot()).toBe(0);
    rl.recordRequest();
    rl.recordRequest();
    expect(rl.availableSlots()).toBe(1);
    rl.recordRequest();
    expect(rl.availableSlots()).toBe(0);
    expect(rl.msUntilNextSlot()).toBeGreaterThan(0);
  });

  test('frees slots after the window elapses', () => {
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 1_000 });
    rl.recordRequest();
    rl.recordRequest();
    expect(rl.availableSlots()).toBe(0);
    jest.advanceTimersByTime(1_100);
    expect(rl.availableSlots()).toBe(2);
    expect(rl.msUntilNextSlot()).toBe(0);
  });

  test('tryRun returns null when no slots are available', async () => {
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const first = await rl.tryRun(async () => 'ok');
    expect(first).toBe('ok');
    const second = await rl.tryRun(async () => 'nope');
    expect(second).toBeNull();
  });

  test('run() queues requests that exceed the bucket', async () => {
    jest.useRealTimers();
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 50 });
    const order: string[] = [];

    const p1 = rl.run(async () => { order.push('a'); return 1; });
    const p2 = rl.run(async () => { order.push('b'); return 2; });
    const p3 = rl.run(async () => { order.push('c'); return 3; });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(order).toEqual(['a', 'b', 'c']);
    expect([r1, r2, r3]).toEqual([1, 2, 3]);
  });

  test('clearQueue rejects queued requests', async () => {
    const rl = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
    await rl.run(async () => 1); // fills the bucket
    const pending = rl.run(async () => 2);
    rl.clearQueue();
    await expect(pending).rejects.toThrow('dropped');
  });
});