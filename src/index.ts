/**
 * Lighter TypeScript SDK
 * 
 * A comprehensive TypeScript SDK for interacting with the Lighter Protocol,
 * a decentralized perpetual exchange built on zkProof.
 */

// Core API Classes
export { ApiClient } from './api/api-client';
export { AccountApi } from './api/account-api';
export { AnnouncementApi } from './api/announcement-api';
export { BlockApi } from './api/block-api';
export { BridgeApi } from './api/bridge-api';
export { FundingApi } from './api/funding-api';
export { NotificationApi } from './api/notification-api';
export { OrderApi } from './api/order-api';
export { ReferralApi } from './api/referral-api';
export { TransactionApi } from './api/transaction-api';
export { RootApi } from './api/root-api';
export { CandlestickApi } from './api/candlestick-api';

// Bridge Classes
export { L1BridgeClient } from './bridge/l1-bridge-client';

// Signer Client
export { SignerClient } from './signer/wasm-signer-client';
export type { 
  SignerConfig,
  CreateOrderParams as SignerCreateOrderParams,
  CreateMarketOrderParams,
  CancelOrderParams as SignerCancelOrderParams,
  ChangeApiKeyParams
} from './signer/wasm-signer-client';

// Note: Signer Server Client removed - using local WASM signer instead

// WASM Signer Classes
export { WasmSignerClient, createWasmSignerClient, WasmManager } from './signer/wasm-signer';
export type { 
  WasmSignerConfig, 
  WasmConfig,
  WasmClientType,
  CreateClientParams,
  CreateOrderParams,
  CancelOrderParams,
  CancelAllOrdersParams,
  UpdateLeverageParams,
  ModifyOrderParams,
  UpdateMarginParams,
  CreateSubAccountParams,
  CreatePublicPoolParams,
  UpdatePublicPoolParams,
  MintSharesParams,
  BurnSharesParams,
  CreateGroupedOrderParams,
  CreateGroupedOrdersParams,
  WasmSignerResponse,
  ApiKeyPair
} from './signer/wasm-signer';

// Export Order Types and Enums from the unified order file
export { 
  OrderType,
  TimeInForce,
  TransactionStatus,
  TransactionType
} from './signer/wasm-signer-client';

// Export MarketHelper for simplified market utilities
export { MarketHelper } from './utils/market-helper';

// Export Order Status Checking utilities
export { checkOrderStatus, formatOrderResult, getCancelReason } from './utils/order-status-checker';
export type { OrderStatusResult } from './utils/order-status-checker';

// WebSocket Client
export { WsClient } from './api/ws-client';
export { WebSocketOrderClient } from './api/ws-order-client';
export type {
  LighterWsSendTx,
  LighterWsSendBatchTx,
  LighterWsTransaction,
  WsOrderRequest,
  WsOrderResponse,
  WsConnectionConfig
} from './api/ws-order-client';

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
  SubAccount,
  AccountPosition,
  AccountApiKeys,
  ApiKey,
  PublicPool,
  PublicPoolShare,
  FeeBucket,
  PnLEntry,
  PnLResponse,
  Trade
} from './api/account-api';

// Types from OrderApi
export type {
  OrderBook,
  OrderBookDetail,
  OrderBookDetailsResponse,
  OrderBookDetailItem,
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
  TxHashes,
  DepositHistory,
  DepositHistoryItem,
  WithdrawHistory,
  WithdrawHistoryItem
} from './api/transaction-api';

// Types from BridgeApi
export type {
  FastBridgeInfo,
  BridgeSupportedNetwork
} from './api/bridge-api';
export type {
  TransferParams,
  WithdrawParams,
  L1DepositParams,
  L1DepositResult,
  L1BridgeConfig
} from './types/api';

// Types from FundingApi
export type {
  FundingRate,
  FundingRates
} from './api/funding-api';

// Types from NotificationApi
export type {
  ResultCode
} from './api/notification-api';

// Types from ReferralApi
export type {
  ReferralPointEntry,
  ReferralPoints
} from './api/referral-api';

// Types from AnnouncementApi
export type {
  Announcement,
  Announcements
} from './api/announcement-api';

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
// API Key utilities removed - use WASM signer for key generation

// New Utility Exports
export * from './utils/price-utils';
export * from './utils/nonce-manager';
// Client Factory removed - use direct client creation instead

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
  USDC_TICKER_SCALE: 1e6,
  
  // Transaction Status Codes
  TX_STATUS_PENDING: 0,
  TX_STATUS_QUEUED: 1,
  TX_STATUS_COMMITTED: 2,
  TX_STATUS_EXECUTED: 3,
  TX_STATUS_FAILED: 4,
  TX_STATUS_REJECTED: 5
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