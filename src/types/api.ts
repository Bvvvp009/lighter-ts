/**
 * API-related type definitions
 * Types for API responses, requests, and data structures
 */

// Account Types
export interface Account {
  index: string;
  l1_address: string;
  l2_address: string;
  nonce: string;
  balance: string;
  margin_balance: string;
  free_margin: string;
  margin_used: string;
  total_margin_used: string;
  total_margin_balance: string;
}

export interface SubAccount {
  index: string;
  l1_address: string;
  l2_address: string;
}

export interface AccountPosition {
  market_id: number;
  side: 'long' | 'short';
  size: string;
  entry_price: string;
  mark_price: string;
  pnl: string;
  margin_used: string;
  margin_ratio: string;
}

export interface AccountApiKeys {
  keys: ApiKey[];
}

export interface ApiKey {
  index: number;
  public_key: string;
  created_at: string;
  is_active: boolean;
}

// Transaction Types
export interface Transaction {
  hash: string;
  block_height: number;
  sequence_index: number;
  account_index: number;
  nonce: number;
  type: string | number;
  info?: string;
  event_info?: string;
  data?: any;
  status: number | 'pending' | 'confirmed' | 'failed';
  transaction_index?: number;
  l1_address?: string;
  expire_at?: number;
  queued_at?: number;
  committed_at?: number;
  executed_at?: number;
  verified_at?: number;
  parent_hash?: string;
  // Enhanced error fields (matching Python SDK EnrichedTx)
  code?: number;
  message?: string;
}

export interface NextNonce {
  account_index: number;
  api_key_index: number;
  nonce: number;
}

export interface TxHash {
  tx_hash: string;
  hash?: string;
}

// Candlestick Types
export interface Candlestick {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface CandlestickQuery {
  market_id: number;
  interval: string;
  start_time?: number;
  end_time?: number;
  count_back?: number;
}

export interface FundingQuery {
  market_id: number;
  start_time?: number;
  end_time?: number;
  count_back?: number;
}

// Block Types
export interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transactions: string[];
  parent_hash: string;
  state_root: string;
}

export interface BlockQuery {
  by: 'height' | 'hash';
  value: string;
}

export interface BlocksQuery {
  start_height?: number;
  end_height?: number;
  limit?: number;
}

// Market Data Types
export interface MarketData {
  market_id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  tick_size: string;
  step_size: string;
  min_order_size: string;
  max_order_size: string;
  status: 'active' | 'inactive';
}

// Exchange Stats
export interface ExchangeStats {
  total_volume_24h: string;
  total_trades_24h: number;
  active_markets: number;
}

// Bridge Types
export interface FastBridgeInfo {
  code: number;
  message?: string;
  fast_bridge_limit: string;
}

export interface BridgeSupportedNetwork {
  name: string;
  chain_id: string;
  explorer: string;
}

// Transfer Types
export interface TransferParams {
  toAccountIndex: number;
  usdcAmount: number;
  fee: number;
  memo: string;
  ethPrivateKey: string;
  nonce?: number;
}

export interface WithdrawParams {
  usdcAmount: number;
  nonce?: number;
}

// Deposit History Types
export interface DepositHistoryItem {
  id: string;
  amount: string;
  timestamp: number;
  status: 'failed' | 'pending' | 'completed' | 'claimable';
  l1_tx_hash: string;
}

export interface DepositHistory {
  code: number;
  message?: string;
  deposits: DepositHistoryItem[];
  cursor: string;
}

export interface WithdrawHistoryItem {
  id: string;
  amount: string;
  timestamp: number;
  status: 'failed' | 'pending' | 'completed' | 'claimable';
  l1_tx_hash: string;
}

export interface WithdrawHistory {
  code: number;
  message?: string;
  withdrawals: WithdrawHistoryItem[];
  cursor: string;
}

// L1-to-L2 Bridge Types
export interface L1DepositParams {
  ethPrivateKey: string;
  usdcAmount: number;
  l2AccountIndex: number;
  rpcUrl?: string;
  gasPrice?: string;
  gasLimit?: number;
}

export interface L1DepositResult {
  l1TxHash: string;
  l2AccountIndex: number;
  amount: string;
  status: 'pending' | 'completed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
}

export interface L1BridgeConfig {
  l1BridgeContract: string;
  usdcContract: string;
  rpcUrl: string;
  chainId: number;
}