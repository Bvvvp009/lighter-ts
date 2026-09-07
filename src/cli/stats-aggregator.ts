import { EventEmitter } from 'events';
import { RingBuffer } from './ring-buffer';
import type { OrderTracker } from '../strategies/order-tracker';
import type { WsExecutor } from '../strategies/ws-executor';
import type { StrategyBase } from '../strategies/strategy-base';
import type { WsPrivateClient } from '../ws/ws-private-client';

// ============================================================================
// Types
// ============================================================================

export interface DashboardEvent {
  timestamp: number;
  venue?: string;
  type:
    | 'fill'
    | 'partial'
    | 'cancel'
    | 'reject'
    | 'place'
    | 'position'
    | 'ws_connect'
    | 'ws_disconnect'
    | 'ws_reconnect'
    | 'error'
    | 'circuit_breaker'
    | 'tick'
    | 'hedge'
    | 'funding'
    | 'config'
    | 'leverage'
    | 'info';
  message: string;
  pnlDelta?: number;
  color: 'green' | 'red' | 'yellow' | 'cyan' | 'gray' | 'white';
}

export interface VenueStats {
  realizedPnl: number;
  unrealizedPnl: number;
  volume: number;
  fills: number;
  partialFills: number;
  cancels: number;
  rejects: number;
  ordersPlaced: number;
  /**
   * Cumulative funding for this venue, same sign convention as the venue's
   * total_funding_paid_out (see FundingEvent). Informational only -- it is
   * NOT added into realizedPnl separately, since the venue's realized_pnl
   * already includes funding and realizedPnl is kept in sync with that
   * field directly (see the positionChanged/positionClose handlers below).
   */
  funding: number;
}

export interface MarketStats {
  realizedPnl: number;
  unrealizedPnl: number;
  volume: number;
  fills: number;
  marketId: number;
}

// ============================================================================
// StatsAggregator
// ============================================================================

/**
 * Subscribes to OrderTracker + WsExecutor + StrategyBase events and
 * maintains running stats for the dashboard. All updates are event-driven
 * — no HTTP polling.
 */
export class StatsAggregator {
  // Running totals (all venues combined)
  realizedPnl: number = 0;
  unrealizedPnl: number = 0;
  totalVolume: number = 0;
  fillCount: number = 0;
  partialFillCount: number = 0;
  cancelCount: number = 0;
  rejectCount: number = 0;
  ordersPlaced: number = 0;
  ordersActive: number = 0;
  ticksProcessed: number = 0;
  /** Cumulative funding across all venues. Informational -- see VenueStats.funding. */
  totalFunding: number = 0;

  // Per-venue breakdown
  venueStats: Map<string, VenueStats> = new Map();

  // Per-market breakdown
  marketStats: Map<number, MarketStats> = new Map();

  // Event log (ring buffer)
  events: RingBuffer<DashboardEvent> = new RingBuffer<DashboardEvent>(200);

  private attachedTrackers: Array<{ tracker: OrderTracker; venueTag: string }> = [];
  private attachedExecutors: Array<{ executor: WsExecutor; venueTag: string }> = [];

  // --------------------------------------------------------------------------
  // Attach event sources
  // --------------------------------------------------------------------------

  attachTracker(tracker: OrderTracker, venueTag: string = 'default'): void {
    this.attachedTrackers.push({ tracker, venueTag });

    // Ensure venue stats exist
    if (!this.venueStats.has(venueTag)) {
      this.venueStats.set(venueTag, this.emptyVenueStats());
    }

    tracker.on('orderFill', (event: any) => {
      this.fillCount++;
      this.ordersActive = Math.max(0, this.ordersActive - 1);

      const usdAmount = event.fillQuoteAmount || 0;
      this.totalVolume += usdAmount;

      const venue = this.venueStats.get(venueTag);
      if (venue) {
        venue.fills++;
        venue.volume += usdAmount;
      }

      const market = this.getOrCreateMarketStats(event.order.marketId);
      market.fills++;
      market.volume += usdAmount;

      this.events.push({
        timestamp: event.timestamp,
        venue: venueTag,
        type: 'fill',
        message: `${event.order.isAsk ? 'SELL' : 'BUY'} ${Number(event.fillSize).toFixed(4)} @ ${Number(event.price).toFixed(2)} ($${Number(usdAmount).toFixed(2)})`,
        pnlDelta: 0,
        color: 'green',
      });
    });

    tracker.on('orderPartialFill', (event: any) => {
      this.partialFillCount++;

      const venue = this.venueStats.get(venueTag);
      if (venue) venue.partialFills++;

      this.events.push({
        timestamp: event.timestamp,
        venue: venueTag,
        type: 'partial',
        message: `${event.order.isAsk ? 'SELL' : 'BUY'} +${Number(event.fillDelta).toFixed(4)} (cum=${Number(event.cumulativeFilled).toFixed(4)}, rem=${Number(event.remaining).toFixed(4)}) @ ${Number(event.fillPrice).toFixed(2)}`,
        color: 'cyan',
      });
    });

    tracker.on('orderCanceled', (event: any) => {
      this.cancelCount++;
      this.ordersActive = Math.max(0, this.ordersActive - 1);

      const venue = this.venueStats.get(venueTag);
      if (venue) venue.cancels++;

      this.events.push({
        timestamp: event.timestamp,
        venue: venueTag,
        type: 'cancel',
        message: `order #${event.order.orderIndex} (${event.reason})`,
        color: 'yellow',
      });
    });

    tracker.on('orderRejected', (event: any) => {
      this.rejectCount++;
      const venue = this.venueStats.get(venueTag);
      if (venue) venue.rejects++;

      this.events.push({
        timestamp: event.timestamp,
        venue: venueTag,
        type: 'reject',
        message: `order #${event.order.orderIndex} rejected: ${event.reason}`,
        color: 'red',
      });
    });

    tracker.on('orderPlaced', () => {
      this.ordersPlaced++;
      this.ordersActive++;
      const venue = this.venueStats.get(venueTag);
      if (venue) venue.ordersPlaced++;
    });

    tracker.on('positionOpen', (event: any) => {
      // A re-open after a close can carry a realized-PnL delta on the same
      // update (the venue reports it against the previous total). Skipping
      // it would leave the running total out of sync with the venue's own
      // realized total.
      const delta: number = event.realizedPnlDelta || 0;
      if (delta !== 0) {
        this.realizedPnl += delta;
        const venue = this.venueStats.get(venueTag);
        if (venue) venue.realizedPnl += delta;
      }

      this.events.push({
        timestamp: event.timestamp,
        venue: venueTag,
        type: 'position',
        message: `OPEN ${event.side} ${event.size} @ ${event.entryPrice.toFixed(2)}` +
          (delta !== 0 ? ` (rPnL ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})` : ''),
        pnlDelta: delta,
        color: 'cyan',
      });
    });

    tracker.on('positionClose', (event: any) => {
      this.realizedPnl += event.realizedPnl;
      const venue = this.venueStats.get(venueTag);
      if (venue) venue.realizedPnl += event.realizedPnl;

      this.events.push({
        timestamp: event.timestamp,
        venue: venueTag,
        type: 'position',
        message: `CLOSE mkt:${event.marketId} rPnL ${event.realizedPnl >= 0 ? '+' : ''}${event.realizedPnl.toFixed(2)}`,
        pnlDelta: event.realizedPnl,
        color: event.realizedPnl >= 0 ? 'green' : 'red',
      });
    });

    tracker.on('positionChanged', (event: any) => {
      // Credit the atomic realized-PnL move on this update. positionClose
      // already captures its own final delta; without this, every
      // intermediate move -- a partial close, a funding round, a fee
      // adjustment -- while the position stays open was silently dropped
      // from the running total, which is why the aggregate PnL could drift
      // from what the venue reports.
      const delta: number = event.realizedPnlDelta || 0;
      if (delta !== 0) {
        this.realizedPnl += delta;
        const venue = this.venueStats.get(venueTag);
        if (venue) venue.realizedPnl += delta;

        this.events.push({
          timestamp: event.timestamp,
          venue: venueTag,
          type: 'position',
          message: `mkt:${event.position.marketId} rPnL ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}` +
            (event.sizeDelta !== 0 ? ` (size ${event.sizeDelta >= 0 ? '+' : ''}${event.sizeDelta})` : ' (funding/fee)'),
          pnlDelta: delta,
          color: delta >= 0 ? 'green' : 'red',
        });
      }

      this.updateUnrealizedPnl();
    });

    tracker.on('funding', (event: any) => {
      // Informational running total, separate from realizedPnl: the venue's
      // realized_pnl already includes funding, and that field is what feeds
      // realizedPnl above, so adding this in too would double-count it.
      this.totalFunding += event.amount;
      const venue = this.venueStats.get(venueTag);
      if (venue) venue.funding += event.amount;

      this.events.push({
        timestamp: event.timestamp,
        venue: venueTag,
        type: 'funding',
        message: `funding mkt:${event.marketId} ${event.amount >= 0 ? '+' : ''}${event.amount.toFixed(6)} (total ${event.cumulativeFundingPaidOut.toFixed(6)})`,
        pnlDelta: event.amount,
        color: event.amount >= 0 ? 'green' : 'red',
      });
    });
  }

  attachExecutor(executor: WsExecutor, venueTag: string = 'default'): void {
    this.attachedExecutors.push({ executor, venueTag });

    executor.on('orderPlaced', () => {
      // Already counted via tracker.registerOrder
    });

    executor.on('error', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        venue: venueTag,
        type: 'error',
        message: `${event.operation}: ${event.error instanceof Error ? event.error.message : String(event.error)}`,
        color: 'red',
      });
    });

    executor.on('wsConnected', () => {
      this.events.push({
        timestamp: Date.now(),
        venue: venueTag,
        type: 'ws_connect',
        message: 'connected',
        color: 'green',
      });
    });

    executor.on('wsDisconnected', () => {
      this.events.push({
        timestamp: Date.now(),
        venue: venueTag,
        type: 'ws_disconnect',
        message: 'disconnected',
        color: 'yellow',
      });
    });

    executor.on('batchSent', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        venue: venueTag,
        type: 'tick',
        message: `batch: ${event.cancels} cancels + ${event.creates} creates`,
        color: 'gray',
      });
    });
  }

  attachStrategy(strategy: StrategyBase): void {
    strategy.on('circuitBreaker', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        type: 'circuit_breaker',
        message: `CIRCUIT BREAKER: ${event.reason}`,
        color: 'red',
      });
    });

    strategy.on('error', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        type: 'error',
        message: `tick: ${event.error instanceof Error ? event.error.message : String(event.error)}`,
        color: 'red',
      });
    });

    // Hot config + leverage changes surface in the event log.
    strategy.on('configUpdated', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        type: 'config',
        message: `config updated: ${(event.keys || []).join(', ')}`,
        color: 'cyan',
      });
    });

    strategy.on('leverageApplied', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        type: 'leverage',
        message: `leverage set to ${event.leverage}x on market ${event.marketId}`,
        color: 'cyan',
      });
    });
  }

  attachWsClient(ws: WsPrivateClient, venueTag: string = 'default'): void {
    ws.on('message', () => {
      // Could parse specific WS messages here if needed
    });
  }

  // --------------------------------------------------------------------------
  // Cross-venue specific
  // --------------------------------------------------------------------------

  attachCrossVenue(mm: any): void {
    mm.on('hedged', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        venue: event.hedgeVenue,
        type: 'hedge',
        message: `HEDGE ${event.isAsk ? 'SELL' : 'BUY'} ${event.size} (from ${event.filledVenue})`,
        color: 'cyan',
      });
    });

    mm.on('hedgeFailed', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        venue: event.venue,
        type: 'error',
        message: `HEDGE FAILED: ${event.error}`,
        color: 'red',
      });
    });

    mm.on('wsConnected', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        venue: event.venue,
        type: 'ws_connect',
        message: 'connected',
        color: 'green',
      });
    });

    mm.on('wsDisconnected', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        venue: event.venue,
        type: 'ws_disconnect',
        message: 'disconnected',
        color: 'yellow',
      });
    });

    mm.on('configUpdated', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        type: 'config',
        message: `config updated: ${(event.keys || []).join(', ')}`,
        color: 'cyan',
      });
    });

    mm.on('leverageApplied', (event: any) => {
      this.events.push({
        timestamp: Date.now(),
        venue: event.venue,
        type: 'leverage',
        message: `leverage set to ${event.leverage}x on market ${event.marketId}`,
        color: 'cyan',
      });
    });
  }

  // --------------------------------------------------------------------------
  // Stats computation
  // --------------------------------------------------------------------------

  /** Recompute unrealized PnL from all attached trackers. */
  updateUnrealizedPnl(): void {
    let total = 0;
    for (const { tracker, venueTag } of this.attachedTrackers) {
      let venueTotal = 0;
      for (const pos of tracker.getAllPositions()) {
        venueTotal += pos.unrealizedPnl;
      }
      const venue = this.venueStats.get(venueTag);
      if (venue) venue.unrealizedPnl = venueTotal;
      total += venueTotal;
    }
    this.unrealizedPnl = total;
  }

  /** Get combined realized + unrealized. */
  getTotalPnl(): number {
    return this.realizedPnl + this.unrealizedPnl;
  }

  /** Get venue-specific stats. */
  getVenueStats(tag: string): VenueStats | undefined {
    return this.venueStats.get(tag);
  }

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  reset(): void {
    this.realizedPnl = 0;
    this.unrealizedPnl = 0;
    this.totalVolume = 0;
    this.fillCount = 0;
    this.partialFillCount = 0;
    this.cancelCount = 0;
    this.rejectCount = 0;
    this.ordersPlaced = 0;
    this.ordersActive = 0;
    this.ticksProcessed = 0;
    this.totalFunding = 0;
    for (const [, venue] of this.venueStats) {
      Object.assign(venue, this.emptyVenueStats());
    }
    this.marketStats.clear();
    this.events.clear();
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private emptyVenueStats(): VenueStats {
    return {
      realizedPnl: 0,
      unrealizedPnl: 0,
      volume: 0,
      fills: 0,
      partialFills: 0,
      cancels: 0,
      rejects: 0,
      ordersPlaced: 0,
      funding: 0,
    };
  }

  private getOrCreateMarketStats(marketId: number): MarketStats {
    let market = this.marketStats.get(marketId);
    if (!market) {
      market = {
        realizedPnl: 0,
        unrealizedPnl: 0,
        volume: 0,
        fills: 0,
        marketId,
      };
      this.marketStats.set(marketId, market);
    }
    return market;
  }
}