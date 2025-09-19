/**
 * Lighter TypeScript SDK
 * 
 * A comprehensive TypeScript SDK for interacting with the Lighter Protocol,
 * a decentralized perpetual exchange built on zkSync.
 */

// Core API Classes
export { ApiClient } from './api/api-client';
export { AccountApi } from './api/account-api';
export { BlockApi } from './api/block-api';
export { OrderApi } from './api/order-api';
export { TransactionApi } from './api/transaction-api';
export { RootApi } from './api/root-api';
export { CandlestickApi } from './api/candlestick-api';

// Signer Client
export { SignerClient } from './signer/wasm-signer-client';
export type { SignerConfig } from './signer/wasm-signer-client';

// Signer Server Client
export { SignerServerClient, createSignerServerClient } from './utils/signer-server';
export type { SignerServerConfig, SignerServerResponse } from './utils/signer-server';

// WASM Signer Classes
export { WasmSignerClient, createWasmSignerClient } from './utils/wasm-signer';
export { NodeWasmSignerClient, createNodeWasmSignerClient } from './utils/node-wasm-signer';
export type { 
  WasmSignerConfig, 
  CreateClientParams,
  CreateOrderParams,
  CancelOrderParams,
  CancelAllOrdersParams,
  TransferParams,
  UpdateLeverageParams,
  WasmSignerResponse
} from './utils/wasm-signer';

// WebSocket Client
export { WsClient } from './api/ws-client';

// Exception Classes
export {
  LighterException,
  ApiException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  TooManyRequestsException,
  ServiceException,
  ValidationException,
  ConfigurationException
} from './utils/exceptions';

// Types from AccountApi
export type { 
  Account,
  AccountPosition,
  AccountApiKeys,
  ApiKey,
  PublicPool,
  PublicPoolShare,
  Trade
} from './api/account-api';

// Types from OrderApi
export type {
  OrderBook,
  OrderBookDetail,
  OrderBookOrders,
  Order,
  ExchangeStats,
  PriceLevel
} from './api/order-api';

// Types from TransactionApi
export type {
  Transaction,
  Block,
  NextNonce,
  TxHash,
  TxHashes
} from './api/transaction-api';

// Types from BlockApi
export type {
  BlockQuery,
  BlocksQuery,
  CurrentHeightResponse
} from './api/block-api';

// Types from CandlestickApi
export type {
  CandlestickQuery,
  FundingQuery
} from './api/candlestick-api';

export type {
  OrderBookParams,
  TradeParams,
  TransactionParams,
  BlockParams,
  PaginationParams,
  Configuration,
  ApiResponse,
  ApiError,
  WebSocketConfig,
  WebSocketSubscription
} from './types';

// Utility Classes
export { Config } from './utils/configuration';
export { createApiKey, generateRandomSeed } from './utils/api-key-utils';
export type { ApiKeyPair } from './utils/api-key-utils';

// Constants
export const LIGHTER_CONSTANTS = {
  // Order Types
  ORDER_TYPE_LIMIT: 0,
  ORDER_TYPE_MARKET: 1,
  
  // Time in Force
  ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL: 0,
  ORDER_TIME_IN_FORCE_GOOD_TILL_TIME: 1,
  ORDER_TIME_IN_FORCE_FILL_OR_KILL: 2,
  
  // Cancel All Orders Time in Force
  CANCEL_ALL_TIF_IMMEDIATE: 0,
  CANCEL_ALL_TIF_SCHEDULED: 1,
  CANCEL_ALL_TIF_ABORT: 2,
  
  // Margin Modes
  CROSS_MARGIN_MODE: 0,
  ISOLATED_MARGIN_MODE: 1,
  
  // Transaction Types
  TX_TYPE_CREATE_ORDER: 1,
  TX_TYPE_CANCEL_ORDER: 2,
  TX_TYPE_CANCEL_ALL_ORDERS: 3,
  TX_TYPE_TRANSFER: 4,
  TX_TYPE_UPDATE_LEVERAGE: 20,
  
  // Other Constants
  NIL_TRIGGER_PRICE: 0,
  DEFAULT_28_DAY_ORDER_EXPIRY: -1,
  DEFAULT_IOC_EXPIRY: 0,
  DEFAULT_10_MIN_AUTH_EXPIRY: -1,
  MINUTE: 60,
  USDC_TICKER_SCALE: 1e6
} as const;

// Default Configuration
export const DEFAULT_CONFIG = {
  MAINNET_URL: 'https://mainnet.zklighter.elliot.ai',
  TESTNET_URL: 'https://testnet.zklighter.elliot.ai',
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_RETRIES: 3
} as const;

// Version
export const VERSION = '1.0.0';