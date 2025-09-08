export interface Configuration {
  host: string;
  apiKey?: string;
  secretKey?: string;
  timeout?: number;
  userAgent?: string;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

export interface PaginationParams {
  index?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

export interface CursorParams {
  cursor?: string;
  limit?: number;
}

export interface AccountParams {
  by: 'index' | 'l1_address';
  value: string;
}

export interface BlockParams {
  by: 'height' | 'hash';
  value: string;
}

export interface TransactionParams {
  by: 'sequence_index' | 'hash' | 'l1_tx_hash';
  value: string;
}

export interface CandlestickParams {
  market_id: number;
  resolution: string;
  start_timestamp?: number;
  end_timestamp?: number;
  count_back?: number;
}

export interface OrderBookParams {
  market_id: number;
  depth?: number;
}

export interface TradeParams {
  market_id: number;
  limit?: number;
}

export interface CreateOrderParams {
  market_id: number;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  size: string;
  price?: string;
  reduce_only?: boolean;
  post_only?: boolean;
  time_in_force?: 'GTC' | 'IOC' | 'FOK';
  client_order_id?: string;
}

export interface CancelOrderParams {
  market_id: number;
  order_id: string;
}

export interface SendTransactionParams {
  account_index: number;
  api_key_index: number;
  transaction: string;
}

export interface SendTransactionBatchParams {
  account_index: number;
  api_key_index: number;
  transactions: string[];
}

export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (data: any) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onOpen?: () => void;
}

export interface WebSocketSubscription {
  channel: string;
  params?: Record<string, any>;
}

export interface SignerConfig {
  privateKey: string;
  accountIndex: number;
  apiKeyIndex: number;
}

export interface ApiKeyConfig {
  apiKey: string;
  secretKey: string;
  accountIndex: number;
  apiKeyIndex: number;
}

export interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transactions: string[];
  parent_hash: string;
  state_root: string;
}

export interface Candlestick {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface Funding {
  timestamp: number;
  funding_rate: string;
  funding_index: string;
}

export interface RootInfo {
  version: string;
  chain_id: string;
  block_height: number;
}