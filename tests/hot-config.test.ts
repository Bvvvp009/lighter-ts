/**
 * Hot config + tracker unit-consistency tests.
 *
 * These lock the three behaviors the live cross-venue run exposed:
 *
 * 1. Fill/price tracking units: the WS reference sends human amounts
 *    ("0.1") while locally-placed orders are scaled — the tracker must
 *    reconcile them so a fill price is a real dollar price, not a ratio of
 *    mismatched units.
 * 2. updateConfig() hot reload: patches apply on the next cycle and reach
 *    the SUBCLASS config object the strategy logic actually reads, not just
 *    the base copy.
 * 3. The runner's hot-config file: auto-fill, comment-stripping parse, and
 *    change detection (unknown keys never apply).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { OrderTracker } from '../src/strategies/order-tracker';
import { GridStrategy } from '../src/strategies/grid-strategy';
import { PerpetualMMStrategy } from '../src/strategies/perp-mm-strategy';
import { AvellanedaStoikovMM } from '../src/strategies/avellaneda-stoikov-mm';
import { CrossVenueMM } from '../src/strategies/cross-venue-mm';
import {
  setupHotConfig,
  resolveHotConfigPath,
  type HotConfigFile,
} from '../examples/_hotconfig';
import { resolveLogFile } from '../examples/_logging';

/** Shared temp dir for the file-based tests. */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hotconfig-'));

// --------------------------------------------------------------------------
// Test doubles
// --------------------------------------------------------------------------

class FakeSigner {
  calls: Array<{ marketId: number; marginMode: number; leverage: number }> = [];
  async updateLeverage(marketId: number, marginMode: number, leverage: number) {
    this.calls.push({ marketId, marginMode, leverage });
    return [null, 'hash', null];
  }
}

function makeGrid(overrides: Record<string, unknown> = {}) {
  const signer = new FakeSigner();
  const tracker = new EventEmitter() as any;
  tracker.getOpenOrdersByMarket = () => [];
  tracker.getOpenOrderCountByMarket = () => 0;
  tracker.registerOrder = () => {};
  tracker.getPosition = () => undefined;
  tracker.getAllPositions = () => [];
  tracker.setMarketScales = () => {};
  const executor = new EventEmitter() as any;
  executor.requote = async () => ({ errors: [] });
  executor.cancelAllOrders = async () => ({});
  const config = {
    marketId: 1,
    accountId: 1,
    maxPositionSize: 1000,
    maxOpenOrders: 8,
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    tickIntervalMs: 1000,
    gridLevels: 4,
    gridSpacing: 5,
    orderSize: 100,
    ...overrides,
  };
  const s = new GridStrategy(config as any, signer as any, new EventEmitter() as any, executor, tracker);
  return { s, signer, tracker, executor, config };
}

// --------------------------------------------------------------------------
// Tracker: fill price + unit reconciliation
// --------------------------------------------------------------------------

describe('OrderTracker — fill price tracking (unit consistency)', () => {
  it('computes the fill price from quote/base deltas (human units)', () => {
    const tracker = new OrderTracker(1);
    tracker.setMarketScales(1, { baseScale: 1e5, quoteScale: 100 });
    // A registered (scaled) order: 100 scaled = 0.001 base at $50,000.
    tracker.registerOrder({ clientOrderIndex: 1, marketId: 1, isAsk: false, price: 50000, baseAmount: 100 });

    const fills: any[] = [];
    tracker.on('orderFill', (e) => fills.push(e));

    // WS reference format: human strings.
    tracker.processOrderUpdate(
      {
        order_index: 10,
        client_order_index: 1,
        market_index: 1,
        is_ask: false,
        price: '50000.00',
        initial_base_amount: '0.001',
        filled_base_amount: '0.001',
        filled_quote_amount: '50.10',
        remaining_base_amount: '0',
        status: 'filled',
        type: 'limit',
        time_in_force: 'post-only',
        reduce_only: false,
        timestamp: Date.now(),
      } as any,
      1,
    );

    expect(fills).toHaveLength(1);
    // 50.10 / 0.001 = $50,100 — the actual execution price, not the limit.
    expect(fills[0].price).toBeCloseTo(50100, 6);
    expect(fills[0].fillSize).toBeCloseTo(0.001, 9);
    expect(fills[0].fillQuoteAmount).toBeCloseTo(50.1, 6);
  });

  it('reports partial fill slices with their own execution price', () => {
    const tracker = new OrderTracker(1);
    tracker.setMarketScales(1, { baseScale: 1e5, quoteScale: 100 });
    tracker.registerOrder({ clientOrderIndex: 2, marketId: 1, isAsk: true, price: 3000, baseAmount: 1000 });

    const partials: any[] = [];
    tracker.on('orderPartialFill', (e) => partials.push(e));

    const mk = (filledBase: string, filledQuote: string, status = 'open') =>
      ({
        order_index: 11,
        client_order_index: 2,
        market_index: 1,
        is_ask: true,
        price: '3000.00',
        initial_base_amount: '0.01',
        filled_base_amount: filledBase,
        filled_quote_amount: filledQuote,
        remaining_base_amount: '0.006',
        status,
        type: 'limit',
        time_in_force: 'post-only',
        reduce_only: false,
        timestamp: Date.now(),
      }) as any;

    tracker.processOrderUpdate(mk('0.002', '6.02'), 1); // slice @ 3010
    tracker.processOrderUpdate(mk('0.004', '12.05'), 1); // slice @ 3015

    expect(partials).toHaveLength(2);
    expect(partials[0].fillPrice).toBeCloseTo(3010, 6);
    expect(partials[1].fillPrice).toBeCloseTo(3015, 6); // (12.05-6.02)/(0.004-0.002)
    expect(partials[1].fillDelta).toBeCloseTo(0.002, 9);
  });

  it('converts a registered scaled amount to the WS human convention', () => {
    const tracker = new OrderTracker(1);
    // BTC-style market: 1e5 base scale.
    tracker.setMarketScales(1, { baseScale: 1e5, quoteScale: 100 });
    tracker.registerOrder({ clientOrderIndex: 3, marketId: 1, isAsk: false, price: 50000, baseAmount: 500 });
    const order = tracker.getOrderByClientIndex(3)!;
    expect(order.baseAmount).toBeCloseTo(0.005, 9);
    expect(order.remainingBaseAmount).toBeCloseTo(0.005, 9);
  });

  it('falls back to default scales when no market config was injected', () => {
    const tracker = new OrderTracker(1);
    tracker.registerOrder({ clientOrderIndex: 4, marketId: 2, isAsk: false, price: 100, baseAmount: 1e6 });
    const order = tracker.getOrderByClientIndex(4)!;
    expect(order.baseAmount).toBeCloseTo(1, 9);
  });
});

// --------------------------------------------------------------------------
// Hot config: updateConfig reaches the subclass config object
// --------------------------------------------------------------------------

describe('strategy.updateConfig (hot reload)', () => {
  it('applies a pending patch and folds it into the grid config', () => {
    const { s } = makeGrid();
    (s as any).applyPendingConfig(); // no pending — no-op
    expect((s as any).gridConfig.gridSpacing).toBe(5);

    s.updateConfig({ gridSpacing: 25, orderSize: 200 } as any);
    (s as any).applyPendingConfig();

    expect((s as any).gridConfig.gridSpacing).toBe(25);
    expect((s as any).gridConfig.orderSize).toBe(200);
    expect((s as any).getEditableConfig().find((f: any) => f.key === 'gridSpacing')?.get()).toBe(25);
  });

  it('rejects immutable keys silently (marketId, accountId)', () => {
    const { s } = makeGrid();
    s.updateConfig({ marketId: 99 } as any);
    (s as any).applyPendingConfig();
    expect((s as any).gridConfig.marketId).toBe(1);
    expect((s as any).pendingConfig).toBeNull();
  });

  it('queues multiple patches and applies them together', () => {
    const { s } = makeGrid();
    s.updateConfig({ gridSpacing: 10 } as any);
    s.updateConfig({ gridLevels: 6 } as any);
    (s as any).applyPendingConfig();
    expect((s as any).gridConfig.gridSpacing).toBe(10);
    expect((s as any).gridConfig.gridLevels).toBe(6);
  });

  it('marks the strategy dirty after a hot-config apply so the next cycle requotes', () => {
    const { s } = makeGrid();
    expect((s as any).configNeedsRequote()).toBe(false);
    s.updateConfig({ gridSpacing: 25 } as any);
    (s as any).applyPendingConfig();
    // Dirty: drift-based skip must NOT keep the old orders live.
    expect((s as any).configNeedsRequote()).toBe(true);
    // cycleDue reports due immediately (bypasses the cycleMs wait once).
    const due = (s as any).cycleDue(Date.now() + 60_000);
    expect(due.due).toBe(true);
    // Clearing (after the batch) restores normal gating.
    (s as any).markConfigApplied();
    expect((s as any).configNeedsRequote()).toBe(false);
    expect((s as any).cycleDue(Date.now() + 60_000).due).toBe(false);
  });

  it('perp_mm folds patches into its own config object', () => {
    const signer = new FakeSigner();
    const tracker = new EventEmitter() as any;
    tracker.getOpenOrdersByMarket = () => [];
    tracker.getOpenOrderCountByMarket = () => 0;
    tracker.registerOrder = () => {};
    tracker.getPosition = () => undefined;
    tracker.getAllPositions = () => [];
    tracker.setMarketScales = () => {};
    const executor = new EventEmitter() as any;
    const s = new PerpetualMMStrategy(
      {
        marketId: 1, accountId: 1, maxPositionSize: 100, maxOpenOrders: 4,
        makerOnly: true, selfTradeBehavior: 0, reconnectTimeoutMs: 30000,
        tickIntervalMs: 1000, orderSize: 50, bidSpreadBps: 10,
      } as any,
      signer as any, new EventEmitter() as any, executor, tracker,
    );
    s.updateConfig({ bidSpreadBps: 25 } as any);
    (s as any).applyPendingConfig();
    expect((s as any).mmConfig.bidSpreadBps).toBe(25);
  });

  it('A-S re-validates model params on hot update and rejects a bad kappa', () => {
    const signer = new FakeSigner();
    const mkTracker = () => {
      const t = new EventEmitter() as any;
      t.getOpenOrdersByMarket = () => [];
      t.getOpenOrderCountByMarket = () => 0;
      t.registerOrder = () => {};
      t.getPosition = () => undefined;
      t.getAllPositions = () => [];
      t.setMarketScales = () => {};
      return t;
    };
    const executor = new EventEmitter() as any;
    const s = new AvellanedaStoikovMM(
      {
        marketId: 1, accountId: 1, maxPositionSize: 100, maxOpenOrders: 4,
        makerOnly: true, selfTradeBehavior: 0, reconnectTimeoutMs: 30000,
        tickIntervalMs: 1000, orderSize: 50,
      } as any,
      signer as any, new EventEmitter() as any, executor, mkTracker(),
    );
    s.updateConfig({ kappa: 2.5 } as any);
    expect(() => (s as any).applyPendingConfig()).not.toThrow();
    expect((s as any).asConfig.kappa).toBe(2.5);

    s.updateConfig({ kappa: -1 } as any);
    expect(() => (s as any).applyPendingConfig()).toThrow(/kappa/);
  });
});

// --------------------------------------------------------------------------
// Leverage config
// --------------------------------------------------------------------------

describe('leverage config (applied at start)', () => {
  it('strategy config carries leverage into getConfig()', () => {
    const { s } = makeGrid({ leverage: 3 });
    expect(s.getConfig().leverage).toBe(3);
    const field = s.getEditableConfig().find((f: any) => f.key === 'leverage');
    expect(field?.get()).toBe(3);
  });

  it('leverage is ALWAYS in the editable list, even when unset (introducible live)', () => {
    const { s } = makeGrid();
    const field = s.getEditableConfig().find((f: any) => f.key === 'leverage');
    expect(field).toBeDefined();
    expect(field?.get()).toBeUndefined();
  });

  it('validates leverage against the venue min IMF before sending it', async () => {
    const { s, signer } = makeGrid({ leverage: 5 });
    // Venue reports min IMF 2000 bps => max 5x. 5x is allowed...
    (s as any).marketConfig = { minInitialMarginFractionBps: 2000 };
    await expect((s as any).applyLeverage()).resolves.toBeUndefined();
    expect(signer.calls.length).toBe(1);
    // ...but 6x exceeds the cap and must throw BEFORE any tx is signed.
    (s as any).config.leverage = 6;
    await expect((s as any).applyLeverage()).rejects.toThrow(/exceeds this venue's cap/);
    expect(signer.calls.length).toBe(1);
  });
});

describe('CrossVenueMM leverage (per-venue, applied at start)', () => {
  function makeCross(overrides: Record<string, unknown> = {}) {
    const signerA = new FakeSigner();
    const signerB = new FakeSigner();
    const mkVenue = (signer: FakeSigner, tag: string) => ({
      network: 'mainnet',
      signerClient: signer,
      wsPrivate: new EventEmitter(),
      executor: new EventEmitter(),
      tracker: new EventEmitter(),
      tag,
    }) as any;
    const s = new CrossVenueMM(
      {
        marketId: 1,
        accountAId: 1,
        accountBId: 2,
        edgeBps: 5,
        orderSize: 50,
        maxNetPosition: 100,
        maxPositionPerVenue: 100,
        maxOpenOrdersPerVenue: 4,
        hedgeOnFill: true,
        hedgeSlippage: 0.002,
        tickIntervalMs: 1000,
        selfTradeBehavior: 0,
        reconnectTimeoutMs: 30000,
        ...overrides,
      } as any,
      mkVenue(signerA, 'core'),
      mkVenue(signerB, 'rh'),
    );
    return { s, signerA, signerB };
  }

  it('sets the shared leverage on BOTH venues', async () => {
    const { s, signerA, signerB } = makeCross({ leverage: 5 });
    await (s as any).applyLeverage();
    expect(signerA.calls).toEqual([{ marketId: 1, marginMode: 0, leverage: 5 }]);
    expect(signerB.calls).toEqual([{ marketId: 1, marginMode: 0, leverage: 5 }]);
  });

  it('leverageA/leverageB override per venue (venues cap independently)', async () => {
    const { s, signerA, signerB } = makeCross({ leverage: 5, leverageA: 10, leverageB: 2 });
    await (s as any).applyLeverage();
    expect(signerA.calls[0].leverage).toBe(10);
    expect(signerB.calls[0].leverage).toBe(2);
  });

  it('per-venue IMF caps reject an over-cap value BEFORE that venue signs', async () => {
    const { s, signerA, signerB } = makeCross({ leverage: 5, leverageB: 60 });
    // core allows 50x (min IMF 200), rh caps at 50x too — 60x must fail there.
    (s as any).venueMarketConfigs.set('core', { minInitialMarginFractionBps: 200 });
    (s as any).venueMarketConfigs.set('rh', { minInitialMarginFractionBps: 200 });
    await expect((s as any).applyLeverage()).rejects.toThrow(/venue rh's cap.*max 50x/);
    // core's (valid) 5x update may have been sent, but rh's 60x never was.
    expect(signerB.calls.length).toBe(0);
    expect(signerA.calls.every((c) => c.leverage <= 50)).toBe(true);
  });

  it('leverage fields are always listed even when unset', () => {
    const { s } = makeCross();
    const keys = (s.getEditableConfig() as any[]).map((f) => f.key);
    expect(keys).toContain('leverage');
    expect(keys).toContain('leverageA');
    expect(keys).toContain('leverageB');
  });

  it('marks config dirty on hot apply so the quotesFresh skip cannot hold the old quotes', () => {
    const { s } = makeCross();
    expect((s as any).configDirty).toBe(false);
    s.updateConfig({ edgeBps: 25 } as any);
    (s as any).applyPendingConfig();
    expect((s as any).configDirty).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Runner hot-config file
// --------------------------------------------------------------------------

describe('examples/_hotconfig', () => {
  afterEach(() => {
    delete process.env.MM_HOT_CONFIG;
  });

  it('is off by default', () => {
    delete process.env.MM_HOT_CONFIG;
    expect(resolveHotConfigPath()).toBeNull();
    expect(resolveLogFile('mm-x')).toBeNull();
  });

  it('resolves 1/on to mm-config.json and honors an explicit path', () => {
    process.env.MM_HOT_CONFIG = '1';
    expect(resolveHotConfigPath()).toBe(path.join(process.cwd(), 'mm-config.json'));
    const custom = path.join(TMP, 'custom.json');
    process.env.MM_HOT_CONFIG = custom;
    expect(resolveHotConfigPath()).toBe(custom);
  });

  it('writes an auto-filled file with labels and parses it back', () => {
    const file = path.join(TMP, 'auto.json');
    process.env.MM_HOT_CONFIG = file;
    const hot = setupHotConfig();
    hot.writeInitial([
      { key: 'gridSpacing', label: 'Grid spacing ($)', value: 25 },
      { key: 'gridLevels', label: 'Grid levels per side', value: 4 },
      { key: 'orderSize', label: 'Order size (base units)', value: 100 },
    ]);
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('"gridSpacing": 25, // Grid spacing ($)');
    expect(text.toLowerCase()).toContain('without a restart');

    // Round-trip: no changes vs known → {}.
    const known: HotConfigFile = { gridSpacing: 25, gridLevels: 4, orderSize: 100 };
    expect(hot.readChanges(known)).toEqual({});
  });

  it('detects changed values and ignores unknown keys', () => {
    const file = path.join(TMP, 'change.json');
    process.env.MM_HOT_CONFIG = file;
    fs.writeFileSync(file, '{\n  "gridSpacing": 40, // new\n  "hackerKey": 1\n}\n', 'utf8');
    const hot = setupHotConfig();
    const changes = hot.readChanges({ gridSpacing: 25, orderSize: 100 });
    expect(changes).toEqual({ gridSpacing: 40 }); // unknown key dropped
  });

  it('returns {} on a malformed file instead of throwing', () => {
    const file = path.join(TMP, 'bad.json');
    process.env.MM_HOT_CONFIG = file;
    fs.writeFileSync(file, '{ not json', 'utf8');
    const hot = setupHotConfig();
    expect(hot.readChanges({ gridSpacing: 25 })).toEqual({});
  });

  it('returns {} when the file is missing', () => {
    process.env.MM_HOT_CONFIG = path.join(TMP, 'nope-does-not-exist.json');
    const hot = setupHotConfig();
    expect(hot.readChanges({})).toEqual({});
  });
});

// --------------------------------------------------------------------------
// File logging default
// --------------------------------------------------------------------------

describe('examples/_logging defaults', () => {
  afterEach(() => {
    delete process.env.MM_LOG_FILE;
  });

  it('is OFF by default and opt-in via 1', () => {
    delete process.env.MM_LOG_FILE;
    expect(resolveLogFile('mm-test')).toBeNull();
    process.env.MM_LOG_FILE = '0';
    expect(resolveLogFile('mm-test')).toBeNull();
    process.env.MM_LOG_FILE = 'off';
    expect(resolveLogFile('mm-test')).toBeNull();

    process.env.MM_LOG_FILE = '1';
    const file = resolveLogFile('mm-test');
    expect(file).not.toBeNull();
    expect(file).toContain('logs');
    expect(path.basename(file!)).toContain('mm-test');
  });

  it('honors an explicit path', () => {
    const custom = path.join(TMP, 'custom-run.log');
    process.env.MM_LOG_FILE = custom;
    expect(resolveLogFile('mm-test')).toBe(custom);
  });
});