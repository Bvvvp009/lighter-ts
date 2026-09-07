/**
 * Grid ladder placement and tracking.
 *
 * `relevelGrid` builds the ladder as one batched requote and then registers
 * every create with the order tracker. Those two halves have to agree on the
 * price, because `refillFilledLevels` decides which levels are still resting by
 * looking the TRACKED price up in a Set. When the registration re-derived one
 * price for the whole batch (`center +/- spacing`, dropping the level index),
 * levels 2..N read as missing and were re-placed on top of orders that were
 * already live — a real position on a real venue, not just a wrong log line.
 *
 * So the assertions below are deliberately about the seam: wire prices, tracked
 * prices, and the refill decision that reads them.
 */

import { EventEmitter } from 'events';
import { GridStrategy, type GridStrategyConfig } from '../src/strategies/grid-strategy';

// --------------------------------------------------------------------------
// Test doubles — only the surface the strategy actually touches.
// --------------------------------------------------------------------------

interface OpenOrder {
  orderIndex: number;
  isAsk: boolean;
  price: number;
}

class FakeTracker extends EventEmitter {
  position: { sign: number; size: number } | undefined;
  orders: OpenOrder[] = [];
  registered: any[] = [];

  getPosition() {
    return this.position;
  }
  getOpenOrdersByMarket() {
    return this.orders;
  }
  getOpenOrderCountByMarket() {
    return this.orders.length;
  }
  registerOrder(p: any) {
    this.registered.push(p);
  }
  getAllPositions() {
    return this.position ? [this.position] : [];
  }
}

class FakeExecutor extends EventEmitter {
  requotes: any[] = [];
  placed: any[] = [];
  cancelAllCalls = 0;

  async requote(params: any) {
    this.requotes.push(params);
    return { cancelled: [], created: [], errors: [] };
  }
  async placeOrder(params: any) {
    this.placed.push(params);
    return { txHash: '0xdead', error: undefined };
  }
  async cancelAllOrders() {
    this.cancelAllCalls += 1;
    return { cancelled: [], errors: [] };
  }
}

const BASE_SCALE = 1e5;
const QUOTE_SCALE = 10; // BTC on Lighter: 1 price decimal
const CENTER = 80_000;
const SPACING = 40;
const LEVELS = 3;

function makeStrategy(overrides: Partial<GridStrategyConfig> = {}) {
  const tracker = new FakeTracker();
  const executor = new FakeExecutor();
  const config = {
    marketId: 1,
    accountId: 1,
    maxPositionSize: 1000,
    maxOpenOrders: 50,
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    tickIntervalMs: 1000,
    gridLevels: LEVELS,
    gridSpacing: SPACING,
    orderSize: 15,
    autoRecenter: true,
    relevelThreshold: 10,
    attributionNetwork: 'mainnet',
    ...overrides,
  } as GridStrategyConfig;

  const s = new GridStrategy(
    config,
    {} as any,
    new EventEmitter() as any,
    executor as any,
    tracker as any,
  );
  // Normally loaded from the exchange during start(); pin it so the unit
  // conversions are deterministic instead of hitting the fallbacks.
  (s as any).marketConfig = { baseScale: BASE_SCALE, quoteScale: QUOTE_SCALE };
  return { s, tracker, executor, config };
}

const relevel = (s: GridStrategy, center = CENTER) => (s as any).relevelGrid(center) as Promise<void>;
const refill = (s: GridStrategy, center = CENTER) =>
  (s as any).refillFilledLevels(center) as Promise<void>;

/** The creates from the one requote a single relevel produces. */
function creates(executor: FakeExecutor): any[] {
  expect(executor.requotes).toHaveLength(1);
  return executor.requotes[0].creates;
}

/**
 * Pretend the exchange accepted the batch: every registered order is now
 * resting, at the price the tracker holds for it.
 */
function makeRestingFromTracker(tracker: FakeTracker): void {
  tracker.orders = tracker.registered.map((r, i) => ({
    orderIndex: i + 1,
    isAsk: r.isAsk,
    price: r.price,
  }));
}

// --------------------------------------------------------------------------

describe('GridStrategy — the ladder that reaches the wire', () => {
  it('places one bid and one ask per level, spaced by i * spacing', async () => {
    const { s, executor } = makeStrategy();
    await relevel(s);

    const c = creates(executor);
    expect(c).toHaveLength(LEVELS * 2);

    const bids = c.filter((o) => !o.isAsk).map((o) => o.price / QUOTE_SCALE);
    const asks = c.filter((o) => o.isAsk).map((o) => o.price / QUOTE_SCALE);

    expect(bids.sort((a, b) => b - a)).toEqual([79_960, 79_920, 79_880]);
    expect(asks.sort((a, b) => a - b)).toEqual([80_040, 80_080, 80_120]);
  });

  it('quotes every level at a distinct price', async () => {
    const { s, executor } = makeStrategy();
    await relevel(s);
    const prices = creates(executor).map((o) => `${o.isAsk ? 'A' : 'B'}${o.price}`);
    expect(new Set(prices).size).toBe(prices.length);
  });

  it('gives every order its own clientOrderIndex', async () => {
    const { s, executor } = makeStrategy();
    await relevel(s);
    const cois = creates(executor).map((o) => o.clientOrderIndex);
    expect(new Set(cois).size).toBe(cois.length);
  });
});

describe('GridStrategy — what the tracker is told', () => {
  it('registers each level at the price that level was actually placed at', async () => {
    // The regression. Registration used to recompute `center +/- spacing` for
    // the whole batch, so all three bids were recorded at 79,960.
    const { s, tracker, executor } = makeStrategy();
    await relevel(s);

    const byCoi = new Map<number, number>(
      creates(executor).map((o) => [o.clientOrderIndex, o.price / QUOTE_SCALE]),
    );
    expect(tracker.registered).toHaveLength(LEVELS * 2);
    for (const r of tracker.registered) {
      expect(r.price).toBe(byCoi.get(r.clientOrderIndex));
    }
  });

  it('records as many distinct prices as it placed', async () => {
    const { s, tracker } = makeStrategy();
    await relevel(s);
    const prices = tracker.registered.map((r) => `${r.isAsk ? 'A' : 'B'}${r.price}`);
    expect(new Set(prices).size).toBe(LEVELS * 2);
  });
});

describe('GridStrategy — refill after a relevel', () => {
  it('re-places nothing while the whole ladder is still resting', async () => {
    // The consequence of the tracked price being wrong: levels 2..N looked
    // missing, so each refill stacked a second order at prices that already
    // had one.
    const { s, tracker, executor } = makeStrategy();
    await relevel(s);
    makeRestingFromTracker(tracker);

    await refill(s);
    expect(executor.placed).toEqual([]);
  });

  it('re-places exactly the level that is gone', async () => {
    const { s, tracker, executor } = makeStrategy();
    await relevel(s);
    makeRestingFromTracker(tracker);

    // Level 2's bid fills and stops resting.
    const gone = 79_920;
    tracker.orders = tracker.orders.filter((o) => o.price !== gone);

    await refill(s);
    expect(executor.placed).toHaveLength(1);
    expect(executor.placed[0].isAsk).toBe(false);
    expect(executor.placed[0].price / QUOTE_SCALE).toBe(gone);
  });

  it('stays quiet across repeated refills', async () => {
    const { s, tracker, executor } = makeStrategy();
    await relevel(s);
    makeRestingFromTracker(tracker);

    await refill(s);
    await refill(s);
    await refill(s);
    expect(executor.placed).toEqual([]);
  });
});

describe('GridStrategy — attribution reaches every order', () => {
  it('stamps the integrator index and both fees on all creates', async () => {
    const { s, executor } = makeStrategy({
      builderIntegratorIndex: 692603,
      integratorTakerFee: 200,
      integratorMakerFee: 50,
    } as Partial<GridStrategyConfig>);
    await relevel(s);

    const c = creates(executor);
    expect(c).toHaveLength(LEVELS * 2);
    for (const o of c) {
      expect(o.integratorAccountIndex).toBe(692603);
      expect(o.integratorTakerFee).toBe(200);
      expect(o.integratorMakerFee).toBe(50);
    }
  });

  it('omits the fields entirely when attribution is off, rather than sending zeros', async () => {
    const { s, executor } = makeStrategy();
    await relevel(s);
    for (const o of creates(executor)) {
      expect('integratorAccountIndex' in o).toBe(false);
      expect('integratorTakerFee' in o).toBe(false);
      expect('integratorMakerFee' in o).toBe(false);
    }
  });
});

// --------------------------------------------------------------------------
// The batch cap. Found live: three consecutive
//   [WARNING] Grid relevel errors: Batch size 16 exceeds max 15
// in a two-minute run, i.e. the grid had stopped relevelling and only stopped
// growing because the run ended.
//
// requote() rejects an oversized batch whole, and a relevel is
// `cancels + 2*levels` txs, so at the shipped default of 5 levels a
// steady-state relevel is 20 txs and never lands at all.
// --------------------------------------------------------------------------

/** `n` resting orders with real order indexes, so `cancels` is non-empty. */
function resting(tracker: FakeTracker, n: number): void {
  tracker.orders = Array.from({ length: n }, (_, i) => ({
    orderIndex: i + 1,
    isAsk: i % 2 === 0,
    price: CENTER + i,
  }));
}

const totalTx = (r: any) => r.cancels.length + r.creates.length;

describe('GridStrategy — the 15-tx batch cap', () => {
  it('keeps a relevel that fits in one batch', async () => {
    const { s, tracker, executor } = makeStrategy();
    resting(tracker, LEVELS * 2); // 6 cancels + 6 creates = 12
    await relevel(s);
    expect(executor.requotes).toHaveLength(1);
  });

  it('splits an oversized relevel instead of dropping it', async () => {
    const { s, tracker, executor } = makeStrategy({ gridLevels: 5 });
    resting(tracker, 10); // 10 cancels + 10 creates = 20 > 15

    await relevel(s);

    expect(executor.requotes.length).toBeGreaterThan(1);
    for (const r of executor.requotes) {
      expect(totalTx(r)).toBeLessThanOrEqual(15);
    }
    // The split moves the work, it does not drop any of it.
    expect(executor.requotes.reduce((n, r) => n + r.cancels.length, 0)).toBe(10);
    expect(executor.requotes.reduce((n, r) => n + r.creates.length, 0)).toBe(10);
  });

  it('chunks cancels that exceed the cap on their own', async () => {
    const { s, tracker, executor } = makeStrategy({ gridLevels: 5 });
    resting(tracker, 18); // needs two cancel batches

    await relevel(s);

    const cancelBatches = executor.requotes.filter((r) => r.cancels.length > 0);
    expect(cancelBatches.length).toBe(2);
    expect(executor.requotes.reduce((n, r) => n + r.cancels.length, 0)).toBe(18);
  });

  it('sends every cancel before the first create', async () => {
    // Creates-first would rest the new ladder alongside the old one and double
    // exposure. Cancels-first costs a moment with no quotes instead.
    const { s, tracker, executor } = makeStrategy({ gridLevels: 5 });
    resting(tracker, 10);

    await relevel(s);

    let lastCancel = -1;
    let firstCreate = Infinity;
    executor.requotes.forEach((r, i) => {
      if (r.cancels.length > 0) lastCancel = i;
      if (r.creates.length > 0 && i < firstCreate) firstCreate = i;
    });
    expect(lastCancel).toBeLessThan(firstCreate);
  });
});

describe('GridStrategy — a rejected batch is not recorded as placed', () => {
  it('registers nothing when the requote is rejected', async () => {
    // The ratchet: registration used to run unconditionally after the error was
    // logged, so a rejected batch left the tracker holding 2*levels orders the
    // venue never saw. The next relevel built a cancel for each phantom, so the
    // batch grew every cycle and the grid never recovered.
    const { s, tracker, executor } = makeStrategy();
    executor.requote = async (params: any) => {
      executor.requotes.push(params);
      return { cancelled: [], created: [], errors: ['Batch size 16 exceeds max 15'] };
    };

    await relevel(s);

    expect(executor.requotes.length).toBeGreaterThan(0);
    expect(tracker.registered).toEqual([]);
  });

  it('still registers what it placed when the requote succeeds', async () => {
    const { s, tracker } = makeStrategy();
    await relevel(s);
    expect(tracker.registered).toHaveLength(LEVELS * 2);
  });

  it('registers only the chunks that landed', async () => {
    // A split relevel can land some create batches and lose others; the tracker
    // should end up holding exactly the ones that went out.
    const { s, tracker, executor } = makeStrategy({ gridLevels: 5 });
    resting(tracker, 18);
    let createBatch = 0;
    executor.requote = async (params: any) => {
      executor.requotes.push(params);
      const fail = params.creates.length > 0 && createBatch++ === 0;
      return {
        cancelled: [],
        created: [],
        errors: fail ? ['rejected'] : [],
      };
    };

    await relevel(s);

    const sent = executor.requotes.filter((r) => r.creates.length > 0);
    const landed = sent.slice(1).reduce((n, r) => n + r.creates.length, 0);
    expect(tracker.registered).toHaveLength(landed);
  });
});
