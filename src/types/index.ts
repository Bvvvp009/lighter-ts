/**
 * Main types export file
 * Re-exports all types from organized modules
 */

// Re-export all types from organized modules
export * from './config';
export * from './api';
export * from './trading';
export * from './transaction';

// Additional types that don't fit into other categories
export interface RootInfo {
  version: string;
  chain_id: string;
  block_height: number;
  contract_address?: string;
}

export interface Funding {
  timestamp: number;
  funding_rate: string;
  funding_index: string;
}

export interface CursorParams {
  cursor?: string;
  limit?: number;
}

export interface AccountParams {
  by: 'index' | 'l1_address';
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
  sort?: 'asc' | 'desc';
}

// Legacy transaction params for API compatibility
export interface TransactionParams {
  by: 'sequence_index' | 'hash' | 'l1_tx_hash';
  value: string;
}