import { OptimisticNonceManager } from '../src/utils/nonce-manager-v2';

function makeManager(servers: Record<number, number>, keys = [0]) {
  const fetches: number[][] = [];
  const fetch = async (apiKeyIndex: number) => {
    if (!fetches[apiKeyIndex]) fetches[apiKeyIndex] = [];
    fetches[apiKeyIndex].push(servers[apiKeyIndex]);
    return servers[apiKeyIndex];
  };
  const mgr = new OptimisticNonceManager({ apiKeys: keys, fetchNonce: fetch });
  return { mgr, fetches };
}

describe('OptimisticNonceManager (lighter-python parity)', () => {
  test('lazily fetches base nonce on first use only', async () => {
    const { mgr, fetches } = makeManager({ 0: 100 });
    expect(fetches[0]).toBeUndefined(); // no I/O on construction

    const n1 = await mgr.nextNonce(0);
    const n2 = await mgr.nextNonce(0);
    const n3 = await mgr.nextNonce(0);

    expect([n1, n2, n3]).toEqual([100, 101, 102]);
    expect(fetches[0]).toEqual([100]); // exactly one server fetch
  });

  test('acknowledgeFailure decrements so a failed tx reuses its nonce', async () => {
    const { mgr } = makeManager({ 0: 50 });
    const n1 = await mgr.nextNonce(0); // 50
    mgr.acknowledgeFailure(0); // tx never reached the sequencer
    const n2 = await mgr.nextNonce(0);
    expect(n2).toBe(50); // reuses the failed nonce
    const n3 = await mgr.nextNonce(0);
    expect(n3).toBe(51);
  });

  test('hardRefreshNonce re-syncs from the server', async () => {
    const servers: Record<number, number> = { 0: 10 };
    const { mgr } = makeManager(servers);
    await mgr.nextNonce(0); // 10

    // Sequencer moved ahead (e.g. lost response consumed the nonce)
    servers[0] = 25;
    await mgr.hardRefreshNonce(0);
    const n = await mgr.nextNonce(0);
    expect(n).toBe(25);
  });

  test('nextNonces takes a sequential batch and acknowledgeFailure rolls back count', async () => {
    const { mgr } = makeManager({ 0: 200 });
    const batch = await mgr.nextNonces(0, 3);
    expect(batch).toEqual([200, 201, 202]);

    mgr.acknowledgeFailure(0, 3);
    const retry = await mgr.nextNonces(0, 2);
    expect(retry).toEqual([200, 201]);
  });

  test('per-key state is independent', async () => {
    const { mgr } = makeManager({ 0: 10, 1: 500 }, [0, 1]);
    expect(await mgr.nextNonce(0)).toBe(10);
    expect(await mgr.nextNonce(1)).toBe(500);
    expect(await mgr.nextNonce(0)).toBe(11);
    expect(await mgr.nextNonce(1)).toBe(501);
  });

  test('rotateKey round-robins across configured keys', () => {
    const { mgr } = makeManager({ 0: 1, 1: 1, 2: 1 }, [0, 1, 2]);
    expect(mgr.rotateKey()).toBe(1);
    expect(mgr.rotateKey()).toBe(2);
    expect(mgr.rotateKey()).toBe(0);
    expect(mgr.rotateKey()).toBe(1);
  });

  test('runExclusive serializes same-key operations in submission order', async () => {
    const { mgr } = makeManager({ 0: 1 });
    const order: number[] = [];

    // Start 5 concurrent same-key operations; each awaits inside the lock.
    const ops = Array.from({ length: 5 }, (_, i) =>
      mgr.runExclusive(0, async () => {
        const nonce = await mgr.nextNonce(0);
        // Simulate variable async latency
        await new Promise((r) => setTimeout(r, (5 - i) * 5));
        order.push(nonce);
        return nonce;
      }),
    );
    const nonces = await Promise.all(ops);

    // Nonces must be assigned AND recorded in lock acquisition order (1..5)
    expect(order).toEqual([1, 2, 3, 4, 5]);
    expect(nonces).toEqual([1, 2, 3, 4, 5]);
  });

  test('runExclusive releases the lock when the operation throws', async () => {
    const { mgr } = makeManager({ 0: 1 });
    await expect(
      mgr.runExclusive(0, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Lock must be free — the next op runs and completes
    const n = await mgr.runExclusive(0, async () => mgr.nextNonce(0));
    expect(n).toBe(1);
  });

  test('different keys run in parallel (no cross-key blocking)', async () => {
    const { mgr } = makeManager({ 0: 1, 1: 1 }, [0, 1]);
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => { releaseA = r; });

    const a = mgr.runExclusive(0, async () => {
      await gateA; // hold key 0's lock
      return 'a';
    });
    const b = mgr.runExclusive(1, async () => 'b'); // key 1 must not block

    expect(await b).toBe('b');
    releaseA();
    expect(await a).toBe('a');
  });

  test('isNonceError matches venue nonce errors', () => {
    expect(OptimisticNonceManager.isNonceError(new Error('invalid nonce'))).toBe(true);
    expect(OptimisticNonceManager.isNonceError(new Error('Invalid Nonce: expected 5, got 4'))).toBe(true);
    expect(OptimisticNonceManager.isNonceError(new Error('insufficient margin'))).toBe(false);
    expect(OptimisticNonceManager.isNonceError(null)).toBe(false);
  });

  test('requires at least one API key', () => {
    expect(() => new OptimisticNonceManager({ apiKeys: [], fetchNonce: async () => 1 })).toThrow();
  });
});