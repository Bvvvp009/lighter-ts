/**
 * Avellaneda-Stoikov model tests.
 *
 * These assert against the paper's closed forms rather than against whatever
 * the implementation happens to produce, because live money rides on the sign
 * conventions: a reservation price that leans the wrong way makes the maker ADD
 * to a losing position instead of unwinding it.
 */

import { EventEmitter } from 'events';
import {
  AvellanedaStoikovMM,
  type AvellanedaStoikovConfig,
} from '../src/strategies/avellaneda-stoikov-mm';
import { BUILDER_ACCOUNTS } from '../src/attribution/builder-registry';

// --------------------------------------------------------------------------
// Test doubles — only the surface the strategy actually touches.
// --------------------------------------------------------------------------

class FakeTracker extends EventEmitter {
  position: { sign: number; size: number } | undefined;
  orders: Array<{ orderIndex: number; isAsk: boolean }> = [];
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
  cancelAllCalls = 0;
  async requote(params: any) {
    this.requotes.push(params);
    return { cancelled: [], created: [], errors: [] };
  }
  async cancelAllOrders() {
    this.cancelAllCalls += 1;
    return { cancelled: [], errors: [] };
  }
}

const BASE_SCALE = 1e5;
const QUOTE_SCALE = 100;
const MID = 100_000;

function makeStrategy(overrides: Partial<AvellanedaStoikovConfig> = {}) {
  const tracker = new FakeTracker();
  const executor = new FakeExecutor();
  const config = {
    marketId: 1,
    accountId: 1,
    maxPositionSize: 1000,
    maxOpenOrders: 4,
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    tickIntervalMs: 1000,
    orderSize: 100,
    attributionNetwork: 'mainnet',
    ...overrides,
  } as AvellanedaStoikovConfig;

  const s = new AvellanedaStoikovMM(
    config,
    {} as any,
    new EventEmitter() as any,
    executor as any,
    tracker as any,
  );
  // marketConfig is normally loaded from the exchange during start(); pin it so
  // the unit conversions are deterministic instead of hitting the fallbacks.
  (s as any).marketConfig = { baseScale: BASE_SCALE, quoteScale: QUOTE_SCALE };
  return { s, tracker, executor, config };
}

/** Give the strategy a position of `units` base units (negative = short). */
function setPosition(tracker: FakeTracker, units: number): void {
  tracker.position = { sign: units < 0 ? -1 : 1, size: Math.abs(units) / BASE_SCALE };
}

/** Drive the private volatility estimator to a known state. */
function feedMids(s: AvellanedaStoikovMM, mids: number[], stepMs = 1000): void {
  let t = 1_000_000;
  for (const m of mids) {
    (s as any).updateVolatility(m, t);
    t += stepMs;
  }
}

function setBook(s: AvellanedaStoikovMM, mid = MID): void {
  (s as any).marketData = {
    bestBid: mid - 100,
    bestAsk: mid + 100,
    midPrice: mid,
    markPrice: mid,
    indexPrice: mid,
    spread: 200,
    lastUpdatedAt: Date.now(),
  };
}

// --------------------------------------------------------------------------

describe('AvellanedaStoikov — reservation price', () => {
  it('equals the fair price when inventory is flat', () => {
    const { s } = makeStrategy({ sigma: 50, gamma: 0.5, infiniteHorizon: true });
    const q = s.computeQuotes(MID);
    expect(q.inventoryRatio).toBe(0);
    expect(q.reservationPrice).toBeCloseTo(MID, 6);
  });

  it('sits BELOW the mid when long — the maker pays to get flat', () => {
    const { s, tracker } = makeStrategy({ sigma: 50, gamma: 0.5, infiniteHorizon: true });
    setPosition(tracker, 500);
    const q = s.computeQuotes(MID);
    expect(q.inventoryRatio).toBeCloseTo(0.5, 9);
    // r = s - q*gamma*sigma^2*(T-t) = 100000 - 0.5*0.5*2500*1
    expect(q.reservationPrice).toBeCloseTo(MID - 625, 6);
  });

  it('sits ABOVE the mid when short', () => {
    const { s, tracker } = makeStrategy({ sigma: 50, gamma: 0.5, infiniteHorizon: true });
    setPosition(tracker, -500);
    const q = s.computeQuotes(MID);
    expect(q.inventoryRatio).toBeCloseTo(-0.5, 9);
    expect(q.reservationPrice).toBeCloseTo(MID + 625, 6);
  });

  it('leans harder as gamma rises', () => {
    const a = makeStrategy({ sigma: 50, gamma: 0.2, infiniteHorizon: true });
    const b = makeStrategy({ sigma: 50, gamma: 2.0, infiniteHorizon: true });
    setPosition(a.tracker, 500);
    setPosition(b.tracker, 500);
    const skewA = MID - a.s.computeQuotes(MID).reservationPrice;
    const skewB = MID - b.s.computeQuotes(MID).reservationPrice;
    expect(skewA).toBeCloseTo(250, 6);
    expect(skewB).toBeCloseTo(2500, 6);
    expect(skewB).toBeGreaterThan(skewA);
  });

  it('clamps normalised inventory to [-1, 1] past the position limit', () => {
    const { s, tracker } = makeStrategy({ sigma: 50, gamma: 0.5, infiniteHorizon: true });
    setPosition(tracker, 5000); // 5x maxPositionSize
    expect(s.computeQuotes(MID).inventoryRatio).toBe(1);
    setPosition(tracker, -5000);
    expect(s.computeQuotes(MID).inventoryRatio).toBe(-1);
  });

  it('treats inventoryTargetFraction as the neutral point', () => {
    const { s, tracker } = makeStrategy({
      sigma: 50,
      gamma: 0.5,
      infiniteHorizon: true,
      inventoryTargetFraction: 0.5,
    });
    setPosition(tracker, 500); // exactly at target
    const q = s.computeQuotes(MID);
    expect(q.inventoryRatio).toBeCloseTo(0, 9);
    expect(q.reservationPrice).toBeCloseTo(MID, 6);
  });
});

describe('AvellanedaStoikov — optimal spread', () => {
  it('matches gamma*sigma^2*(T-t) + (2/gamma)*ln(1+gamma/kappa)', () => {
    const gamma = 0.5;
    const kappa = 1.5;
    const sigma = 50;
    const { s } = makeStrategy({ sigma, gamma, kappa, infiniteHorizon: true });
    const expected = gamma * sigma * sigma * 1 + (2 / gamma) * Math.log(1 + gamma / kappa);
    expect(s.computeQuotes(MID).optimalSpread).toBeCloseTo(expected, 9);
  });

  it('falls back to the risk-neutral 2/kappa markup as gamma -> 0', () => {
    // (2/gamma)*ln(1+gamma/k) is 0/0 at gamma=0. Since ln(1+x) -> x, the limit
    // of the TOTAL spread is 2/k, i.e. 1/k per side. Getting this wrong halves
    // the spread discontinuously the moment someone sets gamma=0.
    const kappa = 1.5;
    const { s } = makeStrategy({ sigma: 50, gamma: 0, kappa, infiniteHorizon: true });
    expect(s.computeQuotes(MID).optimalSpread).toBeCloseTo(2 / kappa, 9);

    // The removable discontinuity must actually be removed: approaching zero
    // from above has to land on the same value the gamma=0 branch returns.
    for (const gamma of [1e-4, 1e-6, 1e-9]) {
      const tiny = makeStrategy({ sigma: 50, gamma, kappa, infiniteHorizon: true });
      // the gamma*sigma^2*(T-t) term contributes gamma*2500, subtract it out
      expect(tiny.s.computeQuotes(MID).optimalSpread - gamma * 2500).toBeCloseTo(2 / kappa, 4);
    }
  });

  it('widens with volatility and narrows with kappa', () => {
    const lowVol = makeStrategy({ sigma: 10, gamma: 0.5, kappa: 1.5, infiniteHorizon: true });
    const highVol = makeStrategy({ sigma: 100, gamma: 0.5, kappa: 1.5, infiniteHorizon: true });
    expect(highVol.s.computeQuotes(MID).optimalSpread).toBeGreaterThan(
      lowVol.s.computeQuotes(MID).optimalSpread,
    );

    const lowK = makeStrategy({ sigma: 50, gamma: 0.5, kappa: 0.5, infiniteHorizon: true });
    const highK = makeStrategy({ sigma: 50, gamma: 0.5, kappa: 5, infiniteHorizon: true });
    expect(highK.s.computeQuotes(MID).optimalSpread).toBeLessThan(
      lowK.s.computeQuotes(MID).optimalSpread,
    );
  });

  it('quotes symmetrically around the reservation price', () => {
    const { s, tracker } = makeStrategy({ sigma: 50, gamma: 0.5, infiniteHorizon: true });
    setPosition(tracker, 300);
    const q = s.computeQuotes(MID);
    expect(q.reservationPrice - q.bidPrice).toBeCloseTo(q.askPrice - q.reservationPrice, 9);
    expect(q.askPrice - q.bidPrice).toBeCloseTo(2 * q.halfSpread, 9);
  });
});

describe('AvellanedaStoikov — half-spread clamps (live safety)', () => {
  it('clamps a volatility blow-up down to maxHalfSpreadBps', () => {
    // Unclamped, sigma=5000 on a 100k mid quotes somewhere that can never fill.
    const { s } = makeStrategy({
      sigma: 5000,
      gamma: 0.5,
      infiniteHorizon: true,
      maxHalfSpreadBps: 50,
    });
    const q = s.computeQuotes(MID);
    expect(q.halfSpread).toBeCloseTo((MID * 50) / 10000, 9);
    expect(q.optimalSpread / 2).toBeGreaterThan(q.halfSpread);
  });

  it('clamps a dead-quiet book up to minHalfSpreadBps', () => {
    const { s } = makeStrategy({
      sigma: 0,
      gamma: 0.5,
      kappa: 1e6,
      infiniteHorizon: true,
      minHalfSpreadBps: 2,
    });
    const q = s.computeQuotes(MID);
    expect(q.halfSpread).toBeCloseTo((MID * 2) / 10000, 9);
    expect(q.optimalSpread / 2).toBeLessThan(q.halfSpread);
  });

  it('never inverts the quote, at any volatility or inventory', () => {
    for (const sigma of [0, 1, 50, 500, 5000]) {
      for (const units of [-2000, -500, 0, 500, 2000]) {
        const { s, tracker } = makeStrategy({ sigma, gamma: 0.5, infiniteHorizon: true });
        setPosition(tracker, units);
        const q = s.computeQuotes(MID);
        expect(q.askPrice).toBeGreaterThan(q.bidPrice);
        expect(q.halfSpread).toBeGreaterThan(0);
      }
    }
  });
});

describe('AvellanedaStoikov — time horizon', () => {
  it('decays (T-t) from 1 to 0 across the session', () => {
    const { s } = makeStrategy({ sigma: 50, timeHorizonMs: 1000 });
    const t0 = Date.now();
    (s as any).sessionStart = t0;
    expect((s as any).timeToHorizon(t0)).toBeCloseTo(1, 9);
    expect((s as any).timeToHorizon(t0 + 500)).toBeCloseTo(0.5, 9);
    expect((s as any).timeToHorizon(t0 + 900)).toBeCloseTo(0.1, 9);
  });

  it('restarts the session instead of freezing at zero', () => {
    // Freezing at (T-t)=0 silently drops the inventory-risk term, so a
    // long-running maker would stop skewing against inventory entirely.
    const { s } = makeStrategy({ sigma: 50, timeHorizonMs: 1000 });
    const t0 = Date.now();
    (s as any).sessionStart = t0;
    expect((s as any).timeToHorizon(t0 + 1500)).toBeCloseTo(1, 9);
    expect((s as any).sessionStart).toBe(t0 + 1500);
  });

  it('pins (T-t)=1 forever under infiniteHorizon', () => {
    const { s } = makeStrategy({ sigma: 50, infiniteHorizon: true, timeHorizonMs: 1000 });
    expect((s as any).timeToHorizon(Date.now() + 10_000_000)).toBe(1);
  });

  it('shrinks the inventory skew as the session closes', () => {
    const { s, tracker } = makeStrategy({ sigma: 50, gamma: 0.5, timeHorizonMs: 1000 });
    setPosition(tracker, 500);
    const t0 = Date.now();
    (s as any).sessionStart = t0;
    const early = MID - s.computeQuotes(MID, t0 + 100).reservationPrice;
    (s as any).sessionStart = t0;
    const late = MID - s.computeQuotes(MID, t0 + 900).reservationPrice;
    expect(early).toBeCloseTo(562.5, 6);
    expect(late).toBeCloseTo(62.5, 6);
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(0);
  });
});

describe('AvellanedaStoikov — volatility estimation', () => {
  it('uses the bps floor until enough samples have arrived', () => {
    const { s } = makeStrategy({ minVolatilitySamples: 20, fallbackVolatilityBps: 5 });
    feedMids(s, [MID, MID + 100, MID - 100]);
    expect(s.computeQuotes(MID).sigma).toBeCloseTo((MID * 5) / 10000, 9);
  });

  it('reports a larger sigma for a choppier tape', () => {
    const calm = makeStrategy({ minVolatilitySamples: 5 });
    const wild = makeStrategy({ minVolatilitySamples: 5 });
    feedMids(calm.s, Array.from({ length: 40 }, (_, i) => MID + (i % 2 ? 5 : -5)));
    feedMids(wild.s, Array.from({ length: 40 }, (_, i) => MID + (i % 2 ? 400 : -400)));
    expect(wild.s.computeQuotes(MID).sigma).toBeGreaterThan(calm.s.computeQuotes(MID).sigma);
  });

  it('never returns a sigma below the floor', () => {
    const { s } = makeStrategy({ minVolatilitySamples: 5, fallbackVolatilityBps: 10 });
    feedMids(s, Array.from({ length: 40 }, () => MID)); // perfectly frozen book
    expect(s.computeQuotes(MID).sigma).toBeCloseTo((MID * 10) / 10000, 9);
  });

  it('honours an explicitly pinned sigma over the live estimate', () => {
    const { s } = makeStrategy({ sigma: 123, minVolatilitySamples: 1 });
    feedMids(s, Array.from({ length: 40 }, (_, i) => MID + i * 100));
    expect(s.computeQuotes(MID).sigma).toBe(123);
  });

  it('decays by elapsed time, not by sample count', () => {
    // A stalled feed must not freeze the estimator: one sample an hour later
    // should almost entirely replace the old variance.
    const { s } = makeStrategy({ minVolatilitySamples: 1, volatilityHalfLifeMs: 1000 });
    let t = 1_000_000;
    (s as any).updateVolatility(MID, t);
    (s as any).updateVolatility(MID + 500, (t += 1000)); // big move
    const after = (s as any).ewmaVariance;
    expect(after).toBeGreaterThan(0);
    (s as any).updateVolatility(MID + 500, (t += 3_600_000)); // an hour of nothing
    expect((s as any).ewmaVariance).toBeLessThan(after * 0.01);
  });
});

describe('AvellanedaStoikov — config validation', () => {
  it('rejects a negative gamma', () => {
    expect(() => makeStrategy({ gamma: -1 })).toThrow(/gamma/);
  });
  it('rejects a non-positive kappa', () => {
    expect(() => makeStrategy({ kappa: 0 })).toThrow(/kappa/);
    expect(() => makeStrategy({ kappa: -1 })).toThrow(/kappa/);
  });
  it('rejects NaN parameters', () => {
    expect(() => makeStrategy({ gamma: NaN })).toThrow(/gamma/);
    expect(() => makeStrategy({ kappa: NaN })).toThrow(/kappa/);
  });
  it('accepts gamma = 0 (risk-neutral)', () => {
    expect(() => makeStrategy({ gamma: 0 })).not.toThrow();
  });
});

describe('AvellanedaStoikov — tick behaviour', () => {
  it('quotes both sides on a flat book', async () => {
    const { s, executor } = makeStrategy({ sigma: 50, infiniteHorizon: true, requoteThreshold: 0 });
    setBook(s);
    await (s as any).onTick();
    expect(executor.requotes).toHaveLength(1);
    const creates = executor.requotes[0].creates;
    expect(creates.map((c: any) => c.isAsk).sort()).toEqual([false, true]);
  });

  it('stops quoting the entry side past maxInventoryFraction', async () => {
    const { s, tracker, executor } = makeStrategy({
      sigma: 50,
      infiniteHorizon: true,
      requoteThreshold: 0,
      maxInventoryFraction: 0.5,
    });
    setBook(s);
    setPosition(tracker, 800); // ratio 0.8 > 0.5 → only the reducing (ask) side
    await (s as any).onTick();
    const creates = executor.requotes[0].creates;
    expect(creates).toHaveLength(1);
    expect(creates[0].isAsk).toBe(true);
  });

  it('mirrors that suppression when short', async () => {
    const { s, tracker, executor } = makeStrategy({
      sigma: 50,
      infiniteHorizon: true,
      requoteThreshold: 0,
      maxInventoryFraction: 0.5,
    });
    setBook(s);
    setPosition(tracker, -800);
    await (s as any).onTick();
    const creates = executor.requotes[0].creates;
    expect(creates).toHaveLength(1);
    expect(creates[0].isAsk).toBe(false);
  });

  it('pulls a crossing quote back to the touch under makerOnly', async () => {
    // A tight model spread would cross a wide book; POST_ONLY would be
    // rejected outright, so the quote is pulled back to the touch instead.
    const { s, executor } = makeStrategy({
      sigma: 0,
      kappa: 1e6,
      infiniteHorizon: true,
      requoteThreshold: 0,
      minHalfSpreadBps: 1, // $10 half-spread vs a $100-wide book
    });
    setBook(s);
    await (s as any).onTick();
    const creates = executor.requotes[0].creates;
    const bid = creates.find((c: any) => !c.isAsk);
    const ask = creates.find((c: any) => c.isAsk);
    expect(bid.price).toBe(Math.round((MID - 100) * QUOTE_SCALE));
    expect(ask.price).toBe(Math.round((MID + 100) * QUOTE_SCALE));
  });

  it('places nothing when the model produces a non-positive price', async () => {
    // Extreme sigma plus full inventory drives the reservation price negative.
    // The tick guard must drop the cycle rather than send a nonsense order.
    const { s, tracker, executor } = makeStrategy({
      sigma: 50_000,
      gamma: 0.5,
      infiniteHorizon: true,
      requoteThreshold: 0,
    });
    setBook(s);
    setPosition(tracker, 1000);
    await (s as any).onTick();
    expect(executor.requotes).toHaveLength(0);
  });

  it('leaves resting orders alone when the quote has not drifted', async () => {
    const { s, tracker, executor } = makeStrategy({
      sigma: 50,
      infiniteHorizon: true,
      requoteThreshold: 1e9,
    });
    setBook(s);
    tracker.orders = [
      { orderIndex: 1, isAsk: false },
      { orderIndex: 2, isAsk: true },
    ];
    await (s as any).onTick();
    expect(executor.requotes).toHaveLength(0);
  });

  it('requotes when a side is missing even below the drift threshold', async () => {
    const { s, tracker, executor } = makeStrategy({
      sigma: 50,
      infiniteHorizon: true,
      requoteThreshold: 1e9,
    });
    setBook(s);
    tracker.orders = [{ orderIndex: 1, isAsk: false }]; // ask side went away
    await (s as any).onTick();
    expect(executor.requotes).toHaveLength(1);
  });

  it('does nothing without market data', async () => {
    const { s, executor } = makeStrategy({ sigma: 50, infiniteHorizon: true });
    await (s as any).onTick();
    expect(executor.requotes).toHaveLength(0);
  });
});

describe('AvellanedaStoikov — attribution', () => {
  it('stamps the builder integrator index on every order it creates', async () => {
    const { s, executor, tracker } = makeStrategy({
      sigma: 50,
      infiniteHorizon: true,
      requoteThreshold: 0,
    });
    setBook(s);
    await (s as any).onTick();

    const creates = executor.requotes[0].creates;
    expect(creates.length).toBeGreaterThan(0);
    for (const c of creates) {
      expect(c.integratorAccountIndex).toBe(BUILDER_ACCOUNTS.mainnet.accountIndex);
      expect(c.integratorTakerFee).toBeGreaterThan(0);
      expect(c.integratorMakerFee).toBeGreaterThan(0);
    }
    // Every created order is also registered, so the tracker can reconcile it.
    expect(tracker.registered).toHaveLength(creates.length);
  });
});
