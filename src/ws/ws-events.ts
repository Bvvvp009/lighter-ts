/**
 * Typed WebSocket event interfaces for the Lighter Protocol WS server.
 *
 * All field names and shapes mirror the official WS reference:
 * https://apidocs.lighter.xyz/docs/websocket-reference
 *
 * Channels marked (auth) require an auth token in the subscribe message.
 */

// ============================================================================
// Shared primitives (mirror the WS reference "Types" section)
// ============================================================================

export interface WsPriceLevel {
  price: string;
  size: string;
}

export interface WsOrder {
  order_index: number;
  client_order_index: number;
  order_id: string;
  client_order_id: string;
  market_index: number;
  owner_account_index: number;
  initial_base_amount: string;
  price: string;
  nonce: number;
  remaining_base_amount: string;
  is_ask: boolean;
  base_size: number;
  base_price: number;
  filled_base_amount: string;
  filled_quote_amount: string;
  side: string;
  type:
    | 'limit'
    | 'market'
    | 'stop-loss'
    | 'stop-loss-limit'
    | 'take-profit'
    | 'take-profit-limit'
    | 'twap'
    | 'twap-sub'
    | 'liquidation';
  time_in_force: 'good-till-time' | 'immediate-or-cancel' | 'post-only' | 'Unknown';
  reduce_only: boolean;
  trigger_price: string;
  order_expiry: number;
  status:
    | 'in-progress'
    | 'pending'
    | 'open'
    | 'filled'
    | 'canceled'
    | 'canceled-post-only'
    | 'canceled-reduce-only'
    | 'canceled-position-not-allowed'
    | 'canceled-margin-not-allowed'
    | 'canceled-too-much-slippage'
    | 'canceled-not-enough-liquidity'
    | 'canceled-self-trade'
    | 'canceled-expired'
    | 'canceled-oco'
    | 'canceled-child'
    | 'canceled-liquidation'
    | 'canceled-invalid-balance';
  trigger_status: 'na' | 'ready' | 'mark-price' | 'twap' | 'parent-order';
  trigger_time: number;
  parent_order_index: number;
  parent_order_id: string;
  to_trigger_order_id_0: string;
  to_trigger_order_id_1: string;
  to_cancel_order_id_0: string;
  integrator_fee_collector_index?: string;
  integrator_taker_fee?: string;
  integrator_maker_fee?: string;
  order_version?: number;
  block_height: number;
  timestamp: number;
  created_at?: number;
  updated_at?: number;
  transaction_time?: number;
}

export interface WsTrade {
  trade_id: number;
  trade_id_str: string;
  tx_hash: string;
  type: 'trade' | 'liquidation' | 'deleverage' | 'market-settlement';
  market_id: number;
  size: string;
  price: string;
  usd_amount: string;
  ask_id: number;
  ask_id_str: string;
  bid_id: number;
  bid_id_str: string;
  ask_client_id: number;
  ask_client_id_str: string;
  bid_client_id: number;
  bid_client_id_str: string;
  ask_account_id: number;
  bid_account_id: number;
  is_maker_ask: boolean;
  block_height: number;
  timestamp: number;
  taker_fee?: number;
  taker_position_size_before?: string;
  taker_entry_quote_before?: string;
  taker_initial_margin_fraction_before?: number;
  taker_position_sign_changed?: boolean;
  maker_fee?: number;
  maker_position_size_before?: string;
  maker_entry_quote_before?: string;
  maker_initial_margin_fraction_before?: number;
  maker_position_sign_changed?: boolean;
  transaction_time: number;
  ask_order_version?: number;
  bid_order_version?: number;
}

export interface WsPosition {
  market_id: number;
  symbol: string;
  initial_margin_fraction: string;
  open_order_count: number;
  pending_order_count: number;
  position_tied_order_count: number;
  sign: number;
  position: string;
  avg_entry_price: string;
  position_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  liquidation_price: string;
  total_funding_paid_out?: string;
  margin_mode: number;
  allocated_margin: string;
  total_discount?: string;
}

export interface WsAsset {
  symbol: string;
  asset_id: number;
  balance: string;
  locked_balance: string;
}

export interface WsPoolShares {
  public_pool_index: number;
  shares_amount: number;
  entry_usdc: string;
  principal_amount: string;
  entry_timestamp: number;
}

export interface WsPositionFunding {
  timestamp: number;
  market_id: number;
  funding_id: number;
  change: string;
  rate: string;
  position_size: string;
  position_side: 'long' | 'short';
  discount?: string;
}

export interface WsCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  V: number;
  i: number;
}

export interface WsMarkPriceCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  sc: number;
}

// ============================================================================
// Public channel messages
// ============================================================================

/** `order_book/{marketIndex}` — order book snapshot + incremental updates. */
export interface WsOrderBookMessage {
  channel: string; // "order_book:{marketIndex}"
  last_updated_at?: number;
  offset: number;
  order_book: {
    code: number;
    asks: WsPriceLevel[];
    bids: WsPriceLevel[];
    offset: number;
    nonce: number;
    last_updated_at?: number;
    begin_nonce?: number;
  };
  timestamp: number;
  type: 'update/order_book';
}

/** `ticker/{marketIndex}` — best bid and offer (BBO). */
export interface WsTickerMessage {
  channel: string; // "ticker:{marketIndex}"
  last_updated_at: number;
  nonce: number;
  ticker: {
    s: string;
    a: WsPriceLevel;
    b: WsPriceLevel;
    last_updated_at: number;
  };
  timestamp: number;
  type: 'update/ticker';
}

/** `market_stats/{marketIndex}` — market statistics including BBO. */
export interface WsMarketStatsMessage {
  channel: string; // "market_stats:{marketIndex}"
  market_stats: {
    symbol: string;
    market_id: number;
    index_price: string;
    mark_price: string;
    mid_price: string;
    best_ask_price: string;
    best_bid_price: string;
    open_interest: string;
    open_interest_limit: string;
    funding_clamp_small: string;
    funding_clamp_big: string;
    last_trade_price: string;
    current_funding_rate: string;
    funding_rate: string;
    funding_timestamp: number;
    daily_base_token_volume: number;
    daily_quote_token_volume: number;
    daily_price_low: number;
    daily_price_high: number;
    daily_price_change: number;
    base_interest_rate: string;
    premium: string;
  };
  timestamp: number;
  type: 'update/market_stats';
}

/** `trade/{marketIndex}` — public trade tape. */
export interface WsTradeMessage {
  channel: string; // "trade:{marketIndex}"
  liquidation_trades: WsTrade[];
  nonce: number;
  trades: WsTrade[];
  type: 'update/trade';
}

/** `candle/{marketIndex}/{resolution}` — OHLCV candlesticks. */
export interface WsCandleMessage {
  channel: string; // "candle:{marketIndex}:{resolution}"
  timestamp: number;
  candles: WsCandle[];
  type: 'subscribed/candle' | 'update/candle';
}

/** `mark_price_candle/{marketIndex}/{resolution}` — mark price OHLCV. */
export interface WsMarkPriceCandleMessage {
  channel: string; // "mark_price_candle:{marketIndex}:{resolution}"
  timestamp: number;
  candles: WsMarkPriceCandle[];
  type: 'subscribed/mark_price_candle' | 'update/mark_price_candle';
}

/** `spot_market_stats/{marketIndex}` — spot market statistics. */
export interface WsSpotMarketStatsMessage {
  channel: string; // "spot_market_stats:{marketIndex}" or "spot_market_stats:all"
  spot_market_stats:
    | {
        symbol: string;
        market_id: number;
        index_price: string;
        mid_price: string;
        last_trade_price: string;
        daily_base_token_volume: number;
        daily_quote_token_volume: number;
        daily_price_low: number;
        daily_price_high: number;
        daily_price_change: number;
      }
    | Record<
        string,
        {
          symbol: string;
          market_id: number;
          index_price: string;
          mid_price: string;
          last_trade_price: string;
          daily_base_token_volume: number;
          daily_quote_token_volume: number;
          daily_price_low: number;
          daily_price_high: number;
          daily_price_change: number;
        }
      >;
  timestamp: number;
  type: 'update/spot_market_stats';
}

/** `height` — blockchain height updates. */
export interface WsHeightMessage {
  channel: 'height';
  height: number;
  timestamp: number;
  type: 'update/height';
}

// ============================================================================
// Private channel messages (require auth token)
// ============================================================================

/** `account_all/{accountId}` (auth) — full account snapshot + updates. */
export interface WsAccountAllMessage {
  account: number;
  assets?: Record<string, WsAsset>;
  channel: string; // "account_all:{accountId}"
  daily_trades_count?: number;
  daily_volume?: number;
  weekly_trades_count?: number;
  weekly_volume?: number;
  monthly_trades_count?: number;
  monthly_volume?: number;
  total_trades_count?: number;
  total_volume?: number;
  funding_histories?: WsPositionFunding[] | Record<string, WsPositionFunding>;
  positions: Record<string, WsPosition>;
  shares?: WsPoolShares[] | Record<string, WsPoolShares>;
  trades?: Record<string, WsTrade[]>;
  type: 'update/account_all';
}

/** `account_market/{marketId}/{accountId}` (auth) — per-market account data. */
export interface WsAccountMarketMessage {
  account: number;
  assets?: WsAsset[] | null;
  channel: string; // "account_market:{marketId}:{accountId}"
  funding_history?: WsPositionFunding | null;
  orders: WsOrder[];
  position: WsPosition[];
  trades: WsTrade[];
  type: 'update/account_market';
}

/** `account_orders/{marketId}/{accountId}` (auth) — per-market orders. */
export interface WsAccountOrdersMessage {
  account: number;
  channel: string; // "account_orders:{marketIndex}"
  nonce?: number;
  orders: Record<string, WsOrder[]>;
  type: 'update/account_orders';
}

/** `account_all_orders/{accountId}` (auth) — all orders across markets. */
export interface WsAccountAllOrdersMessage {
  channel: string; // "account_all_orders:{accountId}"
  orders: Record<string, WsOrder[]>;
  type: 'update/account_all_orders';
}

/** `account_all_trades/{accountId}` (auth) — all trades for account. */
export interface WsAccountAllTradesMessage {
  channel: string; // "account_all_trades:{accountId}"
  trades: Record<string, WsTrade[]> | WsTrade[];
  total_volume?: number;
  monthly_volume?: number;
  weekly_volume?: number;
  daily_volume?: number;
  type: 'subscribed/account_all_trades' | 'update/account_all_trades';
}

/** `account_all_positions/{accountId}` — all positions. */
export interface WsAccountAllPositionsMessage {
  channel: string; // "account_all_positions:{accountId}"
  positions: Record<string, WsPosition>;
  shares?: WsPoolShares[] | Record<string, WsPoolShares>;
  last_funding_round?: Record<string, string>;
  last_funding_discount?: Record<string, string>;
  type: 'subscribed/account_all_positions' | 'update/account_all_positions';
}

/** `account_all_assets/{accountId}` (auth) — spot asset balances. */
export interface WsAccountAllAssetsMessage {
  assets: Record<string, WsAsset>;
  channel: string; // "account_all_assets:{accountId}"
  timestamp: number;
  type: 'update/account_all_assets';
}

/** `account_tx/{accountId}` (auth) — transactions for account. */
export interface WsAccountTxMessage {
  channel: string; // "account_tx:{accountId}"
  txs: WsAccountTx[];
  type: 'update/account_tx';
}

export interface WsAccountTx {
  hash: string;
  type: number;
  info: string;
  event_info: string;
  status: number;
  transaction_index: number;
  l1_address: string;
  account_index: number;
  nonce: number;
  expire_at: number;
  block_height: number;
  queued_at: number;
  executed_at: number;
  sequence_index: number;
  parent_hash: string;
  api_key_index?: number;
  transaction_time?: number;
}

/** `user_stats/{accountId}` — account stats. */
export interface WsUserStatsMessage {
  channel: string; // "user_stats:{accountId}"
  stats: {
    collateral: string;
    portfolio_value: string;
    leverage: string;
    available_balance: string;
    margin_usage: string;
    buying_power: string;
    account_trading_mode: number;
    cross_stats: {
      collateral: string;
      portfolio_value: string;
      leverage: string;
      available_balance: string;
      margin_usage: string;
      buying_power: string;
    };
    total_stats: {
      collateral: string;
      portfolio_value: string;
      leverage: string;
      available_balance: string;
      margin_usage: string;
      buying_power: string;
    };
  };
  timestamp: number;
  type: 'update/user_stats';
}

/** `notification/{accountId}` (auth) — liquidation/deleverage/announcement alerts. */
export interface WsNotificationMessage {
  channel: string; // "notification:{accountId}"
  notifs: WsNotification[];
  type: 'subscribed/notification' | 'update/notification';
}

export interface WsNotification {
  id: string;
  created_at: string;
  updated_at: string;
  kind: 'liquidation' | 'deleverage' | 'announcement' | string;
  account_index: number;
  content: WsNotificationContent;
  ack: boolean;
  acked_at: string | null;
}

export interface WsNotificationContent {
  // Liquidation
  is_ask?: boolean;
  usdc_amount?: string;
  size?: string;
  market_index?: number;
  price?: string;
  timestamp?: number;
  avg_price?: string;
  // Deleverage
  settlement_price?: string;
  // Announcement
  title?: string;
  content?: string;
  created_at?: number;
  [key: string]: any;
}

/** `account_spot_avg_entry_prices/{accountId}` (auth). */
export interface WsAccountSpotAvgEntryPricesMessage {
  avg_entry_prices: Record<
    string,
    {
      asset_id: number;
      avg_entry_price: string;
      asset_size: string;
      last_trade_id: number;
    }
  >;
  channel: string;
  timestamp: number;
  type: 'subscribed/account_spot_avg_entry_prices';
}

/** `rfq` (auth) — open RFQ updates. */
export interface WsRfqMessage {
  channel: 'rfq';
  rfqs: WsRfq[];
  type: 'update/rfq';
}

export interface WsRfq {
  id: number;
  account_index: number;
  market_index: number;
  direction: number;
  base_amount: string;
  quote_amount: string;
  status: string;
  metadata: Record<string, any>;
  responses: any[];
  created_at: number;
  updated_at: number;
}

/** `pool_data/{accountId}` (auth). */
export interface WsPoolDataMessage {
  channel: string;
  account: number;
  trades: Record<string, WsTrade[]>;
  orders: Record<string, WsOrder[]>;
  positions: Record<string, WsPosition[]>;
  shares: WsPoolShares[];
  funding_histories: Record<string, WsPositionFunding[]>;
  type: 'subscribed/pool_data';
}

/** `pool_info/{accountId}` (auth). */
export interface WsPoolInfoMessage {
  channel: string;
  pool_info: {
    status: number;
    operator_fee: string;
    min_operator_share_rate: string;
    total_shares: number;
    operator_shares: number;
    annual_percentage_yield: number;
    sharpe_ratio: number;
    daily_returns: Array<{ timestamp: number; daily_return: number }>;
    share_prices: Array<{ timestamp: number; share_price: number }>;
    strategies: Array<{ collateral: string }>;
  };
  type: 'subscribed/pool_info';
}

// ============================================================================
// Union of all message types (for the raw onMessage handler)
// ============================================================================

export type WsMessage =
  | WsOrderBookMessage
  | WsTickerMessage
  | WsMarketStatsMessage
  | WsTradeMessage
  | WsCandleMessage
  | WsMarkPriceCandleMessage
  | WsSpotMarketStatsMessage
  | WsHeightMessage
  | WsAccountAllMessage
  | WsAccountMarketMessage
  | WsAccountOrdersMessage
  | WsAccountAllOrdersMessage
  | WsAccountAllTradesMessage
  | WsAccountAllPositionsMessage
  | WsAccountAllAssetsMessage
  | WsAccountTxMessage
  | WsUserStatsMessage
  | WsNotificationMessage
  | WsAccountSpotAvgEntryPricesMessage
  | WsRfqMessage
  | WsPoolDataMessage
  | WsPoolInfoMessage
  | { type: string; channel?: string; [key: string]: any };

// ============================================================================
// Channel name helpers
// ============================================================================

export function orderBookChannel(marketId: number): string {
  return `order_book/${marketId}`;
}

export function tickerChannel(marketId: number): string {
  return `ticker/${marketId}`;
}

export function marketStatsChannel(marketId: number): string {
  return `market_stats/${marketId}`;
}

export function tradeChannel(marketId: number): string {
  return `trade/${marketId}`;
}

export function candleChannel(marketId: number, resolution: string): string {
  return `candle/${marketId}/${resolution}`;
}

export function markPriceCandleChannel(marketId: number, resolution: string): string {
  return `mark_price_candle/${marketId}/${resolution}`;
}

export function accountAllChannel(accountId: number): string {
  return `account_all/${accountId}`;
}

export function accountMarketChannel(marketId: number, accountId: number): string {
  return `account_market/${marketId}/${accountId}`;
}

export function accountOrdersChannel(marketId: number, accountId: number): string {
  return `account_orders/${marketId}/${accountId}`;
}

export function accountAllOrdersChannel(accountId: number): string {
  return `account_all_orders/${accountId}`;
}

export function accountAllTradesChannel(accountId: number): string {
  return `account_all_trades/${accountId}`;
}

export function accountAllPositionsChannel(accountId: number): string {
  return `account_all_positions/${accountId}`;
}

export function accountAllAssetsChannel(accountId: number): string {
  return `account_all_assets/${accountId}`;
}

export function accountTxChannel(accountId: number): string {
  return `account_tx/${accountId}`;
}

export function userStatsChannel(accountId: number): string {
  return `user_stats/${accountId}`;
}

export function notificationChannel(accountId: number): string {
  return `notification/${accountId}`;
}

export function heightChannel(): string {
  return 'height';
}