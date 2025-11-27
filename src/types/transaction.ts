/**
 * Transaction-related type definitions
 * Types for transaction status, types, and operations
 */

// Transaction Status
export enum TransactionStatus {
  PENDING = 0,
  QUEUED = 1,
  COMMITTED = 2,
  EXECUTED = 3,
  FAILED = 4,
  REJECTED = 5
}

// Transaction Types
export enum TransactionType {
  TRANSFER = 12,
  WITHDRAW = 13,
  UPDATE_LEVERAGE = 14,
  CREATE_ORDER = 15,
  CANCEL_ORDER = 16,
  CANCEL_ALL_ORDERS = 17,
  CHANGE_PUBKEY = 18
}

// Transaction Parameters
export interface TransactionParams {
  accountIndex: number;
  apiKeyIndex: number;
  nonce: number;
  type: TransactionType;
  data: any;
}

// API Transaction Parameters (different from above)
export interface ApiTransactionParams {
  by: 'sequence_index' | 'hash' | 'l1_tx_hash';
  value: string;
}

export interface SendTransactionParams {
  transaction: string;
  account_index: number;
  api_key_index: number;
  price_protection?: boolean;
}

export interface SendTransactionBatchParams {
  account_index?: number;
  api_key_index?: number;
  transactions?: string[];
  tx_types?: string; // JSON stringified array of transaction types
  tx_infos?: string; // JSON stringified array of transaction infos
}

// Transaction Results
export interface TransactionResult {
  hash: string;
  status: TransactionStatus;
  blockHeight?: number;
  error?: string;
  data?: any;
}

// Block Parameters
export interface BlockParams {
  by: 'height' | 'hash';
  value: string;
}
