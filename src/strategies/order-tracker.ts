import { EventEmitter } from 'events';
import type {
  WsOrder,
  WsTrade,
  WsPosition,
  WsAccountOrdersMessage,
  WsAccountAllOrdersMessage,
  WsAccountAllTradesMessage,
  WsAccountAllPositionsMessage,
  WsAccountAllMessage,
  WsAccountMarketMessage,
} from '../ws/ws-events';

// ============================================================================
// Tracked state types
// ============================================================================

export interface TrackedOrder {
  clientOrderIndex: number;
  orderIndex: number;
  marketId: number;
  isAsk: boolean;
  /** Limit price in HUMAN dollars. */
  price: number;
  /** Order size in HUMAN base units (converted from scaled at registration). */
  baseAmount: number;
  /** Filled size in HUMAN base units (from WS `filled_base_amount`). */
  filledBaseAmount: number;
  /** Filled notional in HUMAN dollars (from WS `filled_quote_amount`). */
  filledQuoteAmount: number;
  remainingBaseAmount: number;
  status: string;
  orderVersion?: number | undefined;
  placedAt: number;
  lastUpdatedAt: number;
  /** Raw order type string from WS ('limit', 'market', etc.) */
  orderType?: string | undefined;
  /** Raw time_in_force string */
  timeInForce?: string | undefined;
  /** True if reduce-only */
  reduceOnly?: boolean | undefined;
}

export interface TrackedPosition {
  marketId: number;
  symbol: string;
  sign: number; // 1 long, -1 short, 0 flat
  size: number;
  avgEntryPrice: number;
  positionValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  marginMode: number;
  allocatedMargin: number;
  openOrderCount: number;
  totalFundingPaidOut: number;
  lastUpdatedAt: number;
}

// ============================================================================
// Event payloads
// ============================================================================

export interface OrderPlacedEvent {
  order: TrackedOrder;
  timestamp: number;
}

export interface OrderCanceledEvent {
  order: TrackedOrder;
  reason: string; // the canceled-* reason suffix
  timestamp: number;
}

export interface OrderFillEvent {
  order: TrackedOrder;
  /** Total filled base amount, HUMAN units. */
  fillSize: number;
  /** Total filled notional, HUMAN dollars. */
  fillQuoteAmount: number;
  /** Actual execution price of the fill, HUMAN dollars. */
  price: number;
  isFullFill: boolean;
  timestamp: number;
}

export interface OrderPartialFillEvent {
  order: TrackedOrder;
  fillDelta: number; // delta since last partial fill
  fillQuoteDelta: number;
  fillPrice: number;
  cumulativeFilled: number;
  remaining: number;
  timestamp: number;
}

export interface PositionOpenEvent {
  position: TrackedPosition;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  /** realized PnL delta on this same update, if the prior state was known; 0 otherwise. */
  realizedPnlDelta: number;
  timestamp: number;
}

export interface PositionCloseEvent {
  position: TrackedPosition;
  realizedPnl: number;
  marketId: number;
  timestamp: number;
}

export interface PositionChangedEvent {
  position: TrackedPosition;
  previous: TrackedPosition;
  sizeDelta: number;
  /** realized PnL delta on this same update (e.g. from a partial close or funding). */
  realizedPnlDelta: number;
  timestamp: number;
}

export interface FundingEvent {
  marketId: number;
  symbol: string;
  /**
   * Delta since the last observed total_funding_paid_out for this market.
   * Same sign convention as the venue's total_funding_paid_out /
   * realized_pnl fields (not independently re-derived here) -- treat
   * positive as a credit to the account and negative as a cost, consistent
   * with how realizedPnl moves alongside it.
   */
  amount: number;
  /** Running total, as reported by the venue. */
  cumulativeFundingPaidOut: number;
  position: TrackedPosition;
  timestamp: number;
}

export interface TradeEvent {
  trade: WsTrade;
  isOurTrade: boolean;
  ourOrderId?: number;
  ourSide?: 'buy' | 'sell';
  timestamp: number;
}

// ============================================================================
// Helpers
// ============================================================================

function toNumber(value: string | number | undefined, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number') return value;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Fill/position events carry amounts in HUMAN units (the WS reference sends
 * `filled_base_amount` etc. as human strings), but locally-placed orders are
 * signed in SCALED base units. These scales convert between the two so the
 * tracker holds ONE convention (human) regardless of which path an order
 * arrived by. They are injected once per market by the strategy when it
 * loads its market config; the 1e6/1e2 default matches the common
 * size/price decimals when no config has been loaded yet.
 */
export interface MarketScales {
  /** Scaled base units per human base unit (e.g. 1e5 for 5 size decimals). */
  baseScale: number;
  /** Scaled quote units per human dollar (e.g. 100 for 2 price decimals). */
  quoteScale: number;
}

const DEFAULT_SCALES: MarketScales = { baseScale: 1e6, quoteScale: 100 };

function statusIsCanceled(status: string): boolean {
  return status.startsWith('canceled');
}

function statusIsFilled(status: string): boolean {
  return status === 'filled';
}

function statusIsOpen(status: string): boolean {
  return status === 'open' || status === 'pending' || status === 'in-progress';
}

// ============================================================================
// OrderTracker
// ============================================================================

/**
 * OrderTracker maintains in-memory state of all our orders and positions,
 * fed by WS events. It detects fills, partial fills, cancellations, and
 * position opens/closes, emitting typed events.
 *
 * Wire it up by calling the `on*Message` methods with messages from
 * WsPrivateClient subscriptions:
 *   - subscribeAccountOrders → onAccountOrdersMessage
 *   - subscribeAccountAllOrders → onAccountAllOrdersMessage
 *   - subscribeAccountAllTrades → onAccountAllTradesMessage
 *   - subscribeAccountAllPositions → onAccountAllPositionsMessage
 *   - subscribeAccountAll → onAccountAllMessage
 *   - subscribeAccountMarket → onAccountMarketMessage
 */
export class OrderTracker extends EventEmitter {
  /** client_order_index → TrackedOrder */
  private ordersByClientIndex = new Map<number, TrackedOrder>();
  /** order_index → TrackedOrder */
  private ordersByOrderIndex = new Map<number, TrackedOrder>();
  /** market_id → TrackedPosition */
  private positions = new Map<number, TrackedPosition>();
  /** Our account index — used to filter trades that are ours */
  private accountIndex?: number;
  /** Set of our order indices — for trade matching */
  private ourOrderIndices = new Set<number>();
  /** Previous realized PnL per market — for detecting realized PnL deltas */
  private prevRealizedPnl = new Map<number, number>();
  /** Previous total_funding_paid_out per market — for detecting funding events */
  private prevFundingPaidOut = new Map<number, number>();
  /** Per-market unit scales for fill/price unit conversion (see MarketScales). */
  private marketScales = new Map<number, MarketScales>();

  constructor(accountIndex?: number) {
    super();
    if (accountIndex !== undefined) this.accountIndex = accountIndex;
  }

  /**
   * Inject the unit scales for a market. Call once the market config is
   * loaded (price/size decimals from the venue); without this the tracker
   * assumes 1e6 base / 1e2 quote, which is incorrect for markets with
   * different decimals (e.g. BTC is 1e5/1e2) and skews hedge sizing and
   * volume figures.
   */
  setMarketScales(marketId: number, scales: MarketScales): void {
    this.marketScales.set(marketId, scales);
  }

  private scalesFor(marketId: number): MarketScales {
    return this.marketScales.get(marketId) ?? DEFAULT_SCALES;
  }

  // --------------------------------------------------------------------------
  // Public accessors
  // --------------------------------------------------------------------------

  /** Get all tracked orders (active + completed). */
  getAllOrders(): TrackedOrder[] {
    return Array.from(this.ordersByClientIndex.values());
  }

  /** Get only open/active orders. */
  getOpenOrders(): TrackedOrder[] {
    return this.getAllOrders().filter((o) => statusIsOpen(o.status));
  }

  /** Get open orders for a specific market. */
  getOpenOrdersByMarket(marketId: number): TrackedOrder[] {
    return this.getOpenOrders().filter((o) => o.marketId === marketId);
  }

  /** Get an order by its client_order_index. */
  getOrderByClientIndex(clientOrderIndex: number): TrackedOrder | undefined {
    return this.ordersByClientIndex.get(clientOrderIndex);
  }

  /** Get an order by its order_index (server-assigned). */
  getOrderByOrderIndex(orderIndex: number): TrackedOrder | undefined {
    return this.ordersByOrderIndex.get(orderIndex);
  }

  /** Get all tracked positions. */
  getAllPositions(): TrackedPosition[] {
    return Array.from(this.positions.values());
  }

  /** Get position for a specific market. */
  getPosition(marketId: number): TrackedPosition | undefined {
    return this.positions.get(marketId);
  }

  /** Get the number of open orders. */
  getOpenOrderCount(): number {
    return this.getOpenOrders().length;
  }

  /** Get the number of open orders for a market. */
  getOpenOrderCountByMarket(marketId: number): number {
    return this.getOpenOrdersByMarket(marketId).length;
  }

  // --------------------------------------------------------------------------
  // Manual state injection (for placing orders outside WS)
  // --------------------------------------------------------------------------

  /**
   * Register a locally-placed order so the tracker expects it.
   * Call this right after sending an order via WsExecutor/SignerClient,
   * before the WS account_orders update arrives.
   *
   * `price` is HUMAN dollars and `baseAmount` is SCALED base units — the
   * conventions every strategy already uses (prices are converted at signing
   * time, amounts are signed in scaled units). The tracker's WS-fed orders
   * carry HUMAN amounts (`initial_base_amount` is a human string per the WS
   * reference), so the scaled amount is converted here to keep one unit
   * convention across the two paths. Without the conversion, a registered
   * order's amounts differ from the WS-reported amounts by the base scale
   * factor, and comparisons between them (partial-fill detection, dashboard
   * rows) are invalid.
   */
  registerOrder(params: {
    clientOrderIndex: number;
    marketId: number;
    isAsk: boolean;
    price: number;
    baseAmount: number;
    orderType?: string;
    timeInForce?: string;
    reduceOnly?: boolean;
  }): void {
    const now = Date.now();
    const scales = this.scalesFor(params.marketId);
    const humanAmount = params.baseAmount / scales.baseScale;
    const order: TrackedOrder = {
      clientOrderIndex: params.clientOrderIndex,
      orderIndex: 0, // will be updated when WS confirms
      marketId: params.marketId,
      isAsk: params.isAsk,
      price: params.price,
      baseAmount: humanAmount,
      filledBaseAmount: 0,
      filledQuoteAmount: 0,
      remainingBaseAmount: humanAmount,
      status: 'pending',
      placedAt: now,
      lastUpdatedAt: now,
      orderType: params.orderType,
      timeInForce: params.timeInForce,
      reduceOnly: params.reduceOnly,
    };
    this.ordersByClientIndex.set(params.clientOrderIndex, order);
    this.emit('orderPlaced', {
      order,
      timestamp: now,
    } as OrderPlacedEvent);
  }

  // --------------------------------------------------------------------------
  // WS message handlers — feed these from WsPrivateClient subscriptions
  // --------------------------------------------------------------------------

  /**
   * Handle `account_orders/{market}/{account}` messages.
   * Contains per-market order updates.
   */
  onAccountOrdersMessage(msg: WsAccountOrdersMessage): void {
    if (!msg.orders) return;
    for (const [marketKey, orders] of Object.entries(msg.orders)) {
      const marketId = parseInt(marketKey, 10);
      for (const wsOrder of orders) {
        this.processOrderUpdate(wsOrder, marketId);
      }
    }
  }

  /**
   * Handle `account_all_orders/{account}` messages.
   * Contains all orders across all markets.
   */
  onAccountAllOrdersMessage(msg: WsAccountAllOrdersMessage): void {
    if (!msg.orders) return;
    for (const [marketKey, orders] of Object.entries(msg.orders)) {
      const marketId = parseInt(marketKey, 10);
      for (const wsOrder of orders) {
        this.processOrderUpdate(wsOrder, marketId);
      }
    }
  }

  /**
   * Handle `account_all_trades/{account}` messages.
   * Contains our fills — used to detect fill events with trade details.
   */
  onAccountAllTradesMessage(msg: WsAccountAllTradesMessage): void {
    if (!msg.trades) return;
    const tradesArray = Array.isArray(msg.trades) ? msg.trades : Object.values(msg.trades).flat();
    for (const trade of tradesArray) {
      this.processTrade(trade);
    }
  }

  /**
   * Handle `account_all_positions/{account}` messages.
   * Contains position updates — used to detect position open/close/change.
   */
  onAccountAllPositionsMessage(msg: WsAccountAllPositionsMessage): void {
    if (!msg.positions) return;
    for (const [marketKey, wsPosition] of Object.entries(msg.positions)) {
      const marketId = parseInt(marketKey, 10);
      this.processPositionUpdate(wsPosition, marketId);
    }
  }

  /**
   * Handle `account_all/{account}` messages.
   * Contains a full account snapshot: positions, trades, assets, etc.
   */
  onAccountAllMessage(msg: WsAccountAllMessage): void {
    // Process positions
    if (msg.positions) {
      for (const [marketKey, wsPosition] of Object.entries(msg.positions)) {
        const marketId = parseInt(marketKey, 10);
        this.processPositionUpdate(wsPosition, marketId);
      }
    }
    // Process trades
    if (msg.trades) {
      for (const [, trades] of Object.entries(msg.trades)) {
        for (const trade of trades) {
          this.processTrade(trade);
        }
      }
    }
  }

  /**
   * Handle `account_market/{market}/{account}` messages.
   * Contains per-market orders, position, trades, and assets combined.
   */
  onAccountMarketMessage(msg: WsAccountMarketMessage): void {
    // Process orders
    if (msg.orders) {
      for (const wsOrder of msg.orders) {
        this.processOrderUpdate(wsOrder, wsOrder.market_index);
      }
    }
    // Process position
    if (msg.position && msg.position.length > 0) {
      for (const wsPosition of msg.position) {
        this.processPositionUpdate(wsPosition, wsPosition.market_id);
      }
    }
    // Process trades
    if (msg.trades) {
      for (const trade of msg.trades) {
        this.processTrade(trade);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Internal processing
  // --------------------------------------------------------------------------

  private processOrderUpdate(wsOrder: WsOrder, marketId: number): void {
    const clientOrderIndex = wsOrder.client_order_index;
    const orderIndex = wsOrder.order_index;
    const now = wsOrder.timestamp || wsOrder.updated_at || Date.now();

    // Look up existing order
    let existing = this.ordersByClientIndex.get(clientOrderIndex);
    if (!existing && orderIndex > 0) {
      existing = this.ordersByOrderIndex.get(orderIndex) as TrackedOrder | undefined;
    }

    const prevFilledBase = existing?.filledBaseAmount ?? 0;
    const prevFilledQuote = existing?.filledQuoteAmount ?? 0;
    const prevStatus = existing?.status ?? '';

    const filledBase = toNumber(wsOrder.filled_base_amount);
    const filledQuote = toNumber(wsOrder.filled_quote_amount);
    const remainingBase = toNumber(wsOrder.remaining_base_amount);
    const status = wsOrder.status;

    const updated: TrackedOrder = {
      clientOrderIndex,
      orderIndex,
      marketId: wsOrder.market_index || marketId,
      isAsk: wsOrder.is_ask,
      price: toNumber(wsOrder.price),
      baseAmount: toNumber(wsOrder.initial_base_amount),
      filledBaseAmount: filledBase,
      filledQuoteAmount: filledQuote,
      remainingBaseAmount: remainingBase,
      status,
      orderVersion: wsOrder.order_version,
      placedAt: existing?.placedAt ?? now,
      lastUpdatedAt: now,
      orderType: wsOrder.type,
      timeInForce: wsOrder.time_in_force,
      reduceOnly: wsOrder.reduce_only,
    };

    // Update indices
    this.ordersByClientIndex.set(clientOrderIndex, updated);
    if (orderIndex > 0) {
      this.ordersByOrderIndex.set(orderIndex, updated);
      this.ourOrderIndices.add(orderIndex);
    }

    // Detect events
    if (!existing || prevStatus === 'pending') {
      // New order appeared (not registered via registerOrder)
      if (!existing) {
        this.emit('orderPlaced', { order: updated, timestamp: now } as OrderPlacedEvent);
      }
    }

    // Fill detection: filled amount increased
    if (filledBase > prevFilledBase) {
      const fillDelta = filledBase - prevFilledBase;
      const fillQuoteDelta = filledQuote - prevFilledQuote;
      // True fill price of THIS slice = quote delta / base delta. Both WS
      // fields are human units (USD / base), so the ratio is a human $
      // price. This reflects what was actually paid — not the order's limit
      // price — which is the number PnL and the event log must show.
      const fillPrice =
        fillDelta > 0 && fillQuoteDelta > 0 ? fillQuoteDelta / fillDelta : updated.price;

      if (statusIsFilled(status) && !statusIsFilled(prevStatus)) {
        // Full fill
        this.emit('orderFill', {
          order: updated,
          fillSize: filledBase,
          fillQuoteAmount: filledQuote,
          price: fillPrice,
          isFullFill: true,
          timestamp: now,
        } as OrderFillEvent);
      } else if (statusIsOpen(status)) {
        // Partial fill (order still open, filled amount increased)
        this.emit('orderPartialFill', {
          order: updated,
          fillDelta,
          fillQuoteDelta,
          fillPrice,
          cumulativeFilled: filledBase,
          remaining: remainingBase,
          timestamp: now,
        } as OrderPartialFillEvent);
      }
    }

    // Cancellation detection
    if (statusIsCanceled(status) && !statusIsCanceled(prevStatus)) {
      const reason = status.replace('canceled-', '');
      this.emit('orderCanceled', {
        order: updated,
        reason,
        timestamp: now,
      } as OrderCanceledEvent);
    }

    // Reject detection (canceled-* non-user reasons)
    if (statusIsCanceled(status) && prevStatus !== '' && !statusIsCanceled(prevStatus)) {
      const reason = status.replace('canceled-', '');
      const isReject =
        reason !== 'expired' &&
        reason !== 'oco' &&
        reason !== 'child' &&
        reason !== 'self-trade';
      if (isReject) {
        this.emit('orderRejected', { order: updated, reason, timestamp: now });
      }
    }
  }

  private processTrade(trade: WsTrade): void {
    // Determine if this trade is ours by checking if ask_id or bid_id
    // matches one of our order indices
    const isOurTrade =
      this.ourOrderIndices.has(trade.ask_id) ||
      this.ourOrderIndices.has(trade.bid_id);

    let ourOrderId: number | undefined;
    let ourSide: 'buy' | 'sell' | undefined;

    if (isOurTrade) {
      if (this.ourOrderIndices.has(trade.bid_id)) {
        ourOrderId = trade.bid_id;
        ourSide = 'buy';
      }
      if (this.ourOrderIndices.has(trade.ask_id)) {
        ourOrderId = trade.ask_id;
        ourSide = 'sell';
      }
    }

    this.emit('trade', {
      trade,
      isOurTrade,
      ourOrderId,
      ourSide,
      timestamp: trade.timestamp || Date.now(),
    } as TradeEvent);
  }

  private processPositionUpdate(wsPosition: WsPosition, marketId: number): void {
    const now = Date.now();
    const sign = wsPosition.sign ?? 0;
    const size = toNumber(wsPosition.position);
    const realizedPnl = toNumber(wsPosition.realized_pnl);

    const existing = this.positions.get(marketId);
    const prevSign = existing?.sign ?? 0;
    const prevSize = existing?.size ?? 0;
    const prevRealized = this.prevRealizedPnl.get(marketId) ?? 0;
    // The atomic realized-PnL move on this update -- callers (StatsAggregator)
    // sum this across every event to keep a running total in sync with the
    // venue, instead of only capturing the final delta at positionClose.
    const realizedPnlDelta = realizedPnl - prevRealized;

    const updated: TrackedPosition = {
      marketId,
      symbol: wsPosition.symbol ?? '',
      sign,
      size,
      avgEntryPrice: toNumber(wsPosition.avg_entry_price),
      positionValue: toNumber(wsPosition.position_value),
      unrealizedPnl: toNumber(wsPosition.unrealized_pnl),
      realizedPnl,
      liquidationPrice: toNumber(wsPosition.liquidation_price),
      marginMode: wsPosition.margin_mode ?? 0,
      allocatedMargin: toNumber(wsPosition.allocated_margin),
      openOrderCount: wsPosition.open_order_count ?? 0,
      totalFundingPaidOut: toNumber(wsPosition.total_funding_paid_out),
      lastUpdatedAt: now,
    };

    this.positions.set(marketId, updated);
    this.prevRealizedPnl.set(marketId, realizedPnl);

    // Detect position open
    if (prevSign === 0 && sign !== 0 && size > 0) {
      this.emit('positionOpen', {
        position: updated,
        side: sign > 0 ? 'long' : 'short',
        size,
        entryPrice: updated.avgEntryPrice,
        // Unknown baseline on a first-ever observation -- do not attribute a
        // stale historical total to a PnL move that just happened.
        realizedPnlDelta: existing !== undefined ? realizedPnlDelta : 0,
        timestamp: now,
      } as PositionOpenEvent);
    }

    // Detect position close
    if (prevSign !== 0 && (sign === 0 || size === 0)) {
      this.emit('positionClose', {
        position: updated,
        realizedPnl: realizedPnl - prevRealized,
        marketId,
        timestamp: now,
      } as PositionCloseEvent);
    }

    // Detect position change (size changed, still open)
    if (prevSign !== 0 && sign !== 0 && size !== prevSize) {
      this.emit('positionChanged', {
        position: updated,
        previous: existing!,
        sizeDelta: size - prevSize,
        realizedPnlDelta,
        timestamp: now,
      } as PositionChangedEvent);
    }

    // Detect realized PnL change (e.g. from funding or closing part of position)
    if (realizedPnl !== prevRealized && prevSign !== 0 && sign !== 0 && size === prevSize) {
      this.emit('positionChanged', {
        position: updated,
        previous: existing!,
        sizeDelta: 0,
        realizedPnlDelta,
        timestamp: now,
      } as PositionChangedEvent);
    }

    // Detect a funding payment/receipt. Gated on `existing` being defined
    // (not just a non-zero previous map value) so reconnecting mid-position doesn't
    // replay the venue's entire accrued funding history as one event on the
    // first update we happen to observe.
    const prevFunding = this.prevFundingPaidOut.get(marketId);
    this.prevFundingPaidOut.set(marketId, updated.totalFundingPaidOut);
    if (existing !== undefined && updated.totalFundingPaidOut !== prevFunding) {
      this.emit('funding', {
        marketId,
        symbol: updated.symbol,
        amount: updated.totalFundingPaidOut - (prevFunding ?? 0),
        cumulativeFundingPaidOut: updated.totalFundingPaidOut,
        position: updated,
        timestamp: now,
      } as FundingEvent);
    }
  }

  // --------------------------------------------------------------------------
  // State management
  // --------------------------------------------------------------------------

  /** Remove completed orders from tracking (to prevent unbounded growth). */
  pruneCompletedOrders(): void {
    for (const [clientIdx, order] of this.ordersByClientIndex) {
      if (statusIsFilled(order.status) || statusIsCanceled(order.status)) {
        this.ordersByClientIndex.delete(clientIdx);
        if (order.orderIndex > 0) {
          this.ordersByOrderIndex.delete(order.orderIndex);
          this.ourOrderIndices.delete(order.orderIndex);
        }
      }
    }
  }

  /** Clear all tracked state. */
  clear(): void {
    this.ordersByClientIndex.clear();
    this.ordersByOrderIndex.clear();
    this.positions.clear();
    this.ourOrderIndices.clear();
    this.prevRealizedPnl.clear();
    this.prevFundingPaidOut.clear();
  }

  /** Get a snapshot of all state for dashboard/stats. */
  getSnapshot(): {
    orders: TrackedOrder[];
    openOrders: TrackedOrder[];
    positions: TrackedPosition[];
  } {
    return {
      orders: this.getAllOrders(),
      openOrders: this.getOpenOrders(),
      positions: this.getAllPositions(),
    };
  }
}