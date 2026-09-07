/**
 * PnL accounting tests — per-venue totals must reconcile with the venue's
 * own realized_pnl field.
 *
 * The live cross-venue run exposed: Core's PnL not showing / disagreeing.
 * Root cause was StatsAggregator bucketing both venues under the default
 * tag; these tests lock per-venue accounting against the tracker's event
 * stream, including every event type that moves realized PnL:
 *
 *   positionOpen   (may carry a delta when re-opening after a close)
 *   positionChanged(size change — partial close)
 *   positionChanged(rPnL move with unchanged size — funding/fees)
 *   positionClose   (final delta on flatten)
 *
 * Invariant under test, per venue and globally:
 *   sum(all deltas) == venue's last realized_pnl - first observed realized_pnl
 * and the two venues NEVER bleed into each other's bucket.
 */

import { OrderTracker } from '../src/strategies/order-tracker';
import { StatsAggregator } from '../src/cli/stats-aggregator';

/** Build a WS-style position update in the tracker's input shape. */
function posUpdate(overrides: Record<string, any> = {}): any {
  return {
    symbol: 'BTC',
    sign: 1,
    position: '0',
    avg_entry_price: '0',
    position_value: '0',
    unrealized_pnl: '0',
    realized_pnl: '0',
    liquidation_price: '0',
    margin_mode: 0,
    allocated_margin: '0',
    open_order_count: 0,
    total_funding_paid_out: '0',
    ...overrides,
  };
}

describe('StatsAggregator — per-venue PnL accounting', () => {
  it('buckets the two venues separately and reconciles totals with the venue', () => {
    const stats = new StatsAggregator();
    const core = new OrderTracker(1);
    const rh = new OrderTracker(2);
    stats.attachTracker(core, 'core');
    stats.attachTracker(rh, 'rh');

    // ── Core: open 0.1 BTC, partial close +$1.50, funding -$0.10, close +$2.00
    core.processPositionUpdate(posUpdate({ sign: 1, position: '0.1', realized_pnl: '0' }), 1);
    core.processPositionUpdate(
      posUpdate({ sign: 1, position: '0.06', realized_pnl: '1.50', unrealized_pnl: '0.3' }),
      1,
    );
    core.processPositionUpdate(posUpdate({ sign: 1, position: '0.06', realized_pnl: '1.40' }), 1);
    core.processPositionUpdate(posUpdate({ sign: 0, position: '0', realized_pnl: '3.40' }), 1);

    // ── RH: open 0.1, funding -$0.25, close -$0.75
    rh.processPositionUpdate(posUpdate({ sign: -1, position: '0.1', realized_pnl: '0' }), 1);
    rh.processPositionUpdate(posUpdate({ sign: -1, position: '0.1', realized_pnl: '-0.25' }), 1);
    rh.processPositionUpdate(posUpdate({ sign: 0, position: '0', realized_pnl: '-1.00' }), 1);

    const coreV = stats.getVenueStats('core')!;
    const rhV = stats.getVenueStats('rh')!;

    expect(coreV.realizedPnl).toBeCloseTo(3.40, 8); // 0 + 1.50 + (-0.10) + 2.00
    expect(rhV.realizedPnl).toBeCloseTo(-1.00, 8); // 0 + (-0.25) + (-0.75)
    expect(stats.realizedPnl).toBeCloseTo(2.40, 8); // 3.40 - 1.00

    // Unrealized recomputed from the (flat) positions.
    stats.updateUnrealizedPnl();
    expect(coreV.unrealizedPnl).toBeCloseTo(0, 8);
    expect(rhV.unrealizedPnl).toBeCloseTo(0, 8);
    expect(stats.getTotalPnl()).toBeCloseTo(2.40, 8);
  });

  it('does NOT attribute a stale historical total on first-ever observation', () => {
    // The tracker starts mid-position (account had a position before the run
    // with lifetime realized_pnl 5). positionOpen must carry delta 0 — the run
    // did not earn that 5.
    const stats = new StatsAggregator();
    const tracker = new OrderTracker(1);
    stats.attachTracker(tracker, 'core');

    tracker.processPositionUpdate(
      posUpdate({ sign: 1, position: '0.2', realized_pnl: '5.00' }),
      1,
    );
    expect(stats.realizedPnl).toBeCloseTo(0, 8);

    // A later move (funding) IS credited.
    tracker.processPositionUpdate(
      posUpdate({ sign: 1, position: '0.2', realized_pnl: '5.25' }),
      1,
    );
    expect(stats.realizedPnl).toBeCloseTo(0.25, 8);
  });

  it('credits a re-open that lands with a realized delta (close→re-open same update)', () => {
    const stats = new StatsAggregator();
    const tracker = new OrderTracker(1);
    stats.attachTracker(tracker, 'core');

    tracker.processPositionUpdate(posUpdate({ sign: 1, position: '0.1', realized_pnl: '0' }), 1);
    tracker.processPositionUpdate(posUpdate({ sign: 0, position: '0', realized_pnl: '2.00' }), 1);
    // Flip to short on the very next update with another realized move: the
    // positionOpen event carries the delta from the PREVIOUS known total.
    tracker.processPositionUpdate(posUpdate({ sign: -1, position: '0.1', realized_pnl: '2.30' }), 1);

    expect(stats.realizedPnl).toBeCloseTo(2.30, 8);
  });

  it('keeps venue buckets isolated when only one venue reports', () => {
    const stats = new StatsAggregator();
    const core = new OrderTracker(1);
    const rh = new OrderTracker(2);
    stats.attachTracker(core, 'core');
    stats.attachTracker(rh, 'rh');

    core.processPositionUpdate(posUpdate({ sign: 1, position: '0.1', realized_pnl: '0' }), 1);
    core.processPositionUpdate(posUpdate({ sign: 0, position: '0', realized_pnl: '1.00' }), 1);

    expect(stats.getVenueStats('core')!.realizedPnl).toBeCloseTo(1.00, 8);
    expect(stats.getVenueStats('rh')!.realizedPnl).toBeCloseTo(0, 8);
    expect(stats.getVenueStats('default')).toBeUndefined();
  });

  it('unrealized PnL is per-venue and summed globally', () => {
    const stats = new StatsAggregator();
    const core = new OrderTracker(1);
    const rh = new OrderTracker(2);
    stats.attachTracker(core, 'core');
    stats.attachTracker(rh, 'rh');

    core.processPositionUpdate(
      posUpdate({ sign: 1, position: '0.1', unrealized_pnl: '0.40' }),
      1,
    );
    rh.processPositionUpdate(
      posUpdate({ sign: -1, position: '0.2', unrealized_pnl: '-0.15' }),
      1,
    );
    stats.updateUnrealizedPnl();

    expect(stats.getVenueStats('core')!.unrealizedPnl).toBeCloseTo(0.40, 8);
    expect(stats.getVenueStats('rh')!.unrealizedPnl).toBeCloseTo(-0.15, 8);
    expect(stats.unrealizedPnl).toBeCloseTo(0.25, 8);
  });

  it('reset() clears venue buckets too', () => {
    const stats = new StatsAggregator();
    const core = new OrderTracker(1);
    stats.attachTracker(core, 'core');
    core.processPositionUpdate(posUpdate({ sign: 1, position: '0.1', realized_pnl: '0' }), 1);
    core.processPositionUpdate(posUpdate({ sign: 0, position: '0', realized_pnl: '1.00' }), 1);

    stats.reset();
    expect(stats.getVenueStats('core')!.realizedPnl).toBe(0);
    expect(stats.realizedPnl).toBe(0);
  });
});

describe('runner wiring — venue tags reach StatsAggregator', () => {
  it('wireLogging attaches trackers under the passed venue tag', async () => {
    // Read run_mm.ts as source text: the cross-venue wiring MUST pass the
    // venue tags. The 'default' collapse merged both venues' PnL into one
    // bucket — the "Core PnL not showing" bug.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'examples', 'run_mm.ts'),
      'utf8',
    );
    const crossWire = src.match(
      /wireLogging\(coreTracker, coreExecutor, stats, counters, 'core'\)/,
    );
    const rhWire = src.match(
      /wireLogging\(rhTracker, rhExecutor, stats, counters, 'rh'\)/,
    );
    expect(crossWire).not.toBeNull();
    expect(rhWire).not.toBeNull();
    expect(src).toContain("stats.attachTracker(tracker, venueTag)");
  });
});