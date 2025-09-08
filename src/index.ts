// Core exports
export { ApiClient } from './api/api-client';
export { WsClient } from './api/ws-client';
export { Config } from './utils/configuration';

// API exports
export { AccountApi } from './api/account-api';
export { OrderApi } from './api/order-api';
export { TransactionApi } from './api/transaction-api';
export { BlockApi } from './api/block-api';
export { CandlestickApi } from './api/candlestick-api';
export { RootApi } from './api/root-api';

// Signer exports
export { SignerClient } from './signer/signer-client';
export { SignerClient as WasmSignerClient } from './signer/wasm-signer-client';

// WASM Signer utilities
export { WasmSignerClient as WasmSigner, createWasmSignerClient } from './utils/wasm-signer';
export { NodeWasmSignerClient, createNodeWasmSignerClient } from './utils/node-wasm-signer';

// Utility exports
export { createApiKey, generateRandomSeed } from './utils/api-key-utils';

// Type exports
export * from './types';
export * from './utils/exceptions';

// Re-export types from API modules
export type {
  Account,
  AccountPosition,
  Order as AccountOrder,
  Trade as AccountTrade,
  AccountApiKeys,
  ApiKey,
  PublicPool,
  PublicPoolShare,
} from './api/account-api';

export type {
  OrderBook,
  PriceLevel,
  OrderBookDetail,
  OrderBookOrders,
  Order,
  Trade,
  ExchangeStats,
} from './api/order-api';

export type {
  Transaction,
  Block,
  NextNonce,
  TxHash,
  TxHashes,
} from './api/transaction-api';

export type {
  Candlestick,
  Funding,
  RootInfo,
} from './types';

// Default configuration
export const DEFAULT_CONFIG = {
  host: 'https://mainnet.zklighter.elliot.ai',
  timeout: 30000,
  userAgent: 'Lighter-TypeScript-SDK/1.0.0',
};

// Version
export const VERSION = '1.0.0';