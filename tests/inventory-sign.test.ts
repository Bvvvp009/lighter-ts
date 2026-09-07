/**
 * Inventory-sign regression tests.
 *
 * The WS wire format carries DIRECTION in `sign` and MAGNITUDE in `position`,
 * so `TrackedPosition.size` is unsigned. Three shipped strategies used to read
 * bare `pos.size` as if it were signed, which made a short look long: quotes
 * skewed toward ADDING to the losing side, and `CrossVenueMM.getNetPosition()`
 * reported a fully hedged book as net long. Live money rides on this sign, so
 * the tests below drive REAL OrderTrackers with real wire-shaped messages
 * rather than stubbing `getPosition`, which would only re-assert the bug.
 */

import { EventEmitter } from 'events';
import { StrategyBase, type StrategyConfig } from '../src/strategies/strategy-base';
import { OrderTracker } from '../src/strategies/order-tracker';
import {
  CrossVenueMM,
  type CrossVenueMMConfig,
  type VenueConfig,
} from '../src/strategies/cross-venue-mm';
import type { MarketConfig } from '../src/utils/price-utils';
import type { WsAccountAllPositionsMessage, WsPosition } from '../src/ws/ws-events';

const MARKET = 1;
const BASE_SCALE = 1e5;

const MARKET_CONFIG = {
  index: MARKET,
  name: 'ETH',
  baseAsset: 'ETH',
  quoteAsset: 'USDC',
  baseScale: BASE_SCALE,
  quoteScale: 100,
  minOrderSize: 1,
  tickSize: 0.01,
} as MarketConfig;

/** A position exactly as the exchange puts it on the wire. */
function wsPosition(marketId: number, sign: number, size: string): WsPosition {
  return {
    market_id: marketId,
    symbol: 'ETH',
    initial_margin_fraction: '0.1',
    open_order_count: 0,
    pending_order_count: 0,
    position_tied_order_count: 0,
    sign,
    position: size,
    avg_entry_price: '2000.00',
    position_value: '5000.00',
    unrealized_pnl: '0',
    realized_pnl: '0',
    liquidation_price: '0',
    margin_mode: 0,
    allocated_margin: '0',
  };
}

function feedPosition(
  tracker: OrderTracker,
  sign: number,
  size: string,
  marketId: number = MARKET,
): void {
  const msg: WsAccountAllPositionsMessage = {
    channel: 'account_all_positions:1',
    positions: { [String(marketId)]: wsPosition(marketId, sign, size) },
    type: 'update/account_all_positions',
  };
  tracker.onAccountAllPositionsMessage(msg);
}

// ---------------------------------------------------------------------------
// StrategyBase.signedPositionUnits — the shared helper the fix routes through
// ---------------------------------------------------------------------------

class TestStrategy extends StrategyBase {
  get name(): string {
    return 'sign-test';
  }
  protected async onTick(): Promise<void> {
    /* no-op */
  }
  signed(marketId: number): number {
    return this.signedPositionUnits(marketId);
  }
  signedDefault(): number {
    return this.signedPositionUnits();
  }
  setMarketConfig(mc: MarketConfig | null): void {
    this.marketConfig = mc;
  }
}

function makeStrategy(): { s: TestStrategy; tracker: OrderTracker } {
  const tracker = new OrderTracker(1);
  const config = {
    marketId: MARKET,
    accountId: 1,
    maxPositionSize: 1e9,
    maxOpenOrders: 4,
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
  } as StrategyConfig;
  const s = new TestStrategy(
    config,
    {} as any,
    new EventEmitter() as any,
    new EventEmitter() as any,
    tracker,
  );
  s.setMarketConfig(MARKET_CONFIG);
  return { s, tracker };
}

describe('signedPositionUnits', () => {
  it('returns 0 when the tracker has never seen the market', () => {
    const { s } = makeStrategy();
    expect(s.signed(MARKET)).toBe(0);
  });

  it('reports a long as positive base units', () => {
    const { s, tracker } = makeStrategy();
    feedPosition(tracker, 1, '2.5');
    expect(s.signed(MARKET)).toBe(2.5 * BASE_SCALE);
  });

  it('reports a short as NEGATIVE base units', () => {
    // The whole point of the fix: `position` is "2.5" for a short too, and
    // only `sign` says which way it points.
    const { s, tracker } = makeStrategy();
    feedPosition(tracker, -1, '2.5');
    expect(s.signed(MARKET)).toBe(-2.5 * BASE_SCALE);
  });

  it('makes a long and an equal short exact negatives of each other', () => {
    const long = makeStrategy();
    feedPosition(long.tracker, 1, '3.75');
    const short = makeStrategy();
    feedPosition(short.tracker, -1, '3.75');
    expect(long.s.signed(MARKET) + short.s.signed(MARKET)).toBe(0);
  });

  it('treats a flat position as 0 even when sign is left at 1', () => {
    // Observed live on Robinhood: flat markets come back with sign 1 and
    // position "0.0000", so `sign === 0` is NOT a reliable flat test.
    const { s, tracker } = makeStrategy();
    feedPosition(tracker, 1, '0.0000');
    expect(s.signed(MARKET)).toBe(0);
  });

  it('does not double-negate if a venue ever sends a signed magnitude', () => {
    // Defensive: `direction * Math.abs(size)` must survive "-2.5" with sign -1
    // rather than flipping it back to long.
    const { s, tracker } = makeStrategy();
    feedPosition(tracker, -1, '-2.5');
    expect(s.signed(MARKET)).toBe(-2.5 * BASE_SCALE);
  });

  it('falls back to a 1e6 base scale before market config loads', () => {
    const { s, tracker } = makeStrategy();
    s.setMarketConfig(null);
    feedPosition(tracker, -1, '2.5');
    expect(s.signed(MARKET)).toBe(-2.5 * 1e6);
  });

  it('defaults to the strategy market when called with no argument', () => {
    const { s, tracker } = makeStrategy();
    feedPosition(tracker, -1, '1');
    feedPosition(tracker, 1, '9', MARKET + 1);
    expect(s.signedDefault()).toBe(-1 * BASE_SCALE);
    expect(s.signed(MARKET + 1)).toBe(9 * BASE_SCALE);
  });
});

// ---------------------------------------------------------------------------
// CrossVenueMM — the case the bug was worst in: a hedged book read as net long
// ---------------------------------------------------------------------------

function makeVenue(tag: string, network: string): VenueConfig {
  return {
    network,
    signerClient: {} as any,
    wsPrivate: new EventEmitter() as any,
    executor: new EventEmitter() as any,
    tracker: new OrderTracker(1),
    tag,
  };
}

function makeCrossVenue(): { mm: CrossVenueMM; core: VenueConfig; rh: VenueConfig } {
  const core = makeVenue('core', 'mainnet');
  const rh = makeVenue('rh', 'robinhood');
  const config = {
    marketId: MARKET,
    accountAId: 1,
    accountBId: 2,
    edgeBps: 5,
    orderSize: 10000,
    maxNetPosition: 1e9,
    maxPositionPerVenue: 1e9,
    maxOpenOrdersPerVenue: 4,
    hedgeOnFill: true,
    hedgeSlippage: 0.002,
    tickIntervalMs: 500,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
  } as CrossVenueMMConfig;
  const mm = new CrossVenueMM(config, core, rh);
  // Normally loaded in start(); pin it so base-unit scaling is deterministic.
  (mm as any).marketConfig = MARKET_CONFIG;
  return { mm, core, rh };
}

describe('CrossVenueMM position accounting', () => {
  it('reports a fully hedged book as flat', () => {
    // This is the regression: long on core, short the same size on Robinhood.
    // Summing unsigned magnitudes reported 5.0 ETH net long, which would have
    // blocked further quoting or triggered a phantom hedge.
    const { mm, core, rh } = makeCrossVenue();
    feedPosition(core.tracker, 1, '2.5');
    feedPosition(rh.tracker, -1, '2.5');
    expect(mm.getNetPosition()).toBe(0);
  });

  it('reports each venue with its own direction', () => {
    const { mm, core, rh } = makeCrossVenue();
    feedPosition(core.tracker, 1, '2.5');
    feedPosition(rh.tracker, -1, '2.5');
    expect(mm.getVenuePosition('core')).toBe(2.5 * BASE_SCALE);
    expect(mm.getVenuePosition('rh')).toBe(-2.5 * BASE_SCALE);
  });

  it('adds same-side exposure instead of cancelling it', () => {
    const { mm, core, rh } = makeCrossVenue();
    feedPosition(core.tracker, 1, '2.5');
    feedPosition(rh.tracker, 1, '2.5');
    expect(mm.getNetPosition()).toBe(5 * BASE_SCALE);
  });

  it('nets a partial hedge to the residual, with the residual sign intact', () => {
    const { mm, core, rh } = makeCrossVenue();
    feedPosition(core.tracker, 1, '3');
    feedPosition(rh.tracker, -1, '4');
    expect(mm.getNetPosition()).toBe(-1 * BASE_SCALE);
  });

  it('reports 0 for an untouched book', () => {
    const { mm } = makeCrossVenue();
    expect(mm.getNetPosition()).toBe(0);
    expect(mm.getVenuePosition('core')).toBe(0);
  });

  it('returns 0 for an unknown venue tag rather than throwing', () => {
    const { mm } = makeCrossVenue();
    expect(mm.getVenuePosition('nope')).toBe(0);
  });
});
