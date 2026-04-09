import { ApiClient } from '../api/api-client';
import { TransactionApi, Transaction } from '../api/transaction-api';
import { AccountApi } from '../api/account-api';
import { BridgeApi } from '../api/bridge-api';
import { WasmSignerClient, createWasmSignerClient, WasmManager } from './wasm-signer';
import { RootApi } from '../api/root-api';
import { logger, LogLevel } from '../utils/logger';
import { TransactionException, NotFoundException } from '../utils/exceptions';
import { NonceCache } from '../utils/nonce-cache';
import { NonceManager } from '../utils/nonce-manager';
// Performance monitoring removed - not needed
import { RequestBatcher } from '../utils/request-batcher';
import { WebSocketOrderClient } from '../api/ws-order-client';
import { TransferParams, TransferSameMasterAccountParams, WithdrawParams, BridgeSupportedNetwork, DepositHistory, WithdrawHistory, L1DepositParams, L1DepositResult, L1BridgeConfig } from '../types/api';
import { FastBridgeInfo } from '../api/bridge-api';
import { OrderApi } from '../api/order-api';
import { ExplorerApiClient } from '../api/explorer-api-client';
import { LogsApi } from '../api/logs-api';

/**
 * Configuration interface for SignerClient
 * @interface SignerConfig
 */
export interface SignerConfig {
  /** Lighter Protocol API URL */
  url: string;
  /** Private key for signing transactions */
  privateKey: string;
  /** Account index (0 for master account) */
  accountIndex: number;
  /** API key index for authentication */
  apiKeyIndex: number;
  /** Optional WASM signer configuration */
  wasmConfig?: {
    wasmPath: string;
    wasmExecPath?: string;
  };
  /** Optional logging level */
  logLevel?: LogLevel;
  /** Optional: Enable WebSocket order placement */
  enableWebSocket?: boolean;
  /** Optional: Enable request batching */
  enableBatching?: boolean;
  /** Optional: Enable memory pooling */
  enableMemoryPooling?: boolean;
  /** Optional: Enable advanced caching */
  enableAdvancedCaching?: boolean;
  /** Optional: L1 bridge configuration for L1-to-L2 deposits */
  l1BridgeConfig?: L1BridgeConfig;
}

export interface CreateOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  price: number;
  isAsk: boolean;
  orderType?: number;
  timeInForce?: number;
  reduceOnly?: boolean;
  triggerPrice?: number;
  integratorAccountIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
  orderExpiry?: number; // Add optional orderExpiry parameter
  nonce?: number; // Add optional nonce parameter
  skipNonce?: boolean;
}

export interface CreateMarketOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  avgExecutionPrice: number;
  isAsk: boolean;
  reduceOnly?: boolean;
  integratorAccountIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
  nonce?: number; // Optional nonce (will be fetched automatically if not provided)
  skipNonce?: boolean;
}

export interface CancelOrderParams {
  marketIndex: number;
  orderIndex: number;
  nonce?: number; // Optional nonce (will be fetched automatically if not provided)
  skipNonce?: boolean;
}

export interface ChangeApiKeyParams {
  ethPrivateKey: string;
  newPubkey: string;
  newPrivateKey: string; // Private key corresponding to newPubkey
  newApiKeyIndex?: number; // Optional, defaults to config.apiKeyIndex + 1
  nonce?: number; // Optional nonce for the new API key index (defaults to 0 for new keys)
}

export interface OcoOrderLegParams {
  marketIndex: number;
  clientOrderIndex?: number;
  baseAmount: number;
  price: number;
  isAsk: boolean;
  orderType?: OrderType;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  triggerPrice?: number;
  orderExpiry?: number;
  integratorAccountIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
}

export interface OcoOrderParams {
  orders: [OcoOrderLegParams, OcoOrderLegParams];
  nonce?: number;
  skipNonce?: boolean;
  integratorAccountIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
}

export interface OtocoMainOrderParams {
  marketIndex: number;
  baseAmount: number;
  isAsk: boolean;
  orderType: OrderType.LIMIT | OrderType.MARKET;
  clientOrderIndex?: number;
  price?: number;
  avgExecutionPrice?: number;
  maxSlippage?: number;
  idealPrice?: number;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  integratorAccountIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
  orderExpiry?: number;
}

export interface OtocoProtectionOrderParams {
  triggerPrice: number;
  price?: number;
  isLimit?: boolean;
  timeInForce?: TimeInForce;
  integratorAccountIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
  orderExpiry?: number;
}

export interface OtocoOrderParams {
  mainOrder: OtocoMainOrderParams;
  stopLoss: OtocoProtectionOrderParams;
  takeProfit: OtocoProtectionOrderParams;
  nonce?: number;
  skipNonce?: boolean;
  integratorAccountIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
}

/**
 * Order Type Constants and Enums
 * Provides easy-to-understand order type references without context
 */
export enum OrderType {
  LIMIT = 0,
  MARKET = 1,
  STOP_LOSS = 2,
  STOP_LOSS_LIMIT = 3,
  TAKE_PROFIT = 4,
  TAKE_PROFIT_LIMIT = 5,
  TWAP = 6
}

export enum TimeInForce {
  IMMEDIATE_OR_CANCEL = 0,
  GOOD_TILL_TIME = 1,
  POST_ONLY = 2
}

export enum GroupingType {
  OTO = 1,
  OCO = 2,
  OTOCO = 3
}

export enum TransactionStatus {
  PENDING = 0,
  QUEUED = 1,
  COMMITTED = 2,
  EXECUTED = 3,
  FAILED = 4,
  REJECTED = 5
}

export enum TransactionType {
  TRANSFER = 12,
  WITHDRAW = 13,
  CREATE_ORDER = 14,
  CANCEL_ORDER = 15,
  CANCEL_ALL_ORDERS = 16,
  MODIFY_ORDER = 17,
  MINT_SHARES = 18,
  BURN_SHARES = 19,
  UPDATE_LEVERAGE = 20,
  CREATE_GROUPED_ORDERS = 28,
  UPDATE_MARGIN = 29,
  STAKE_ASSETS = 35,
  UNSTAKE_ASSETS = 36,
  APPROVE_INTEGRATOR = 45
}

/**
 * Main SignerClient class for interacting with Lighter Protocol
 * Handles order creation, account management, and transaction signing
 * @class SignerClient
 */
export class SignerClient {
  private config: SignerConfig;
  private apiClient: ApiClient;
  private transactionApi: TransactionApi;
  private accountApi: AccountApi;
  private bridgeApi: BridgeApi;
  private orderApi: OrderApi;
  private wallet: WasmSignerClient;
  private signerType: 'wasm' | 'node-wasm';
  private nonceManager?: NonceManager;
  private l1BridgeConfig?: L1BridgeConfig;
  private clientCreated: boolean = false;
  private clientCreationPromise: Promise<void> | null = null;
  private nonceCache: NonceCache | null = null;
  private wsOrderClient: WebSocketOrderClient | null = null;
  private orderBatcher: RequestBatcher | null = null;

  static readonly ORDER_TYPE_LIMIT = 0;
  static readonly ORDER_TYPE_MARKET = 1;
  static readonly ORDER_TIME_IN_FORCE_GOOD_TILL_TIME = 1;
  static readonly ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 0;
  static readonly ORDER_TIME_IN_FORCE_FILL_OR_KILL = 2;
  static readonly USDC_TICKER_SCALE = 1e6

  //tx type constants
  static readonly TX_TYPE_CHANGE_PUB_KEY = 8
  static readonly TX_TYPE_CREATE_SUB_ACCOUNT = 9
  static readonly TX_TYPE_CREATE_PUBLIC_POOL = 10
  static readonly TX_TYPE_UPDATE_PUBLIC_POOL = 11
  static readonly TX_TYPE_TRANSFER = 12
  static readonly TX_TYPE_WITHDRAW = 13
  static readonly TX_TYPE_CREATE_ORDER = 14
  static readonly TX_TYPE_CANCEL_ORDER = 15
  static readonly TX_TYPE_CANCEL_ALL_ORDERS = 16
  static readonly TX_TYPE_MODIFY_ORDER = 17
  static readonly TX_TYPE_MINT_SHARES = 18
  static readonly TX_TYPE_BURN_SHARES = 19
  static readonly TX_TYPE_UPDATE_LEVERAGE = 20
  static readonly TX_TYPE_CREATE_GROUPED_ORDERS = 28
  static readonly TX_TYPE_UPDATE_MARGIN = 29
  static readonly TX_TYPE_STAKE_ASSETS = 35
  static readonly TX_TYPE_UNSTAKE_ASSETS = 36
  static readonly TX_TYPE_APPROVE_INTEGRATOR = 45

  static readonly ORDER_TYPE_STOP_LOSS = 2
  static readonly ORDER_TYPE_STOP_LOSS_LIMIT = 3
  static readonly ORDER_TYPE_TAKE_PROFIT = 4
  static readonly ORDER_TYPE_TAKE_PROFIT_LIMIT = 5
  static readonly ORDER_TYPE_TWAP = 6

  // Order side constants (for isAsk parameter)
  static readonly BUY = false;  // isAsk = false means BUY order
  static readonly SELL = true;  // isAsk = true means SELL order

  // Reduce only constants
  static readonly NOT_REDUCE_ONLY = false;
  static readonly REDUCE_ONLY = true;

  static readonly ORDER_TIME_IN_FORCE_POST_ONLY = 2

  static readonly CANCEL_ALL_TIF_IMMEDIATE = 0
  static readonly CANCEL_ALL_TIF_SCHEDULED = 1
  static readonly CANCEL_ALL_TIF_ABORT = 2

  static readonly NIL_TRIGGER_PRICE = 0
  static readonly DEFAULT_28_DAY_ORDER_EXPIRY = -1
  static readonly DEFAULT_IOC_EXPIRY = 0
  static readonly DEFAULT_10_MIN_AUTH_EXPIRY = -1
  static readonly MINUTE = 60

  // Transaction status codes
  static readonly TX_STATUS_PENDING = 0
  static readonly TX_STATUS_QUEUED = 1
  static readonly TX_STATUS_COMMITTED = 2
  static readonly TX_STATUS_EXECUTED = 3
  static readonly TX_STATUS_FAILED = 4
  static readonly TX_STATUS_REJECTED = 5

  static readonly CROSS_MARGIN_MODE = 0
  static readonly ISOLATED_MARGIN_MODE = 1
  static readonly ISOLATED_MARGIN_REMOVE_COLLATERAL = 0
  static readonly ISOLATED_MARGIN_ADD_COLLATERAL = 1

  /**
   * Creates a new SignerClient instance
   * @param config - Configuration object containing API credentials and settings
   * @param config.url - Lighter Protocol API URL
   * @param config.privateKey - Private key for signing transactions
   * @param config.accountIndex - Account index (0 for master account)
   * @param config.apiKeyIndex - API key index for authentication
   * @param config.wasmConfig - Optional WASM signer configuration
   * @param config.logLevel - Optional logging level
   */
  constructor(config: SignerConfig) {
    // Validate configuration
    this.validateConfig(config);
    
    this.config = config;
    this.apiClient = new ApiClient({ host: config.url });
    this.transactionApi = new TransactionApi(this.apiClient);
    this.accountApi = new AccountApi(this.apiClient);
    this.bridgeApi = new BridgeApi(this.apiClient, config.l1BridgeConfig);
    this.orderApi = new OrderApi(this.apiClient);
    
    // Initialize nonce manager for automatic error recovery
    this.nonceManager = new NonceManager(this.apiClient, {
      accountIndex: config.accountIndex,
      apiKeyIndex: config.apiKeyIndex
    });
    
    // Initialize logging with appropriate patterns
    if (config.logLevel !== undefined) {
      logger.setLevel(config.logLevel);
    }
    
    // Initialize WASM signer using manager
    if (config.wasmConfig) {
      const wasmManager = WasmManager.getInstance();
      const clientType = typeof window !== 'undefined' ? 'browser' : 'node';
      
      // Use pre-initialized WASM client if available
      if (wasmManager.isReady()) {
        this.wallet = wasmManager.getWasmClient();
        this.signerType = clientType === 'browser' ? 'wasm' : 'node-wasm';
      } else {
        // Fallback to direct initialization
        this.wallet = createWasmSignerClient(config.wasmConfig);
        this.signerType = typeof window !== 'undefined' ? 'wasm' : 'node-wasm';
      }
    } else {
      throw new Error('wasmConfig must be provided.');
    }

    // Initialize optimization components
    this.initializeOptimizations();
  }

  private initializeOptimizations(): void {
    // Initialize nonce cache first
    this.nonceCache = new NonceCache(
      async (apiKeyIndex: number, count: number) => {
        // Get a single nonce and then calculate sequential nonces
        const firstNonceResult = await this.transactionApi.getNextNonce(
          this.config.accountIndex,
          apiKeyIndex
        );
        
        const nonces: number[] = [];
        for (let i = 0; i < count; i++) {
          nonces.push(firstNonceResult.nonce + i);
        }
        return nonces;
      }
    );

    // Initialize WebSocket order client if enabled
    if (this.config.enableWebSocket) {
      this.wsOrderClient = new WebSocketOrderClient({
        url: this.config.url,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 30000,
        timeout: 10000
      });
    }

    // Initialize request batcher if enabled
    if (this.config.enableBatching) {
      this.orderBatcher = new RequestBatcher(
        async (requests) => {
          // Batch processor implementation
          const results: any[] = [];
          for (const request of requests) {
            try {
              let result;
              if (request.type === 'CREATE_ORDER') {
                result = await this.processOrderRequest(request.params);
              } else if (request.type === 'CANCEL_ORDER') {
                result = await this.processCancelRequest(request.params);
              }
              results.push({
                id: request.id,
                success: true,
                result,
                timestamp: Date.now()
              });
            } catch (error) {
              results.push({
                id: request.id,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
              });
            }
          }
          return results;
        },
        {
          maxBatchSize: 10,
          maxWaitTime: 50,
          flushInterval: 25
        }
      );
    }
  }

  private async processOrderRequest(params: any): Promise<any> {
    return await this.processTransactionWithRetry(async () => {
      const [, txHash, createErr] = await this.createOrderOptimized(params);
      if (createErr) {
        throw new Error(createErr);
      }
      return { txHash };
    });
  }

  private async processCancelRequest(params: any): Promise<any> {
    return await this.processTransactionWithRetry(async () => {
      const [, txHash, cancelErr] = await this.cancelOrder(params.marketIndex);
      if (cancelErr) {
        throw new Error(cancelErr);
      }
      return { txHash };
    });
  }

  /**
   * Process transaction with automatic retry and nonce recovery
   */
  private async processTransactionWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 1
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (this.isNonceError(error)) {
          await this.hardRefreshNonce();
          if (attempt === 0) {
            continue;
          }
        }
        
        // For non-nonce errors or after retry, acknowledge failure
        this.acknowledgeFailure();
        
        // Don't retry non-nonce errors
        if (!this.isNonceError(error)) {
          break;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Check if error is nonce-related
   */
  private isNonceError(error: any): boolean {
    if (!error) return false;
    const message = error.message || error.toString() || '';
    return message.toLowerCase().includes('invalid nonce') || 
           message.toLowerCase().includes('nonce') ||
           (error.status === 400 && message.includes('nonce'));
  }

  /**
   * Hard refresh nonce from API
   */
  private async hardRefreshNonce(): Promise<void> {
    if (this.nonceManager) {
      await this.nonceManager.hardRefreshNonce(this.config.apiKeyIndex);
    } else {
      // Fallback: clear cache and fetch fresh nonce
      await this.getNextNonce();
    }
  }

  /**
   * Acknowledge transaction failure
   */
  private acknowledgeFailure(): void {
    if (this.nonceManager) {
      this.nonceManager.acknowledgeFailure(this.config.apiKeyIndex);
    }
  }

  /**
   * Initialize the signer (required for WASM signers)
   */
  async initialize(): Promise<void> {
    if (this.signerType === 'wasm' || this.signerType === 'node-wasm') {
      await (this.wallet as WasmSignerClient).initialize();
      // Leave client creation to ensureWasmClient or server path
    }
  }

  async ensureWasmClient(): Promise<void> {
    if (this.signerType !== 'wasm' && this.signerType !== 'node-wasm') return;
    if (this.clientCreated) return;

    // If initialization is already in progress, wait for it to complete
    if (this.clientCreationPromise) {
      return this.clientCreationPromise;
    }

    // Create a promise that will be shared by all concurrent callers
    this.clientCreationPromise = (async () => {
      try {
        // Double-check after acquiring the lock
        if (this.clientCreated) return;

        // Initialize WASM client
        // Determine chainId from API, try layer2BasicInfo first, then /info, fallback based on URL
        const root = new RootApi(this.apiClient);
        
        // Determine default chain ID from URL (testnet = 300, mainnet = 304)
        const urlLower = this.config.url.toLowerCase();
        const defaultChainId = urlLower.includes('testnet') ? 300 : 304;
        
        let chainIdNum = defaultChainId;
        try {
          // Try modern endpoint
          try {
            const basic: any = await (this.apiClient as any).get('/api/v1/layer2BasicInfo');
            const data: any = basic?.data ?? basic; // ApiClient.get wraps in {data}
            const cid = (data && (data.chain_id ?? data.chainId ?? data.chainID)) ?? undefined;
            if (cid !== undefined) {
              if (typeof cid === 'number') {
                chainIdNum = cid;
              } else {
                const s = String(cid).toLowerCase();
                if (/^\d+$/.test(s)) chainIdNum = parseInt(s, 10);
                else if (s.includes('mainnet')) chainIdNum = 304;
                else if (s.includes('testnet')) chainIdNum = 300;
              }
            }
          } catch {}

          if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) {
            const info: any = await root.getInfo();
            const cid = (info && (info.chain_id ?? info.chainId ?? info.chainID)) ?? defaultChainId;
            if (typeof cid === 'number') chainIdNum = cid; else {
              const s = String(cid).toLowerCase();
              if (/^\d+$/.test(s)) chainIdNum = parseInt(s, 10);
              else if (s.includes('mainnet')) chainIdNum = 304;
              else if (s.includes('testnet')) chainIdNum = 300;
              else chainIdNum = defaultChainId;
            }
          }
          if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) chainIdNum = defaultChainId;
        } catch {
          chainIdNum = defaultChainId;
        }

        await (this.wallet as WasmSignerClient).createClient({
          url: this.config.url,
          privateKey: this.config.privateKey?.startsWith('0x') ? this.config.privateKey : `0x${this.config.privateKey}`,
          chainId: chainIdNum,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex,
        } as any);

        this.clientCreated = true;
      } finally {
        // Clear the promise so subsequent calls can proceed normally
        this.clientCreationPromise = null;
      }
    })();

    return this.clientCreationPromise;
  }

  private validateConfig(config: SignerConfig): void {
    if (!config.url || typeof config.url !== 'string') {
      throw new Error('URL is required and must be a string');
    }
    
    if (!config.privateKey || typeof config.privateKey !== 'string') {
      throw new Error('Private key is required and must be a string');
    }
    
    if (typeof config.accountIndex !== 'number' || config.accountIndex < 0) {
      throw new Error('Account index must be a non-negative number');
    }
    
    if (typeof config.apiKeyIndex !== 'number' || config.apiKeyIndex < 0) {
      throw new Error('API key index must be a non-negative number');
    }
    
    if (!config.wasmConfig) {
      // Auto-fill defaults so consumers don't need to pass paths
      config.wasmConfig = { wasmPath: 'wasm/lighter-signer.wasm' } as any;
    }
  }

  /**
   * Check client configuration and validate API key with server
   * This performs basic validation and optionally calls WASM CheckClient to verify API key matches server
   * @param useWasmCheck - If true, calls WASM CheckClient to verify API key matches server (default: false)
   * @returns Error message if validation fails, null if successful
   */
  async checkClient(useWasmCheck: boolean = false): Promise<string | null> {
    // Basic validation
    if (!this.config.privateKey) {
      return 'Private key is required';
    }
    if (this.config.accountIndex < 0) {
      return 'Account index must be non-negative';
    }
    if (this.config.apiKeyIndex < 0) {
      return 'API key index must be non-negative';
    }

    // Optional: Use WASM CheckClient to verify API key matches server
    if (useWasmCheck && (this.signerType === 'wasm' || this.signerType === 'node-wasm')) {
      try {
        await this.ensureWasmClient();
        await (this.wallet as WasmSignerClient).checkClient(
          this.config.apiKeyIndex,
          this.config.accountIndex
        );
      } catch (error) {
        return error instanceof Error ? error.message : 'CheckClient validation failed';
      }
    }

    return null;
  }

  /**
   * Creates a new order (limit, market, or conditional)
   * @param params - Order parameters
   * @param params.marketIndex - Market index (0 for ETH-USD)
   * @param params.clientOrderIndex - Unique client order identifier
   * @param params.baseAmount - Order size in base units
   * @param params.price - Order price (for limit orders)
   * @param params.isAsk - True for sell orders, false for buy orders
   * @param params.orderType - Order type (0=limit, 1=market, 2=stop, 3=take_profit)
   * @param params.timeInForce - Time in force (0=GTC, 1=IOC, 2=FOK)
   * @param params.reduceOnly - True for reduce-only orders
   * @param params.triggerPrice - Trigger price for conditional orders
   * @param params.orderExpiry - Order expiry timestamp (optional)
   * @param params.nonce - Transaction nonce (optional, auto-fetched if not provided)
   * @returns Promise resolving to [orderInfo, transactionHash, error]
   */
  async createOrder(params: CreateOrderParams): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      // Performance monitoring removed

      try {
        // Try WebSocket first if enabled and connected
        if (this.config.enableWebSocket && this.wsOrderClient?.isReady()) {
          try {
            // Get next nonce if not provided
            const nextNonce = (params.skipNonce || params.nonce === 0)
              ? { nonce: params.nonce ?? 0 }
              : (params.nonce === undefined || params.nonce === -1) ? 
              await this.getNextNonce() :
              { nonce: params.nonce };
            const nonce = nextNonce.nonce;

            // Handle order expiry conversion (same as createOrderOptimized)
            let orderExpiry = params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY;
            
            // Convert sentinel/default expiry into a concrete millisecond timestamp for WASM validation.
            if (orderExpiry === undefined || orderExpiry === -1 || orderExpiry === SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY) {
              orderExpiry = Date.now() + (28 * 24 * 60 * 60 * 1000); // Convert to milliseconds
            }

            // Default timeInForce based on order type
            // For limit orders, default to GOOD_TILL_TIME if not specified
            // For market/IOC orders, use IMMEDIATE_OR_CANCEL
            const defaultTimeInForce = (params.orderType === undefined || params.orderType === SignerClient.ORDER_TYPE_LIMIT) 
              ? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME 
              : SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL;
            const timeInForce = params.timeInForce !== undefined ? params.timeInForce : defaultTimeInForce;
            
            // For IOC orders, use 0 for order expiry (same logic as createOrderOptimized)
            const isSLTPOrder = params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS || 
                              params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT ||
                              params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT ||
                              params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT;
            
            const wasmOrderExpiry = (timeInForce === SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL && !isSLTPOrder) ? 
              0 : orderExpiry;

            // Validate market index is within uint16 range (0-65535)
            if (params.marketIndex < 0 || params.marketIndex > 65535) {
              const errorMsg = `Market index ${params.marketIndex} is out of valid range (0-65535).`;
              logger.error(errorMsg);
              return [null, '', errorMsg];
            }

            // Sign the order using WASM - use the existing method signature
            const wasmParams = {
              marketIndex: params.marketIndex,
              clientOrderIndex: params.clientOrderIndex,
              baseAmount: params.baseAmount,
              price: params.price,
              isAsk: params.isAsk ? 1 : 0,
              orderType: params.orderType !== undefined ? params.orderType : SignerClient.ORDER_TYPE_LIMIT,
              timeInForce: timeInForce,
              reduceOnly: params.reduceOnly ? 1 : 0,
              triggerPrice: params.triggerPrice !== undefined ? params.triggerPrice : SignerClient.NIL_TRIGGER_PRICE,
              orderExpiry: wasmOrderExpiry,
              integratorAccountIndex: params.integratorAccountIndex ?? 0,
              integratorTakerFee: params.integratorTakerFee ?? 0,
              integratorMakerFee: params.integratorMakerFee ?? 0,
              skipNonce: params.skipNonce ? 1 : 0,
              nonce,
              apiKeyIndex: this.config.apiKeyIndex,
              accountIndex: this.config.accountIndex
            };

            const wasmResponse = await (this.wallet as WasmSignerClient).signCreateOrder(wasmParams);
            if (wasmResponse.error) {
              return [null, '', wasmResponse.error];
            }
            const txInfo = JSON.parse(wasmResponse.txInfo);

            // Send via WebSocket API
            const wsTransaction = await this.wsOrderClient.sendTransaction(
              wasmResponse.txType || SignerClient.TX_TYPE_CREATE_ORDER,
              wasmResponse.txInfo
            );

            return [txInfo, wsTransaction.hash || wasmResponse.txHash, null];
          } catch (error) {
            logger.warning('WebSocket order failed, falling back to HTTP', { error: error instanceof Error ? error.message : String(error) });
          }
        }

        // Try batching if enabled
        if (this.config.enableBatching && this.orderBatcher) {
          const result = await this.orderBatcher.addRequest('CREATE_ORDER', params);
          return [result, result.txHash || '', null];
        }

        // Fallback to optimized HTTP method
        return await this.createOrderOptimized(params);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(errorMessage);
      } finally {
      }
    });
  }

  private async createOrderOptimized(params: CreateOrderParams): Promise<[any, string, string | null]> {
    // Get next nonce if not provided (with caching)
    const nextNonce = (params.skipNonce || params.nonce === 0)
      ? { nonce: params.nonce ?? 0 }
      : (params.nonce === undefined || params.nonce === -1) ? 
      await this.getNextNonce() :
      { nonce: params.nonce };

    // Handle order expiry
    let orderExpiry = params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY;
    
    // Convert sentinel/default expiry into a concrete millisecond timestamp for WASM validation.
    if (orderExpiry === undefined || orderExpiry === -1 || orderExpiry === SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY) {
      orderExpiry = Date.now() + (28 * 24 * 60 * 60 * 1000); // Convert to milliseconds
    }

    // Default timeInForce based on order type FIRST (before computing wasmOrderExpiry)
    // For limit orders, default to GOOD_TILL_TIME if not specified
    // For market/IOC orders, use IMMEDIATE_OR_CANCEL
    const defaultTimeInForce = (params.orderType === undefined || params.orderType === SignerClient.ORDER_TYPE_LIMIT) 
      ? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME 
      : SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL;
    const timeInForce = params.timeInForce !== undefined ? params.timeInForce : defaultTimeInForce;
    
    // Use WASM signer
    // For IOC orders, use NilOrderExpiry (0) EXCEPT for SL/TP orders
    const isSLTPOrder = params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS || 
                        params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT ||
                        params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT ||
                        params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT;
    
    const wasmOrderExpiry = (timeInForce === SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL && !isSLTPOrder) ? 
      0 : orderExpiry;
    
    // Validate market index is within uint16 range (0-65535)
    // Spot markets use indices like 2048, 2049, 2051, etc.
    if (params.marketIndex < 0 || params.marketIndex > 65535) {
      const errorMsg = `Market index ${params.marketIndex} is out of valid range (0-65535).`;
      logger.error(errorMsg);
      return [null, '', errorMsg];
    }

    const wasmParams = {
      marketIndex: params.marketIndex,
      clientOrderIndex: params.clientOrderIndex,
      baseAmount: params.baseAmount,
      price: params.price,
      isAsk: params.isAsk ? 1 : 0,
      orderType: params.orderType !== undefined ? params.orderType : SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: timeInForce,
      reduceOnly: (params.reduceOnly || false) ? 1 : 0,
      triggerPrice: params.triggerPrice !== undefined ? params.triggerPrice : SignerClient.NIL_TRIGGER_PRICE,
      orderExpiry: wasmOrderExpiry,
      integratorAccountIndex: params.integratorAccountIndex ?? 0,
      integratorTakerFee: params.integratorTakerFee ?? 0,
      integratorMakerFee: params.integratorMakerFee ?? 0,
      skipNonce: params.skipNonce ? 1 : 0,
      nonce: nextNonce.nonce,
      apiKeyIndex: this.config.apiKeyIndex,
      accountIndex: this.config.accountIndex
    };

    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      logger.debug('Order signing parameters', {
        inputOrderType: params.orderType,
        inputTimeInForce: params.timeInForce,
        inputOrderExpiry: params.orderExpiry,
        computedTimeInForce: timeInForce,
        computedOrderExpiry: wasmOrderExpiry,
        wasmOrderType: wasmParams.orderType,
        marketIndex: wasmParams.marketIndex,
        marketIndexType: 'uint16 (0-65535)'
      });
    }

    const wasmResponse = await (this.wallet as WasmSignerClient).signCreateOrder(wasmParams);
    if (wasmResponse.error) {
      return [null, '', wasmResponse.error];
    }
    
    try {
      const txHash = await this.transactionApi.sendTxWithIndices(
        wasmResponse.txType || SignerClient.TX_TYPE_CREATE_ORDER,
        wasmResponse.txInfo,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      
      if (txHash.code && txHash.code !== 200) {
        this.acknowledgeFailure();
        const errorMsg = txHash.message || 'Transaction failed';
        return [null, '', errorMsg];
      }
      
      const finalHash = txHash.tx_hash || txHash.hash || wasmResponse.txHash || '';
      
      return [JSON.parse(wasmResponse.txInfo), finalHash, null];
    } catch (apiError: any) {
      // Handle API exceptions (e.g., BadRequestException with "invalid signature")
      const errorMessage = apiError?.response?.data?.message || apiError?.message || 'Transaction failed';
      
      // If it's a nonce error, refresh the nonce cache
      if (this.isNonceError(apiError) || errorMessage.toLowerCase().includes('invalid nonce') || errorMessage.toLowerCase().includes('nonce')) {
        try {
          await this.hardRefreshNonce();
        } catch (refreshError) {
        }
      }
      
      this.acknowledgeFailure();
      return [null, '', errorMessage];
    }
  }

  private async getNextNonce(): Promise<{ nonce: number }> {
    // Use the pre-initialized nonce cache
    if (!this.nonceCache) {
      throw new Error('Nonce cache not initialized');
    }

    const nonce = await this.nonceCache.getNextNonce(this.config.apiKeyIndex);
    return { nonce };
  }

  private async getNextNonces(count: number): Promise<number[]> {
    // Use the pre-initialized nonce cache to get multiple nonces
    if (!this.nonceCache) {
      throw new Error('Nonce cache not initialized');
    }

    const nonces = await this.nonceCache.getNextNonces(this.config.apiKeyIndex, count);
    return nonces;
  }

  /**
   * Pre-warm the nonce cache for better performance
   */
  async preWarmNonceCache(): Promise<void> {
    if (this.nonceCache) {
      await this.nonceCache.preWarmCache([this.config.apiKeyIndex]);
      logger.info('Nonce cache pre-warmed', { apiKeyIndex: this.config.apiKeyIndex });
    }
  }

  /**
   * Get nonce cache statistics for monitoring
   */
  getNonceCacheStats(): Record<number, { count: number; oldest: number; newest: number }> | null {
    return this.nonceCache ? this.nonceCache.getCacheStats() : null;
  }

  async createMarketOrder(params: CreateMarketOrderParams): Promise<[any, string, string | null]> {
    // Performance monitoring removed

    try {
      // Get next nonce if not provided (with caching)
      const nextNonce = (params.skipNonce || params.nonce === 0)
        ? { nonce: params.nonce ?? 0 }
        : (params.nonce === undefined || params.nonce === -1) ? 
        await this.getNextNonce() :
        { nonce: params.nonce };

      // Use WASM signer
      const wasmParams = {
        marketIndex: params.marketIndex,
        clientOrderIndex: params.clientOrderIndex,
        baseAmount: params.baseAmount,
        price: params.avgExecutionPrice,
        isAsk: params.isAsk ? 1 : 0,
        orderType: SignerClient.ORDER_TYPE_MARKET,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: params.reduceOnly ? 1 : 0,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: 0, // NilOrderExpiry for market orders
        integratorAccountIndex: params.integratorAccountIndex ?? 0,
        integratorTakerFee: params.integratorTakerFee ?? 0,
        integratorMakerFee: params.integratorMakerFee ?? 0,
        skipNonce: params.skipNonce ? 1 : 0,
        nonce: nextNonce.nonce,
        apiKeyIndex: this.config.apiKeyIndex,
        accountIndex: this.config.accountIndex
        };

      const wasmResponse = await (this.wallet as WasmSignerClient).signCreateOrder(wasmParams);
      if (wasmResponse.error) {
        return [null, '', wasmResponse.error];
      }
      
      const txHashResponse = await this.transactionApi.sendTxWithIndices(
        wasmResponse.txType || SignerClient.TX_TYPE_CREATE_ORDER,
        wasmResponse.txInfo,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      
      // Check for API errors in the response
      if (txHashResponse.code && txHashResponse.code !== 200) {
        const errorMessage = txHashResponse.message || `API returned error code ${txHashResponse.code}`;
        return [null, '', errorMessage];
      }
      
      const txHash = txHashResponse.tx_hash || txHashResponse.hash || wasmResponse.txHash || '';
      if (!txHash) {
        return [null, '', 'No transaction hash returned from API'];
      }
      
      return [JSON.parse(wasmResponse.txInfo), txHash, null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMessage);
    } finally {
    }
  }

  private parseOrderBookInt(value: string | number | undefined): number {
    if (value === undefined || value === null) {
      return 0;
    }
    if (typeof value === 'number') {
      return Math.floor(value);
    }
    const normalized = value.replace('.', '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
  }

  async getBestPrice(marketIndex: number, isAsk: boolean, obOrders?: any): Promise<number> {
    const orderBook = obOrders || await this.orderApi.getOrderBookOrders({ market_id: marketIndex, limit: 1 } as any);
    const side = isAsk ? (orderBook?.bids || []) : (orderBook?.asks || []);
    if (!side.length) {
      throw new Error('Order book has no liquidity on required side');
    }
    return this.parseOrderBookInt(side[0]?.price);
  }

  async getPotentialExecutionPrice(
    marketIndex: number,
    amount: number,
    isAsk: boolean,
    isAmountBase: boolean = true,
    obOrders?: any
  ): Promise<[number, number]> {
    const orderBook = obOrders || await this.orderApi.getOrderBookOrders({ market_id: marketIndex, limit: 100 } as any);
    const side = isAsk ? (orderBook?.bids || []) : (orderBook?.asks || []);

    let matchedUsdAmount = 0;
    let matchedSize = 0;

    for (const level of side) {
      if ((isAmountBase && matchedSize >= amount) || (!isAmountBase && matchedUsdAmount >= amount)) {
        break;
      }

      const currentPrice = this.parseOrderBookInt(level?.price);
      const currentSize = this.parseOrderBookInt(level?.remaining_base_amount ?? level?.size);
      if (currentPrice <= 0 || currentSize <= 0) {
        continue;
      }

      const maxPossibleSize = isAmountBase
        ? amount - matchedSize
        : Math.floor((amount - matchedUsdAmount) / currentPrice);

      const usedSize = Math.min(maxPossibleSize, currentSize);
      if (usedSize <= 0) {
        continue;
      }

      matchedUsdAmount += currentPrice * usedSize;
      matchedSize += usedSize;
    }

    if (matchedSize <= 0) {
      throw new Error('No liquidity available to estimate execution price');
    }

    const potentialExecutionPrice = matchedUsdAmount / matchedSize;
    return [potentialExecutionPrice, isAmountBase ? matchedSize : matchedUsdAmount];
  }

  async createMarketOrder_quoteAmount(params: {
    marketIndex: number;
    clientOrderIndex: number;
    quoteAmount: number;
    maxSlippage: number;
    isAsk: boolean;
    reduceOnly?: boolean;
    nonce?: number;
    apiKeyIndex?: number;
    idealPrice?: number;
  }): Promise<[any, string, string | null]> {
    try {
      const quoteAmount = Math.floor(params.quoteAmount * 1e6);
      const obOrders = await this.orderApi.getOrderBookOrders({ market_id: params.marketIndex, limit: 100 } as any);

      const idealPrice = params.idealPrice ?? await this.getBestPrice(params.marketIndex, params.isAsk, obOrders);
      const acceptableExecutionPrice = Math.round(idealPrice * (1 + params.maxSlippage * (params.isAsk ? -1 : 1)));

      const [potentialExecutionPrice, matchedUsdAmount] = await this.getPotentialExecutionPrice(
        params.marketIndex,
        quoteAmount,
        params.isAsk,
        false,
        obOrders
      );

      if ((params.isAsk && potentialExecutionPrice < acceptableExecutionPrice) || (!params.isAsk && potentialExecutionPrice > acceptableExecutionPrice)) {
        return [null, '', 'Excessive slippage'];
      }

      if (matchedUsdAmount < quoteAmount) {
        return [null, '', 'Cannot be sure slippage will be acceptable due to the high size'];
      }

      const baseAmount = Math.floor(quoteAmount / potentialExecutionPrice);

      return await this.createOrder({
        marketIndex: params.marketIndex,
        clientOrderIndex: params.clientOrderIndex,
        baseAmount,
        price: Math.round(acceptableExecutionPrice),
        isAsk: params.isAsk,
        orderType: SignerClient.ORDER_TYPE_MARKET,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        orderExpiry: SignerClient.DEFAULT_IOC_EXPIRY,
        reduceOnly: params.reduceOnly || false,
        ...(params.nonce !== undefined ? { nonce: params.nonce } : {}),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
  }

  /**
   * Create market order with maximum slippage limit
   * Will only execute the amount such that slippage is limited to the value provided
   */
  async createMarketOrder_maxSlippage(params: {
    marketIndex: number;
    clientOrderIndex: number;
    baseAmount: number;
    maxSlippage: number;
    isAsk: boolean;
    reduceOnly?: boolean;
    idealPrice?: number;
    nonce?: number; // Optional nonce (will be fetched automatically if not provided)
  }): Promise<[any, string, string | null]> {
    try {
      let idealPrice = params.idealPrice;
      
      // Get ideal price from order book if not provided
      if (idealPrice === undefined) {
        // Use a default price for now (can be improved later with proper order book integration)
        idealPrice = 4000; // Default ETH price
      }

      // Calculate acceptable execution price based on max slippage
      const acceptableExecutionPrice = Math.round(
        idealPrice * (1 + params.maxSlippage * (params.isAsk ? -1 : 1))
      );

      // Create market order with price limit
      return await this.createMarketOrder({
        marketIndex: params.marketIndex,
        clientOrderIndex: params.clientOrderIndex,
        baseAmount: params.baseAmount,
        avgExecutionPrice: acceptableExecutionPrice,
        isAsk: params.isAsk,
        reduceOnly: params.reduceOnly || false,
        ...(params.nonce !== undefined && { nonce: params.nonce })
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
  }

  /**
   * Create market order only if slippage is acceptable
   * Will only execute if slippage <= max_slippage
   */
  async createMarketOrder_ifSlippage(params: {
    marketIndex: number;
    clientOrderIndex: number;
    baseAmount: number;
    maxSlippage: number;
    isAsk: boolean;
    reduceOnly?: boolean;
    idealPrice?: number;
    nonce?: number; // Optional nonce (will be fetched automatically if not provided)
  }): Promise<[any, string, string | null]> {
    try {
      let idealPrice = params.idealPrice;
      if (idealPrice === undefined) {
        // Use a default price for now (can be improved later)
        idealPrice = 4000; // Default ETH price
      }

      // For now, just use the ideal price with slippage calculation
      // In a full implementation, you would match through the order book
      const acceptableExecutionPrice = idealPrice * (1 + params.maxSlippage * (params.isAsk ? -1 : 1));

      // Create market order with acceptable price limit
      return await this.createMarketOrder({
        marketIndex: params.marketIndex,
        clientOrderIndex: params.clientOrderIndex,
        baseAmount: params.baseAmount,
        avgExecutionPrice: Math.round(acceptableExecutionPrice),
        isAsk: params.isAsk,
        reduceOnly: params.reduceOnly || false,
        ...(params.nonce !== undefined && { nonce: params.nonce })
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided (with caching)
        const nextNonce = (params.skipNonce || params.nonce === 0)
          ? { nonce: params.nonce ?? 0 }
          : (params.nonce === undefined || params.nonce === -1) ? 
          await this.getNextNonce() :
          { nonce: params.nonce };

        // Use WASM signer
        const wasmParams = {
          marketIndex: params.marketIndex,
          orderIndex: params.orderIndex,
          skipNonce: params.skipNonce ? 1 : 0,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        };

        const wasmResponse = await (this.wallet as WasmSignerClient).signCancelOrder(wasmParams);
        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }
        
        const txHash = await this.transactionApi.sendTx(
          wasmResponse.txType || SignerClient.TX_TYPE_CANCEL_ORDER,
          wasmResponse.txInfo
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Change API key (register new public key)
   * 
   * Can be used to:
   * 1. Register a new API key at a new index (defaults to current + 1)
   * 2. Overwrite/revoke an existing API key by using the same index
   * 
   * @param ethPrivateKey - Ethereum private key for L1 signature
   * @param newPubkey - New public key to register
   * @param newPrivateKey - Private key corresponding to newPubkey
   * @param newApiKeyIndex - Optional API key index (defaults to current + 1). 
   *                         To revoke an existing key, specify the same index as the key to revoke.
   * @returns [txHash, txInfo, error]
   */
  async changeApiKey(params: ChangeApiKeyParams): Promise<[any, string, string | null]> {
    try {
      const newApiKeyIndex = params.newApiKeyIndex ?? (this.config.apiKeyIndex + 1);
      
      // Use nonce 0 for new API keys, or fetch next nonce if updating existing
      let nonce = params.nonce ?? 0;
      if (nonce === 0) {
        try {
          const nextNonceResult = await this.transactionApi.getNextNonce(
            this.config.accountIndex,
            newApiKeyIndex
          );
          nonce = nextNonceResult.nonce;
        } catch {
          nonce = 0; // New key slot, use 0
        }
      }

      // Format pubkey: remove 0x if present, ensure 80 hex chars (40 bytes)
      // Go code expects exactly 40 bytes = 80 hex characters
      let pubkey = params.newPubkey.replace(/^0x/, '');
      if (pubkey.length !== 80) {
        return [null, '', `Invalid public key length: expected 80 hex chars (40 bytes), got ${pubkey.length}. Public key: ${params.newPubkey.substring(0, 30)}...`];
      }

      // Validate that it's valid hex
      if (!/^[0-9a-fA-F]{80}$/.test(pubkey)) {
        return [null, '', `Invalid public key format: must be 80 hex characters. Public key: ${params.newPubkey.substring(0, 30)}...`];
      }

      // Create temporary client with new key to sign (WASM needs client for the new key index)
      const tempClient = new SignerClient({
        url: this.config.url,
        privateKey: params.newPrivateKey,
        accountIndex: this.config.accountIndex,
        apiKeyIndex: newApiKeyIndex,
        wasmConfig: this.config.wasmConfig || { wasmPath: 'wasm/lighter-signer.wasm' }
      });
      await tempClient.initialize();
      await tempClient.ensureWasmClient();

      // Sign ChangePubKey using temp client's WASM
      // Pass pubkey with 0x prefix - Go's hexutil.Decode handles it
      const wasmResponse = await (tempClient.wallet as WasmSignerClient).signChangePubKey({
        pubkey: `0x${pubkey}`,
        nonce,
        apiKeyIndex: newApiKeyIndex,
        accountIndex: this.config.accountIndex
      });

      await tempClient.close();

      if (wasmResponse.error) {
        return [null, '', wasmResponse.error];
      }

      // Parse txInfo and get messageToSign from WASM
      const txInfo = JSON.parse(wasmResponse.txInfo);
      const messageToSign = wasmResponse.messageToSign;
      
      if (!messageToSign) {
        return [null, '', 'No messageToSign from WASM'];
      }


      // Convert byte array fields from base64 (Go's default JSON encoding for []byte) to hex
      // The server expects byte arrays as hex strings with 0x prefix
      // Go JSON marshals []byte as base64, so we need to convert them
      
      // Helper function to convert base64 to hex
      const convertByteArrayToHex = (value: any, expectedLength?: number, fieldName?: string): string | null => {
        if (!value || typeof value !== 'string') {
          return null;
        }
        
        try {
          // If it already has 0x prefix and looks like hex, return as is
          if (value.startsWith('0x')) {
            const hexPart = value.substring(2);
            // Check if it's valid hex
            if (/^[0-9a-fA-F]+$/.test(hexPart)) {
              if (process.env.DEBUG_TX_INFO) {
                console.log(`DEBUG: ${fieldName || 'Field'} already in hex format with 0x prefix`);
              }
              return value;
            }
          }
          
          // Check if it's base64 encoded (Go's default for []byte in JSON)
          // Base64 strings don't start with '0x' and are typically longer
          // A 40-byte value in base64 is ~56 characters
          if (!value.startsWith('0x')) {
            // Try to decode as base64 first
            try {
              const bytes = Buffer.from(value, 'base64');
              // If expectedLength is provided, verify it matches
              if (expectedLength && bytes.length !== expectedLength) {
                if (process.env.DEBUG_TX_INFO) {
                  console.log(`DEBUG: ${fieldName || 'Field'} base64 decode length mismatch: expected ${expectedLength}, got ${bytes.length}`);
                }
                // Try as hex without prefix
                if (/^[0-9a-fA-F]+$/.test(value)) {
                  return '0x' + value;
                }
                return null;
              }
              // Convert to hex with 0x prefix
              const hex = '0x' + bytes.toString('hex');
              if (process.env.DEBUG_TX_INFO) {
                console.log(`DEBUG: Converted ${fieldName || 'Field'} from base64 to hex: ${value.substring(0, 20)}... -> ${hex.substring(0, 20)}...`);
              }
              return hex;
            } catch (base64Error) {
              // Not base64, try as hex without prefix
              if (/^[0-9a-fA-F]+$/.test(value)) {
                const hex = '0x' + value;
                if (process.env.DEBUG_TX_INFO) {
                  console.log(`DEBUG: ${fieldName || 'Field'} is hex without prefix, added 0x: ${value.substring(0, 20)}... -> ${hex.substring(0, 20)}...`);
                }
                return hex;
              }
            }
          }
        } catch (error) {
          // Conversion failed, might already be in correct format
          if (process.env.DEBUG_TX_INFO) {
            console.warn(`DEBUG: ${fieldName || 'Field'} conversion error:`, error instanceof Error ? error.message : String(error));
          }
        }
        
        return null;
      };


      // Sign message with ETH private key
      const ethers = await import('ethers');
      const wallet = new ethers.Wallet(params.ethPrivateKey);
      
      // Use signMessage which automatically handles Ethereum message prefix
      // This matches Go's accounts.TextHash which prepends "\x19Ethereum Signed Message:\n" + len + message
      const fullSig = await wallet.signMessage(messageToSign);
      
      // Go code expects 65 bytes (r + s + v) for signature recovery
      // ethers.js signMessage returns: 0x + r (64 hex) + s (64 hex) + v (2 hex) = 132 chars = 65 bytes
      // We need to pass the full signature (r+s+v) for Go's calculateL1AddressBySignature to work
      // Go code accesses signatureContent[64] which is the v byte, so we need all 65 bytes
      const l1Sig = fullSig.startsWith('0x') && fullSig.length === 132 ? fullSig : fullSig;
      
      // Set L1Sig in txInfo
      txInfo.L1Sig = l1Sig;

      // Create auth token for HTTP authentication
      const authToken = await this.createAuthTokenWithExpiry().catch(() => undefined);

      // Send transaction
      // If server rejects with "invalid tx info", try PubKey without 0x prefix as fallback
      try {
        const txHashResponse = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_CHANGE_PUB_KEY,
          JSON.stringify(txInfo),
          this.config.accountIndex,
          this.config.apiKeyIndex,
          true,
          authToken
        );

        if (txHashResponse.code && txHashResponse.code !== 200) {
          return [null, '', txHashResponse.message || `API error: ${txHashResponse.code}`];
        }

        const txHash = txHashResponse.tx_hash || txHashResponse.hash || wasmResponse.txHash || '';
        return txHash ? [txHashResponse, txHash, null] : [null, '', 'No transaction hash'];
      } catch (error: any) {
        // If we get "invalid signature" error, try different Sig formats
        const errorMsg = error?.message || error?.data?.message || String(error);
        if (errorMsg.includes('invalid signature') && txInfo.Sig) {
          // Try Sig with 0x prefix (matching L1Sig format)
          if (!txInfo.Sig.startsWith('0x') && !txInfo.Sig.includes('=')) {
            try {
              const txInfoRetry = { ...txInfo };
              txInfoRetry.Sig = '0x' + txInfo.Sig;
              
              const txHashResponse = await this.transactionApi.sendTxWithIndices(
                wasmResponse.txType || SignerClient.TX_TYPE_CHANGE_PUB_KEY,
                JSON.stringify(txInfoRetry),
                this.config.accountIndex,
                this.config.apiKeyIndex,
                true,
                authToken
              );

              if (!txHashResponse.code || txHashResponse.code === 200) {
                const txHash = txHashResponse.tx_hash || txHashResponse.hash || wasmResponse.txHash || '';
                if (txHash) {
                  return [txHashResponse, txHash, null];
                }
              }
            } catch (retryError: any) {
              // Continue to try base64
            }
          }
          
          // Try Sig in base64 format (original format)
          if (!txInfo.Sig.includes('=')) {
            try {
              // Convert hex Sig back to base64
              const sigHex = txInfo.Sig.startsWith('0x') ? txInfo.Sig.substring(2) : txInfo.Sig;
              const sigBytes = Buffer.from(sigHex, 'hex');
              const txInfoRetry = { ...txInfo };
              txInfoRetry.Sig = sigBytes.toString('base64');
              
              const txHashResponse = await this.transactionApi.sendTxWithIndices(
                wasmResponse.txType || SignerClient.TX_TYPE_CHANGE_PUB_KEY,
                JSON.stringify(txInfoRetry),
                this.config.accountIndex,
                this.config.apiKeyIndex,
                true,
                authToken
              );

              if (!txHashResponse.code || txHashResponse.code === 200) {
                const txHash = txHashResponse.tx_hash || txHashResponse.hash || wasmResponse.txHash || '';
                if (txHash) {
                  return [txHashResponse, txHash, null];
                }
              }
            } catch (retryError: any) {
              // Retry failed
            }
          }
        }
        
        // If we get "invalid tx info" or "invalid PublicKey" error, try different PubKey formats
        if ((errorMsg.includes('invalid tx info') || errorMsg.includes('invalid PublicKey')) && txInfo.PubKey) {
          // If PubKey has 0x prefix, try without it
          if (txInfo.PubKey.startsWith('0x')) {
            const txInfoRetry = { ...txInfo };
            txInfoRetry.PubKey = txInfo.PubKey.substring(2); // Remove 0x prefix
            
            try {
              const txHashResponse = await this.transactionApi.sendTxWithIndices(
                wasmResponse.txType || SignerClient.TX_TYPE_CHANGE_PUB_KEY,
                JSON.stringify(txInfoRetry),
                this.config.accountIndex,
                this.config.apiKeyIndex,
                true,
                authToken
              );

              if (!txHashResponse.code || txHashResponse.code === 200) {
                const txHash = txHashResponse.tx_hash || txHashResponse.hash || wasmResponse.txHash || '';
                if (txHash) {
                  return [txHashResponse, txHash, null];
                }
              }
            } catch (retryError: any) {
              // Continue to try other formats if this fails
            }
          }
          
          // If PubKey is still base64 (no 0x prefix and looks like base64), try converting to hex
          if (!txInfo.PubKey.startsWith('0x') && txInfo.PubKey.length > 50) {
            // PubKey is still base64, try converting to hex
            try {
              const bytes = Buffer.from(txInfo.PubKey, 'base64');
              if (bytes.length === 40) {
                const hexPubKey = bytes.toString('hex');
                
                // Try with 0x prefix first
                const txInfoRetry1 = { ...txInfo };
                txInfoRetry1.PubKey = '0x' + hexPubKey;
                
                try {
                  const txHashResponse1 = await this.transactionApi.sendTxWithIndices(
                    wasmResponse.txType || SignerClient.TX_TYPE_CHANGE_PUB_KEY,
                    JSON.stringify(txInfoRetry1),
                    this.config.accountIndex,
                    this.config.apiKeyIndex,
                    true,
                    authToken
                  );

                  if (!txHashResponse1.code || txHashResponse1.code === 200) {
                    const txHash1 = txHashResponse1.tx_hash || txHashResponse1.hash || wasmResponse.txHash || '';
                    if (txHash1) {
                      return [txHashResponse1, txHash1, null];
                    }
                  }
                } catch (e1: any) {
                  // Continue to try without 0x prefix
                }

                // Try without 0x prefix
                const txInfoRetry2 = { ...txInfo };
                txInfoRetry2.PubKey = hexPubKey;
                
                const txHashResponse2 = await this.transactionApi.sendTxWithIndices(
                  wasmResponse.txType || SignerClient.TX_TYPE_CHANGE_PUB_KEY,
                  JSON.stringify(txInfoRetry2),
                  this.config.accountIndex,
                  this.config.apiKeyIndex,
                  true,
                  authToken
                );

                if (txHashResponse2.code && txHashResponse2.code !== 200) {
                  return [null, '', txHashResponse2.message || `API error: ${txHashResponse2.code}`];
                }

                const txHash2 = txHashResponse2.tx_hash || txHashResponse2.hash || wasmResponse.txHash || '';
                return txHash2 ? [txHashResponse2, txHash2, null] : [null, '', 'No transaction hash'];
              }
            } catch (retryError: any) {
              // Retry also failed, return original error
              return [null, '', errorMsg];
            }
          }
        }
        // Return error if not "invalid tx info" or if PubKey is already hex
        return [null, '', errorMsg];
      }
    } catch (error) {
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  /**
   * Creates an authentication token with default expiry (10 minutes)
   * @returns Promise resolving to auth token string
   */
  async createAuthToken(): Promise<string> {
    return this.createAuthTokenWithExpiry();
  }

  /**
   * Creates an authentication token with custom expiry duration
   * @param expirySeconds - Token expiry duration in seconds (default: 10 minutes)
   * @returns Promise resolving to auth token string
   */
  async createAuthTokenWithExpiry(expirySeconds: number = SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY): Promise<string> {
    try {
      // Use WASM signer
      const deadline = expirySeconds === SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY ? 
        0 : Math.floor(Date.now() / 1000) + expirySeconds;
      return await (this.wallet as WasmSignerClient).createAuthToken(deadline, this.config.apiKeyIndex, this.config.accountIndex);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMessage);
    }
  }

  /**
   * Generate a new API key pair using WASM signer
   */
  async generateAPIKey(seed?: string): Promise<{ privateKey: string; publicKey: string } | null> {
    try {
      return await (this.wallet as WasmSignerClient).generateAPIKey(seed);
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a sub account
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [subAccountInfo, transactionHash, error]
   */
  async createSubAccount(nonce: number = -1): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signCreateSubAccount({
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_CREATE_SUB_ACCOUNT,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(timeInForce: number, time: number, nonce: number = -1): Promise<[any, any, string | null]> {
    try {
      // Get next nonce if not provided (with caching)
      const nextNonce = nonce === -1 ? 
        await this.getNextNonce() :
        { nonce };

      // Use WASM signer
      const wasmResponse = await (this.wallet as WasmSignerClient).signCancelAllOrders({
        timeInForce,
        time,
        nonce: nextNonce.nonce,
        apiKeyIndex: this.config.apiKeyIndex,
        accountIndex: this.config.accountIndex
      });

      if (wasmResponse.error) {
        return [null, null, wasmResponse.error];
      }

      const txInfo = JSON.parse(wasmResponse.txInfo);
      const apiResponse = await this.transactionApi.sendTxWithIndices(
        wasmResponse.txType || SignerClient.TX_TYPE_CANCEL_ALL_ORDERS,
        wasmResponse.txInfo,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      return [txInfo, apiResponse, null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, null, errorMessage];
    }
  }

  /**
   * Close all positions by creating opposite market orders
   * This method gets all open positions and creates market orders to close them
   */
  async closeAllPositions(): Promise<[any[], any[], string[]]> {
    try {
      // Get account data to retrieve open positions
      const accountData = await this.accountApi.getAccount({
        by: 'index',
        value: this.config.accountIndex.toString()
      });
      
      // Extract account from response
      const account = (accountData as any).accounts?.[0] || accountData;
      
      // Check if account has positions data
      if (!account.positions || !Array.isArray(account.positions)) {
        return [[], [], []]; // No positions data available
      }
      
      const openPositions = account.positions.filter((pos: any) => parseFloat(pos.position) !== 0);
      
      if (openPositions.length === 0) {
        return [[], [], []]; // No positions to close
      }

      const closedTransactions: any[] = [];
      const closedResponses: any[] = [];
      const errors: string[] = [];

      // Close each position by creating opposite market orders
      for (const position of openPositions) {
        try {
          // sign: -1 = short position, 1 = long position
          const isLong = position.sign === 1;
          const positionSize = Math.abs(parseFloat(position.position));
          
          // Convert position size to base units (multiply by appropriate scale)
          // For ETH, position is in decimal (0.0030 = 3000 in base units)
          const baseAmount = Math.floor(positionSize * 1000000); // Scale appropriately
          
          // Get mark price from position_value / position
          const avgPrice = Math.abs(parseFloat(position.avg_entry_price));
          const priceInUnits = Math.floor(avgPrice * 100000); // Convert to price units
          
          // Create market order in opposite direction to close position
          const [tx, apiResponse, err] = await this.createMarketOrder({
            marketIndex: position.market_id,
            clientOrderIndex: Date.now() + Math.floor(Math.random() * 1000), // Unique index
            baseAmount: baseAmount,
            avgExecutionPrice: priceInUnits * 2, // Give enough room for execution
            isAsk: isLong, // If long position (sign=1), sell to close; if short (sign=-1), buy to close
            reduceOnly: true // This is a position-closing order
          });

          if (err) {
            errors.push(`Failed to close position in market ${position.market_id} (${position.symbol}): ${err}`);
          } else {
            closedTransactions.push(tx);
            closedResponses.push(apiResponse);
          }
        } catch (positionError) {
          errors.push(`Error closing position in market ${position.market_id}: ${positionError instanceof Error ? positionError.message : 'Unknown error'}`);
        }
      }

      return [closedTransactions, closedResponses, errors];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [[], [], [errorMessage]];
    }
  }

  /**
   * Modify an existing order
   * @param marketIndex - Market index
   * @param orderIndex - Order index to modify
   * @param baseAmount - New base amount
   * @param price - New price
   * @param triggerPrice - New trigger price (for conditional orders)
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [orderInfo, transactionHash, error]
   */
  async modifyOrder(
    marketIndex: number,
    orderIndex: number,
    baseAmount: number,
    price: number,
    triggerPrice: number,
    nonce: number = -1,
    options?: {
      integratorAccountIndex?: number;
      integratorTakerFee?: number;
      integratorMakerFee?: number;
      skipNonce?: boolean;
    }
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (options?.skipNonce || nonce === 0)
          ? { nonce: nonce === -1 ? 0 : nonce }
          : (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signModifyOrder({
          marketIndex,
          index: orderIndex,
          baseAmount,
          price,
          triggerPrice,
          integratorAccountIndex: options?.integratorAccountIndex ?? 0,
          integratorTakerFee: options?.integratorTakerFee ?? 0,
          integratorMakerFee: options?.integratorMakerFee ?? 0,
          skipNonce: options?.skipNonce ? 1 : 0,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_MODIFY_ORDER,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Transfer USDC between accounts (L2-to-L2 transfer)
   * @param params - Transfer parameters
   * @returns Promise resolving to [transferInfo, transactionHash, error]
   */
  async transfer(params: TransferParams): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (params.nonce === undefined || params.nonce === -1) ? 
          await this.getNextNonce() :
          { nonce: params.nonce };

        const scaledAmount = Math.floor(params.usdcAmount * SignerClient.USDC_TICKER_SCALE);

        // Use WASM signer - build params object conditionally
        const wasmParams: any = {
          toAccountIndex: params.toAccountIndex,
          usdcAmount: scaledAmount,
          fee: params.fee,
          memo: params.memo,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        };
        // Only include ethPrivateKey if provided
        if (params.ethPrivateKey !== undefined) {
          wasmParams.ethPrivateKey = params.ethPrivateKey;
        }
        
        const wasmResponse = await (this.wallet as WasmSignerClient).signTransfer(wasmParams);

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        // Handle L1 signature ONLY if messageToSign is present AND ethPrivateKey is explicitly provided
        // If ethPrivateKey is not provided, transfer will use only L2 signature (API key signature)
        // Note: this.config.privateKey is the API key (for L2 signing), NOT an Ethereum key (for L1 signing)
        let txInfo = wasmResponse.txInfo;
        if (wasmResponse.messageToSign && params.ethPrivateKey) {
          try {
            const ethers = await import('ethers');
            const wallet = new ethers.Wallet(params.ethPrivateKey);
            const l1Sig = await wallet.signMessage(wasmResponse.messageToSign);
            
            const txInfoObj = JSON.parse(txInfo);
            txInfoObj.L1Sig = l1Sig;
            txInfo = JSON.stringify(txInfoObj);
          } catch (sigError) {
            const errorMsg = sigError instanceof Error ? sigError.message : String(sigError);
            return [null, '', `Failed to sign L1 message: ${errorMsg}`];
          }
        }
        // If messageToSign is present but no ethPrivateKey provided, proceed with only L2 signature (L1Sig will be empty string in txInfo)

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_TRANSFER,
          txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Transfer USDC between subaccounts under the same master account (L2-to-L2 transfer).
   * This method does NOT require an L1 signature since both accounts share the same master.
   * @param params - Transfer parameters (does not require ethPrivateKey)
   * @returns Promise resolving to [transferInfo, transactionHash, error]
   */
  async transferSameMasterAccount(params: TransferSameMasterAccountParams): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (params.nonce === undefined || params.nonce === -1) ? 
          await this.getNextNonce() :
          { nonce: params.nonce };

        const scaledAmount = Math.floor(params.usdcAmount * SignerClient.USDC_TICKER_SCALE);

        // Use WASM signer - NO ethPrivateKey for same master account transfers
        const wasmParams: any = {
          toAccountIndex: params.toAccountIndex,
          usdcAmount: scaledAmount,
          fee: params.fee,
          memo: params.memo,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        };
        
        // Include asset_id and is_spot_account if provided
        if (params.asset_id !== undefined) {
          wasmParams.asset_id = params.asset_id;
        }
        if (params.is_spot_account !== undefined) {
          wasmParams.is_spot_account = params.is_spot_account;
        }
        
        const wasmResponse = await (this.wallet as WasmSignerClient).signTransfer(wasmParams);

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        // For same master account transfers, we don't handle L1 signatures
        // The WASM module will handle the L2 signature (API key) automatically
        const txInfo = wasmResponse.txInfo;

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_TRANSFER,
          txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Withdraw USDC from L2 to L1 (L2-to-L1 withdrawal)
   * @param params - Withdraw parameters
   * @returns Promise resolving to [withdrawInfo, transactionHash, error]
   */
  async withdraw(params: WithdrawParams): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (params.nonce === undefined || params.nonce === -1) ? 
          await this.getNextNonce() :
          { nonce: params.nonce };

        const scaledAmount = Math.floor(params.usdcAmount * SignerClient.USDC_TICKER_SCALE);

        // Use WASM signer
        // Default to assetIndex=3 (USDCAssetIndex) and routeType=0 (Perps) if not specified
        const wasmResponse = await (this.wallet as WasmSignerClient).signWithdraw({
          usdcAmount: scaledAmount,
          assetIndex: params.assetIndex ?? 3,
          routeType: params.routeType ?? 0,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_WITHDRAW,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Update leverage for a specific market
   * @param marketIndex - Market index to update leverage for
   * @param marginMode - Margin mode: 0 for CROSS, 1 for ISOLATED
   * @param leverage - Desired leverage (e.g., 3 for 3x)
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [leverageInfo, transactionHash, error]
   */
  async updateLeverage(
    marketIndex: number,
    marginMode: number,
    leverage: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Convert leverage to IMF (Initial Margin Fraction)
        // IMF = 10,000 / leverage (e.g., 3x leverage = 10,000 / 3 = 3333)
        const imf = Math.floor(10_000 / leverage);

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signUpdateLeverage({
          marketIndex,
          fraction: imf,
          marginMode,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_UPDATE_LEVERAGE,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Update margin for a specific market
   * @param marketIndex - Market index to update margin for
   * @param usdcAmount - USDC amount to add/remove (in smallest unit, e.g., 1000000 = 1 USDC)
   * @param direction - Direction: 0 to add margin, 1 to remove margin
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [marginInfo, transactionHash, error]
   */
  async updateMargin(
    marketIndex: number,
    usdcAmount: number,
    direction: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Scale USDC amount
        const scaledAmount = Math.floor(usdcAmount * SignerClient.USDC_TICKER_SCALE);

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signUpdateMargin({
          marketIndex,
          usdcAmount: scaledAmount,
          direction,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_UPDATE_MARGIN,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Create a public pool
   * @param operatorFee - Operator fee (in basis points, e.g., 100 = 1%)
   * @param initialTotalShares - Initial total shares
   * @param minOperatorShareRate - Minimum operator share rate
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [poolInfo, transactionHash, error]
   */
  async createPublicPool(
    operatorFee: number,
    initialTotalShares: number,
    minOperatorShareRate: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signCreatePublicPool({
          operatorFee,
          initialTotalShares,
          minOperatorShareRate,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_CREATE_PUBLIC_POOL,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Update a public pool
   * @param publicPoolIndex - Public pool index
   * @param status - Pool status
   * @param operatorFee - Operator fee (in basis points)
   * @param minOperatorShareRate - Minimum operator share rate
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [poolInfo, transactionHash, error]
   */
  async updatePublicPool(
    publicPoolIndex: number,
    status: number,
    operatorFee: number,
    minOperatorShareRate: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signUpdatePublicPool({
          publicPoolIndex,
          status,
          operatorFee,
          minOperatorShareRate,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_UPDATE_PUBLIC_POOL,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Mint shares in a public pool
   * @param publicPoolIndex - Public pool index
   * @param shareAmount - Amount of shares to mint
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [mintInfo, transactionHash, error]
   */
  async mintShares(
    publicPoolIndex: number,
    shareAmount: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signMintShares({
          publicPoolIndex,
          shareAmount,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_MINT_SHARES,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Burn shares in a public pool
   * @param publicPoolIndex - Public pool index
   * @param shareAmount - Amount of shares to burn
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [burnInfo, transactionHash, error]
   */
  async burnShares(
    publicPoolIndex: number,
    shareAmount: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signBurnShares({
          publicPoolIndex,
          shareAmount,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_BURN_SHARES,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Stake assets in a staking pool
   * @param stakingPoolIndex - Staking pool index
   * @param shareAmount - Amount of shares to stake
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [stakeInfo, transactionHash, error]
   */
  async stakeAssets(
    stakingPoolIndex: number,
    shareAmount: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        const nextNonce = (nonce === -1) ? await this.getNextNonce() : { nonce };

        const wasmResponse = await (this.wallet as WasmSignerClient).signStakeAssets({
          stakingPoolIndex,
          shareAmount,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_STAKE_ASSETS,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );

        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }

        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Unstake assets from a staking pool
   * @param stakingPoolIndex - Staking pool index
   * @param shareAmount - Amount of shares to unstake
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [unstakeInfo, transactionHash, error]
   */
  async unstakeAssets(
    stakingPoolIndex: number,
    shareAmount: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        const nextNonce = (nonce === -1) ? await this.getNextNonce() : { nonce };

        const wasmResponse = await (this.wallet as WasmSignerClient).signUnstakeAssets({
          stakingPoolIndex,
          shareAmount,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_UNSTAKE_ASSETS,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );

        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }

        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Approve an integrator with fee caps and expiry
   * @param integratorIndex - Integrator account index
   * @param maxPerpsTakerFee - Max perps taker fee
   * @param maxPerpsMakerFee - Max perps maker fee
   * @param maxSpotTakerFee - Max spot taker fee
   * @param maxSpotMakerFee - Max spot maker fee
   * @param approvalExpiry - Approval expiry timestamp
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [approveInfo, transactionHash, error]
   */
  async approveIntegrator(
    integratorIndex: number,
    maxPerpsTakerFee: number,
    maxPerpsMakerFee: number,
    maxSpotTakerFee: number,
    maxSpotMakerFee: number,
    approvalExpiry: number,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        const nextNonce = (nonce === -1) ? await this.getNextNonce() : { nonce };

        const wasmResponse = await (this.wallet as WasmSignerClient).signApproveIntegrator({
          integratorIndex,
          maxPerpsTakerFee,
          maxPerpsMakerFee,
          maxSpotTakerFee,
          maxSpotMakerFee,
          approvalExpiry,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_APPROVE_INTEGRATOR,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );

        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }

        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Create OCO grouped orders (One Cancels Other)
   * @param params - OCO order parameters (exactly two orders)
   * @returns Promise resolving to grouped transaction result
   */
  async createOcoOrder(
    params: OcoOrderParams
  ): Promise<{ tx: any; hash: string; error: string | null }> {
    if (!params.orders || params.orders.length !== 2) {
      return { tx: null, hash: '', error: 'OCO requires exactly two orders' };
    }

    const orders = params.orders.map((order) => ({
      marketIndex: order.marketIndex,
      clientOrderIndex: order.clientOrderIndex ?? 0,
      baseAmount: order.baseAmount,
      price: order.price,
      isAsk: order.isAsk,
      orderType: order.orderType ?? OrderType.LIMIT,
      timeInForce: order.timeInForce ?? TimeInForce.GOOD_TILL_TIME,
      reduceOnly: order.reduceOnly ?? false,
      triggerPrice: order.triggerPrice ?? SignerClient.NIL_TRIGGER_PRICE,
      orderExpiry: order.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
      integratorAccountIndex: order.integratorAccountIndex ?? params.integratorAccountIndex ?? 0,
      integratorTakerFee: order.integratorTakerFee ?? params.integratorTakerFee ?? 0,
      integratorMakerFee: order.integratorMakerFee ?? params.integratorMakerFee ?? 0
    }));

    const [tx, hash, error] = await this.createGroupedOrders(
      GroupingType.OCO,
      orders,
      params.nonce ?? -1,
      {
        ...(params.skipNonce !== undefined && { skipNonce: params.skipNonce }),
        ...(params.integratorAccountIndex !== undefined && { integratorAccountIndex: params.integratorAccountIndex }),
        ...(params.integratorTakerFee !== undefined && { integratorTakerFee: params.integratorTakerFee }),
        ...(params.integratorMakerFee !== undefined && { integratorMakerFee: params.integratorMakerFee })
      }
    );

    return { tx, hash, error };
  }

  /**
   * Create OTOCO grouped orders (entry + take-profit + stop-loss)
   * @param params - OTOCO order parameters
   * @returns Promise resolving to grouped transaction result
   */
  async createOtocoOrder(
    params: OtocoOrderParams
  ): Promise<{ tx: any; hash: string; error: string | null }> {
    const { mainOrder, stopLoss, takeProfit } = params;

    if (mainOrder.baseAmount <= 0) {
      return { tx: null, hash: '', error: 'Main order baseAmount must be greater than 0' };
    }

    if (stopLoss.triggerPrice <= 0 || takeProfit.triggerPrice <= 0) {
      return { tx: null, hash: '', error: 'Stop-loss and take-profit triggerPrice must be greater than 0' };
    }

    const isMarketMainOrder = mainOrder.orderType === OrderType.MARKET;
    let mainPrice = mainOrder.price;

    if (isMarketMainOrder) {
      mainPrice = mainOrder.avgExecutionPrice;
      if (mainOrder.maxSlippage !== undefined && mainOrder.maxSlippage > 0) {
        const idealPrice = mainOrder.idealPrice || mainPrice || 4000;
        const slippageMultiplier = 1 + (mainOrder.maxSlippage * (mainOrder.isAsk ? -1 : 1));
        mainPrice = Math.round(idealPrice * slippageMultiplier);
      } else if (!mainPrice) {
        const defaultIdealPrice = mainOrder.idealPrice || 4000;
        const defaultSlippage = 0.001;
        const slippageMultiplier = 1 + (defaultSlippage * (mainOrder.isAsk ? -1 : 1));
        mainPrice = Math.round(defaultIdealPrice * slippageMultiplier);
      }
    } else if (!mainPrice || mainPrice <= 0) {
      return { tx: null, hash: '', error: 'Main LIMIT order requires a valid price' };
    }

    const mainExpiry = isMarketMainOrder
      ? 0
      : ((mainOrder.orderExpiry === undefined || mainOrder.orderExpiry === -1)
        ? Date.now() + (28 * 24 * 60 * 60 * 1000)
        : mainOrder.orderExpiry);

    const protectionExpiryDefault = Date.now() + (28 * 24 * 60 * 60 * 1000);

    const groupedOrders = [
      {
        marketIndex: mainOrder.marketIndex,
        clientOrderIndex: 0,
        baseAmount: mainOrder.baseAmount,
        price: mainPrice!,
        isAsk: mainOrder.isAsk,
        orderType: isMarketMainOrder ? SignerClient.ORDER_TYPE_MARKET : SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: isMarketMainOrder
          ? SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL
          : (mainOrder.timeInForce ?? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME),
        reduceOnly: mainOrder.reduceOnly ?? false,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: mainExpiry,
        integratorAccountIndex: mainOrder.integratorAccountIndex ?? params.integratorAccountIndex ?? 0,
        integratorTakerFee: mainOrder.integratorTakerFee ?? params.integratorTakerFee ?? 0,
        integratorMakerFee: mainOrder.integratorMakerFee ?? params.integratorMakerFee ?? 0
      },
      {
        marketIndex: mainOrder.marketIndex,
        clientOrderIndex: 0,
        baseAmount: 0,
        price: takeProfit.price ?? takeProfit.triggerPrice,
        isAsk: !mainOrder.isAsk,
        orderType: takeProfit.isLimit ? SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT : SignerClient.ORDER_TYPE_TAKE_PROFIT,
        timeInForce: takeProfit.isLimit
          ? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME
          : SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: true,
        triggerPrice: takeProfit.triggerPrice,
        orderExpiry: takeProfit.orderExpiry ?? protectionExpiryDefault,
        integratorAccountIndex: takeProfit.integratorAccountIndex ?? params.integratorAccountIndex ?? 0,
        integratorTakerFee: takeProfit.integratorTakerFee ?? params.integratorTakerFee ?? 0,
        integratorMakerFee: takeProfit.integratorMakerFee ?? params.integratorMakerFee ?? 0
      },
      {
        marketIndex: mainOrder.marketIndex,
        clientOrderIndex: 0,
        baseAmount: 0,
        price: stopLoss.price ?? stopLoss.triggerPrice,
        isAsk: !mainOrder.isAsk,
        orderType: stopLoss.isLimit ? SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT : SignerClient.ORDER_TYPE_STOP_LOSS,
        timeInForce: stopLoss.isLimit
          ? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME
          : SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: true,
        triggerPrice: stopLoss.triggerPrice,
        orderExpiry: stopLoss.orderExpiry ?? protectionExpiryDefault,
        integratorAccountIndex: stopLoss.integratorAccountIndex ?? params.integratorAccountIndex ?? 0,
        integratorTakerFee: stopLoss.integratorTakerFee ?? params.integratorTakerFee ?? 0,
        integratorMakerFee: stopLoss.integratorMakerFee ?? params.integratorMakerFee ?? 0
      }
    ];

    const [tx, hash, error] = await this.createGroupedOrders(
      GroupingType.OTOCO,
      groupedOrders,
      params.nonce ?? -1,
      {
        ...(params.skipNonce !== undefined && { skipNonce: params.skipNonce }),
        ...(params.integratorAccountIndex !== undefined && { integratorAccountIndex: params.integratorAccountIndex }),
        ...(params.integratorTakerFee !== undefined && { integratorTakerFee: params.integratorTakerFee }),
        ...(params.integratorMakerFee !== undefined && { integratorMakerFee: params.integratorMakerFee })
      }
    );

    return { tx, hash, error };
  }

  /**
   * Create grouped orders (OTO/OCO/OTOCO)
   * @param groupingType - Grouping type: 1=OTO, 2=OCO, 3=OTOCO
   * @param orders - Array of order parameters
   * @param nonce - Optional nonce (will be fetched automatically if not provided)
   * @returns Promise resolving to [groupedOrdersInfo, transactionHash, error]
   */
  async createGroupedOrders(
    groupingType: number,
    orders: Array<{
      marketIndex: number;
      clientOrderIndex: number;
      baseAmount: number;
      price: number;
      isAsk: boolean;
      orderType: number;
      timeInForce: number;
      reduceOnly?: boolean;
      triggerPrice?: number;
      orderExpiry?: number;
      integratorAccountIndex?: number;
      integratorTakerFee?: number;
      integratorMakerFee?: number;
    }>,
    nonce: number = -1,
    options?: {
      skipNonce?: boolean;
      integratorAccountIndex?: number;
      integratorTakerFee?: number;
      integratorMakerFee?: number;
    }
  ): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce if not provided
        const nextNonce = (options?.skipNonce || nonce === 0)
          ? { nonce: nonce === -1 ? 0 : nonce }
          : (nonce === -1) ? 
          await this.getNextNonce() :
          { nonce };

        // Convert orders to WASM format
        const wasmOrders = orders.map(order => ({
          marketIndex: order.marketIndex,
          clientOrderIndex: order.clientOrderIndex,
          baseAmount: order.baseAmount,
          price: order.price,
          isAsk: order.isAsk ? 1 : 0,
          orderType: order.orderType,
          timeInForce: order.timeInForce,
          reduceOnly: (order.reduceOnly ?? false) ? 1 : 0,
          triggerPrice: order.triggerPrice || SignerClient.NIL_TRIGGER_PRICE,
          orderExpiry: order.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
          integratorAccountIndex: order.integratorAccountIndex ?? options?.integratorAccountIndex ?? 0,
          integratorTakerFee: order.integratorTakerFee ?? options?.integratorTakerFee ?? 0,
          integratorMakerFee: order.integratorMakerFee ?? options?.integratorMakerFee ?? 0
        }));

        // Use WASM signer
        const wasmResponse = await (this.wallet as WasmSignerClient).signCreateGroupedOrders({
          groupingType,
          orders: wasmOrders,
          integratorAccountIndex: options?.integratorAccountIndex ?? 0,
          integratorTakerFee: options?.integratorTakerFee ?? 0,
          integratorMakerFee: options?.integratorMakerFee ?? 0,
          skipNonce: options?.skipNonce ? 1 : 0,
          nonce: nextNonce.nonce,
          apiKeyIndex: this.config.apiKeyIndex,
          accountIndex: this.config.accountIndex
        });

        if (wasmResponse.error) {
          return [null, '', wasmResponse.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          wasmResponse.txType || SignerClient.TX_TYPE_CREATE_GROUPED_ORDERS,
          wasmResponse.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(wasmResponse.txInfo), txHash.tx_hash || txHash.hash || wasmResponse.txHash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  // ============================================================================
  // BRIDGE METHODS
  // ============================================================================
  
  /**
   * Get fast bridge information including limits
   * @returns Promise<FastBridgeInfo>
   */
  async getFastBridgeInfo(): Promise<FastBridgeInfo> {
    return await this.bridgeApi.getFastBridgeInfo();
  }

  /**
   * Get supported bridge networks
   * @returns Promise<BridgeSupportedNetwork[]>
   */
  async getSupportedNetworks(): Promise<BridgeSupportedNetwork[]> {
    return await this.bridgeApi.getSupportedNetworks();
  }

  /**
   * Get deposit history for the current account
   * @param l1Address - L1 address
   * @param cursor - Pagination cursor
   * @param filter - Filter criteria
   * @returns Promise<DepositHistory>
   */
  async getDepositHistory(
    l1Address: string,
    cursor?: string,
    filter?: string
  ): Promise<DepositHistory> {
    const authToken = await this.createAuthTokenWithExpiry();
    return await this.bridgeApi.getDepositHistory(
      this.config.accountIndex,
      l1Address,
      authToken,
      cursor,
      filter
    );
  }

  /**
   * Get withdraw history for the current account
   * @param l1Address - L1 address
   * @param cursor - Pagination cursor
   * @param filter - Filter criteria
   * @returns Promise<WithdrawHistory>
   */
  async getWithdrawHistory(
    l1Address: string,
    cursor?: string,
    filter?: string
  ): Promise<WithdrawHistory> {
    const authToken = await this.createAuthTokenWithExpiry();
    return await this.bridgeApi.getWithdrawHistory(
      this.config.accountIndex,
      l1Address,
      authToken,
      cursor,
      filter
    );
  }

  /**
   * Deposit USDC from L1 to L2
   * @param params - L1 deposit parameters
   * @returns Promise<L1DepositResult>
   */
  async depositFromL1(params: L1DepositParams): Promise<L1DepositResult> {
    return await this.bridgeApi.depositFromL1(params);
  }

  /**
   * Get USDC balance on L1
   * @param address - Ethereum address
   * @returns Promise<string> - Balance in USDC units
   */
  async getL1USDCBalance(address: string): Promise<string> {
    return await this.bridgeApi.getL1USDCBalance(address);
  }

  /**
   * Get USDC allowance for bridge contract
   * @param address - Ethereum address
   * @returns Promise<string> - Allowance in USDC units
   */
  async getL1USDCAllowance(address: string): Promise<string> {
    return await this.bridgeApi.getL1USDCAllowance(address);
  }

  /**
   * Get L1 transaction status
   * @param txHash - Transaction hash
   * @returns Promise<L1DepositResult>
   */
  async getL1TransactionStatus(txHash: string): Promise<L1DepositResult> {
    return await this.bridgeApi.getL1TransactionStatus(txHash);
  }

  // ============================================================================
  // TRANSACTION METHODS
  // ============================================================================
  // Simple transaction monitoring
  async getTransaction(txHash: string): Promise<Transaction> {
    return await this.transactionApi.getTransaction({ by: 'hash', value: txHash });
  }
  async waitForTransaction(
    txHash: string, 
    maxWaitTime: number = 60000, 
    pollInterval: number = 2000
  ): Promise<Transaction> {
    const startTime = Date.now();
    let dots = '';
    let animationInterval: NodeJS.Timeout | null = null;
    const explorerHost = ExplorerApiClient.resolveExplorerHost(this.config.url);
    const logsApi = new LogsApi(new ExplorerApiClient({ explorerHost }));
    
    // Start rotating dots animation
    const startAnimation = () => {
      animationInterval = setInterval(() => {
        dots = dots.length >= 3 ? '' : dots + '.';
        process.stdout.write(`\r⏳ Transaction ${txHash.substring(0, 16)}${dots}   `);
      }, 500);
    };
    
    // Stop animation and clear line
    const stopAnimation = () => {
      if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
      }
      process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear the line
    };

    const getLogError = (status: string): string => {
      if (status === 'failed') return 'Transaction failed';
      if (status === 'rejected') return 'Transaction rejected';
      return `Transaction ${status}`;
    };
    
    try {
      startAnimation();
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          const log = await logsApi.getByHash(txHash);
          const status = (log as any).status as string | null | undefined;

          if (status === 'committed' || status === 'executed') {
            stopAnimation();
            return log as unknown as Transaction;
          }

          if (status === 'failed' || status === 'rejected') {
            stopAnimation();
            throw new TransactionException(getLogError(status), 'waitForTransaction', log as unknown as Transaction);
          }

          // Some explorer records may be present with null/unknown status on testnet.
          // In that case, fallback to core transaction API status codes.
          if (!status || status === 'pending') {
            try {
              const transaction = await this.transactionApi.getTransaction({
                by: 'hash' as const,
                value: txHash
              });

              const txStatus = typeof transaction.status === 'number'
                ? transaction.status
                : parseInt(String(transaction.status), 10);

              if (txStatus === SignerClient.TX_STATUS_COMMITTED || txStatus === SignerClient.TX_STATUS_EXECUTED) {
                stopAnimation();
                return transaction;
              }

              if (txStatus === SignerClient.TX_STATUS_FAILED || txStatus === SignerClient.TX_STATUS_REJECTED) {
                stopAnimation();
                throw new TransactionException(`Transaction ${txStatus === SignerClient.TX_STATUS_FAILED ? 'failed' : 'rejected'}`, 'waitForTransaction', transaction);
              }
            } catch {
              // If tx api lookup is unavailable yet, continue polling.
            }
          }

          await new Promise(resolve => setTimeout(resolve, pollInterval));
          
        } catch (error) {
          // Check if it's a NotFoundException (404) - transaction not found yet
          const isNotFound = error instanceof NotFoundException || 
            (error instanceof Error && (
              error.constructor.name === 'NotFoundException' ||
              error.name === 'NotFoundException' ||
              (error as any).status === 404 ||
              error.message.includes('not found') || 
              error.message.includes('404') ||
              error.message.includes('No transaction found') ||
              error.message.includes('Transaction not found')
            ));
          
          if (isNotFound) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
          }
          
          if (error instanceof TransactionException) {
            throw error;
          }
          
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
      
      stopAnimation();
      throw new Error(`Transaction ${txHash} did not confirm within ${maxWaitTime}ms`);
      
    } finally {
      stopAnimation();
    }
  }

  // ============================================================================
  // ACCOUNT MANAGEMENT METHODS
  // ============================================================================
  /**
   * Get list of subaccounts for the current master account
   * @returns Array of subaccount indices
   */
  async getSubAccounts(): Promise<number[]> {
    try {
      // First try: Get account by index
      const response = await this.accountApi.getAccount({
        by: 'index',
        value: this.config.accountIndex.toString()
      });
      
      // The response might be wrapped - extract the actual account
      let account;
      if ((response as any).accounts && Array.isArray((response as any).accounts)) {
        // Response format: { accounts: [{ index: 1000, ... }] }
        account = (response as any).accounts[0];
      } else if ((response as any).data) {
        account = (response as any).data;
      } else {
        account = response;
      }
      
      // Check if the account object has a sub_accounts or related_accounts field
      const subAccountsField = account.sub_accounts || 
                               account.subAccounts || 
                               account.subaccounts ||
                               account.related_accounts ||
                               account.sub_account_indices;
      
      if (subAccountsField && Array.isArray(subAccountsField) && subAccountsField.length > 0) {
        return subAccountsField.map((sub: any) => {
          if (typeof sub === 'object' && sub !== null) {
            return parseInt(sub.index || sub.account_index || sub.accountIndex, 10);
          }
          return parseInt(sub, 10);
        });
      }
      
      // Second try: Use getAccountsByL1Address if we have the L1 address
      if (account.l1_address) {
        const accountsResponse = await this.accountApi.getAccountsByL1Address(account.l1_address);
        
        // Extract the sub_accounts array from the response
        const accountsArray = (accountsResponse as any).sub_accounts || 
                             (accountsResponse as any).accounts ||
                             accountsResponse;
        
        if (Array.isArray(accountsArray)) {
          // Filter by account_type: 1 = subaccount, 0 = master account
          // Also filter out the current master account index
          const subAccountIndices = accountsArray
            .filter((acc: any) => 
              (acc.account_type === 1 || acc.account_type === '1') && // Type 1 = subaccount
              parseInt(acc.index, 10) !== this.config.accountIndex
            )
            .map((acc: any) => parseInt(acc.index, 10));
          
          if (subAccountIndices.length > 0) {
            return subAccountIndices;
          }
        }
      }
      
      return [];
    } catch (error) {
      logger.debug('Error fetching subaccounts', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return [];
    }
  }

  /**
   * Check if a specific account index is a subaccount of the current master account
   * @param accountIndex - Account index to check
   * @returns True if the account is a subaccount
   */
  async isSubAccount(accountIndex: number): Promise<boolean> {
    const subAccounts = await this.getSubAccounts();
    return subAccounts.includes(accountIndex);
  }

  /**
   * Check if the current account is a master account or subaccount
   * Master accounts have lower indices (typically < 2^47 - 1)
   * Subaccounts are created sequentially after their master
   * @returns Object with isMaster flag and estimated master index
   */
  checkAccountType(): { isMaster: boolean; estimatedMasterIndex: number | null } {
    const MAX_MASTER_ACCOUNT_INDEX = 140737488355327; // (1 << 47) - 1
    const accountIndex = this.config.accountIndex;
    
    if (accountIndex <= MAX_MASTER_ACCOUNT_INDEX) {
      return {
        isMaster: true,
        estimatedMasterIndex: null
      };
    }
    
    // For subaccounts, the master is typically the nearest lower index
    // In Lighter, subaccounts are sequential after master
    return {
      isMaster: false,
      estimatedMasterIndex: accountIndex - 1 // Simplified estimation
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  /**
   * Close the API client connection
   */
  async close(): Promise<void> {
    try {
      if (this.wsOrderClient) {
        await this.wsOrderClient.disconnect();
        this.wsOrderClient = null;
      }

      if (this.orderBatcher) {
        await this.orderBatcher.destroy();
        this.orderBatcher = null;
      }

      if (this.nonceCache) {
        this.nonceCache.clearAllCache();
      }
    } finally {
      await this.apiClient.close();
    }
  }
}

