/**
 * Transaction Type Compatibility Layer
 * Handles translation between WASM transaction formats
 */

export const TransactionTypeMap = {
  // Simple transactions (direct Rust WASM support)
  CREATE_ORDER: 14,
  CANCEL_ORDER: 15,
  CREATE_AUTH_TOKEN: 16,
  
  // Compound transactions (may need legacy WASM)
  CHANGE_PUB_KEY: 8,
  CREATE_SUBACCOUNT: 28,
  UPDATE_MARGIN: 21,
  UPDATE_LEVERAGE: 20,
  TRANSFER: 5,
  WITHDRAW: 6,
  
  // Grouped/complex transactions
  CREATE_GROUPED_ORDERS: 50,
  CREATE_PUBLIC_POOL: 31,
  UPDATE_PUBLIC_POOL: 32,
  MINT_SHARES: 33,
  BURN_SHARES: 34,
  MODIFY_ORDER: 40,
  CANCEL_ALL_ORDERS: 41,
  CREATE_TWAP_ORDER: 42,
};

/**
 * Determine if a transaction type can be handled by Rust WASM alone
 */
export function canHandleWithRustWasm(txType: number): boolean {
  return [
    TransactionTypeMap.CREATE_ORDER,
    TransactionTypeMap.CANCEL_ORDER,
    TransactionTypeMap.CREATE_AUTH_TOKEN,
    TransactionTypeMap.CHANGE_PUB_KEY,
  ].includes(txType);
}

/**
 * Determine if a transaction requires legacy WASM
 */
export function requiresGoWasm(txType: number): boolean {
  return [
    TransactionTypeMap.CREATE_SUBACCOUNT,
    TransactionTypeMap.UPDATE_MARGIN,
    TransactionTypeMap.UPDATE_LEVERAGE,
    TransactionTypeMap.TRANSFER,
    TransactionTypeMap.WITHDRAW,
    TransactionTypeMap.CREATE_GROUPED_ORDERS,
    TransactionTypeMap.CREATE_PUBLIC_POOL,
    TransactionTypeMap.UPDATE_PUBLIC_POOL,
    TransactionTypeMap.MINT_SHARES,
    TransactionTypeMap.BURN_SHARES,
    TransactionTypeMap.MODIFY_ORDER,
    TransactionTypeMap.CANCEL_ALL_ORDERS,
    TransactionTypeMap.CREATE_TWAP_ORDER,
  ].includes(txType);
}

/**
 * Create a stub response for unsupported transaction types
 */
export function createUnsupportedTxError(txType: number): string {
  const typeName = Object.entries(TransactionTypeMap).find(([_, v]) => v === txType)?.[0] || 'UNKNOWN';
  return `Unsupported transaction type: ${txType} (${typeName}). Requires a supported WASM implementation.`;
}
