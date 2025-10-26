import { ApiClient } from '../api/api-client';
import { TransactionApi, Transaction } from '../api/transaction-api';
import { AccountApi } from '../api/account-api';
import { BridgeApi } from '../api/bridge-api';
import { WasmSignerClient, createWasmSignerClient } from './wasm-signer';
import { RootApi } from '../api/root-api';
import { logger, LogLevel } from '../utils/logger';
import { TransactionException } from '../utils/exceptions';
import { WasmManager } from './wasm-manager';
import { NonceCache } from '../utils/nonce-cache';
import { NonceManager } from '../utils/nonce-manager';
// Performance monitoring removed - not needed
import { RequestBatcher } from '../utils/request-batcher';
import { WebSocketOrderClient } from '../api/ws-order-client';
import { TransferParams, WithdrawParams, FastBridgeInfo, BridgeSupportedNetwork, DepositHistory, WithdrawHistory, L1DepositParams, L1DepositResult, L1BridgeConfig } from '../types/api';
import { OrderApi } from '../api/order-api';

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
  orderExpiry?: number; // Add optional orderExpiry parameter
  nonce?: number; // Add optional nonce parameter
}

export interface CreateMarketOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  avgExecutionPrice: number;
  isAsk: boolean;
  reduceOnly?: boolean;
}

export interface CancelOrderParams {
  marketIndex: number;
  orderIndex: number;
}

export interface ChangeApiKeyParams {
  ethPrivateKey: string;
  newPubkey: string;
  newApiKeyIndex?: number; // Optional, defaults to config.apiKeyIndex + 1
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
  UPDATE_LEVERAGE = 20
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
  orderExpiry?: number; // Add optional orderExpiry parameter
  nonce?: number; // Add optional nonce parameter
}

/**
 * Main SignerClient class for interacting with Lighter Protocol
 * Handles order creation, account management, and transaction signing
 * @class SignerClient
 */
export class SignerClient {
  // ============================================================================
  // PRIVATE PROPERTIES
  // ============================================================================
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
  private nonceCache: NonceCache | null = null;
  private wsOrderClient: WebSocketOrderClient | null = null;
  private orderBatcher: RequestBatcher | null = null;

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  // Constants from Python SDK
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

  static readonly ORDER_TYPE_STOP_LOSS = 2
  static readonly ORDER_TYPE_STOP_LOSS_LIMIT = 3
  static readonly ORDER_TYPE_TAKE_PROFIT = 4
  static readonly ORDER_TYPE_TAKE_PROFIT_LIMIT = 5
  static readonly ORDER_TYPE_TWAP = 6

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

  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================
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
    
    // Initialize logging based on Python SDK patterns
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
          const results = [];
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
   * Similar to Python SDK's process_api_key_and_nonce decorator
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
        
        // Check if it's a nonce-related error
        if (this.isNonceError(error)) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`Nonce error detected (attempt ${attempt + 1}): ${errorMessage}`);
          
          // Hard refresh nonce from API
          await this.hardRefreshNonce();
          
          // If this was the first attempt, retry once
          if (attempt === 0) {
            console.log('Retrying transaction with fresh nonce...');
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
   * Hard refresh nonce from API (like Python SDK)
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
   * Acknowledge transaction failure (like Python SDK)
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

    // Initialize WASM client
    // Determine chainId from API, try layer2BasicInfo first, then /info, fallback to 1
    const root = new RootApi(this.apiClient);
    let chainIdNum = 304;
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
            else if (s.includes('testnet')) chainIdNum = 2;
          }
        }
      } catch {}

      if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) {
        const info: any = await root.getInfo();
        const cid = (info && (info.chain_id ?? info.chainId ?? info.chainID)) ?? 304;
        if (typeof cid === 'number') chainIdNum = cid; else {
          const s = String(cid).toLowerCase();
          if (/^\d+$/.test(s)) chainIdNum = parseInt(s, 10);
          else if (s.includes('mainnet')) chainIdNum = 304;
          else if (s.includes('testnet')) chainIdNum = 2;
          else chainIdNum = 304;
        }
      }
      if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) chainIdNum = 304;
    } catch {
      chainIdNum = 304;
    }

    await (this.wallet as WasmSignerClient).createClient({
      url: this.config.url,
      privateKey: this.config.privateKey?.startsWith('0x') ? this.config.privateKey : `0x${this.config.privateKey}`,
      chainId: chainIdNum,
      apiKeyIndex: this.config.apiKeyIndex,
      accountIndex: this.config.accountIndex,
    } as any);

    this.clientCreated = true;
  }

  // ============================================================================
  // ORDER CREATION METHODS
  // ============================================================================
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

  checkClient(): string | null {
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
            // Get next nonce
            const nonceResult = await this.getNextNonce();
            const nonce = nonceResult.nonce;

            // Handle order expiry conversion (same as createOrderOptimized)
            let orderExpiry = params.orderExpiry !== undefined ? params.orderExpiry : SignerClient.DEFAULT_IOC_EXPIRY;
            
            // NOTE: Do NOT convert milliseconds to seconds - WASM signer expects milliseconds
            // Convert milliseconds to seconds if needed (same logic as createOrderOptimized)
            // if (orderExpiry > 1e12) {
            //   orderExpiry = Math.floor(orderExpiry / 1000);
            // }

            // For IOC orders, use 0 for order expiry (same logic as createOrderOptimized)
            const timeInForce = params.timeInForce || SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL;
            const isSLTPOrder = params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS || 
                              params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT ||
                              params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT ||
                              params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT;
            
            const wasmOrderExpiry = (timeInForce === SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL && !isSLTPOrder) ? 
              0 : orderExpiry;

            // Sign the order using WASM - use the existing method signature
            const wasmParams = {
              marketIndex: params.marketIndex,
              clientOrderIndex: params.clientOrderIndex,
              baseAmount: params.baseAmount,
              price: params.price,
              isAsk: params.isAsk ? 1 : 0,
              orderType: params.orderType || SignerClient.ORDER_TYPE_LIMIT,
              timeInForce: timeInForce,
              reduceOnly: params.reduceOnly ? 1 : 0,
              triggerPrice: params.triggerPrice || SignerClient.NIL_TRIGGER_PRICE,
              orderExpiry: wasmOrderExpiry,
              nonce
            };

            const txInfoStr = await (this.wallet as WasmSignerClient).signCreateOrder(wasmParams);
            const txInfo = JSON.parse(txInfoStr);

            // Send via WebSocket using official Lighter API
            const wsTransaction = await this.wsOrderClient.sendTransaction(
              SignerClient.TX_TYPE_CREATE_ORDER,
              JSON.stringify(txInfo)
            );

            return [txInfo, wsTransaction.hash, null];
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
    // Get next nonce (with caching)
    const nextNonce = await this.getNextNonce();

    // Handle order expiry
    let orderExpiry = params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY;
    
    // CRITICAL: Python SDK uses -1 for DEFAULT_28_DAY_ORDER_EXPIRY
    // The server-side converts -1 to proper 28-day timestamp
    // WASM/Go validation requires -1 to be converted to actual timestamp CLIENT-SIDE
    if (orderExpiry === undefined || orderExpiry === -1 || orderExpiry === SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY) {
      orderExpiry = Date.now() + (28 * 24 * 60 * 60 * 1000); // Convert to milliseconds
    }
    // NOTE: Do NOT convert milliseconds to seconds - WASM signer expects milliseconds
    // else if (orderExpiry > 1e12) {
    //   orderExpiry = Math.floor(orderExpiry / 1000);
    // }

    // Use WASM signer
    // For IOC orders, use NilOrderExpiry (0) EXCEPT for SL/TP orders
    const isSLTPOrder = params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS || 
                        params.orderType === SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT ||
                        params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT ||
                        params.orderType === SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT;
    
    const wasmOrderExpiry = (params.timeInForce === SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL && !isSLTPOrder) ? 
      0 : orderExpiry;
      
    const wasmParams = {
      marketIndex: params.marketIndex,
      clientOrderIndex: params.clientOrderIndex,
      baseAmount: params.baseAmount,
      price: params.price,
      isAsk: params.isAsk ? 1 : 0,
      orderType: params.orderType || SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: params.timeInForce || SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
      reduceOnly: (params.reduceOnly || false) ? 1 : 0,
      triggerPrice: params.triggerPrice || SignerClient.NIL_TRIGGER_PRICE,
      orderExpiry: wasmOrderExpiry,
      nonce: nextNonce.nonce
    };

    const txInfoStr = await (this.wallet as WasmSignerClient).signCreateOrder(wasmParams);
    // Send exactly what WASM produced, using urlencoded form like Python/Go
    const txHash = await this.transactionApi.sendTxWithIndices(
      SignerClient.TX_TYPE_CREATE_ORDER,
      txInfoStr,
      this.config.accountIndex,
      this.config.apiKeyIndex
    );
    
    // Check for immediate errors in the response (like Python SDK)
    if (txHash.code && txHash.code !== 200) {
      this.acknowledgeFailure(); // Like Python SDK line 99
      return [null, '', txHash.message || 'Transaction failed'];
    }
    
    return [JSON.parse(txInfoStr), txHash.tx_hash || txHash.hash || '', null];
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
      // Get next nonce (with caching)
      const nextNonce = await this.getNextNonce();

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
        nonce: nextNonce.nonce
        };

      const txInfoStr = await (this.wallet as WasmSignerClient).signCreateOrder(wasmParams);
      
      const txHash = await this.transactionApi.sendTxWithIndices(
        SignerClient.TX_TYPE_CREATE_ORDER,
        txInfoStr,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      return [JSON.parse(txInfoStr), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMessage);
    } finally {
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
        reduceOnly: params.reduceOnly || false
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
        reduceOnly: params.reduceOnly || false
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
  }

  // ============================================================================
  // ORDER MANAGEMENT METHODS
  // ============================================================================
  async cancelOrder(params: CancelOrderParams): Promise<[any, string, string | null]> {
    return await this.processTransactionWithRetry(async () => {
      try {
        // Get next nonce (with caching)
        const nextNonce = await this.getNextNonce();

        // Use WASM signer
        const wasmParams = {
          marketIndex: params.marketIndex,
          orderIndex: params.orderIndex,
          nonce: nextNonce.nonce
        };

        const txInfoStr = await (this.wallet as WasmSignerClient).signCancelOrder(wasmParams);
        const txHash = await this.transactionApi.sendTx(
          SignerClient.TX_TYPE_CANCEL_ORDER,
          txInfoStr
        );
        
        // Check for immediate errors in the response (like Python SDK)
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(txInfoStr), txHash.tx_hash || txHash.hash || '', null];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return [null, '', errorMessage];
      }
    });
  }

  /**
   * Change API key (register new public key)
   * @param ethPrivateKey - Ethereum private key for L1 signature
   * @param newPubkey - New public key to register
   * @returns [txHash, txInfo, error]
   */
  async changeApiKey(params: ChangeApiKeyParams): Promise<[any, string, string | null]> {
    try {
      // Determine new API key index (default to current + 1)
      const newApiKeyIndex = params.newApiKeyIndex ?? (this.config.apiKeyIndex + 1);
      
      // For first-time registration of a new key slot, use nonce 0
      // For subsequent uses of that key, nonce increments
      const nonce = 0;

      // Create L1 signature message with NEW API key index
      const nonceHex = '0x' + nonce.toString(16).padStart(16, '0');
      const accountIndexHex = '0x' + this.config.accountIndex.toString(16).padStart(16, '0');
      const newApiKeyIndexHex = '0x' + newApiKeyIndex.toString(16).padStart(16, '0');
      
      const l1Message = `Register Lighter Account\n\npubkey: 0x${params.newPubkey}\nnonce: ${nonceHex}\naccount index: ${accountIndexHex}\napi key index: ${newApiKeyIndexHex}\nOnly sign this message for a trusted client!`;
      
      // Sign with ETH key
      const ethers = await import('ethers');
      const wallet = new ethers.Wallet(params.ethPrivateKey);
      const l1Sig = await wallet.signMessage(l1Message);

      // Sign ChangePubKey transaction with current API key
      const expiredAt = Date.now() + (10 * 60 * 1000); // 10 minutes
      
      const result = await (this.wallet as WasmSignerClient).signChangePubKey({
        pubkey: params.newPubkey,
        l1Sig,
        newApiKeyIndex,
        nonce,
        expiredAt
      });

      if (result.error) {
        return [null, '', result.error];
      }

      // Send transaction - try simple sendTx first
      const txHash = await this.transactionApi.sendTx(
        SignerClient.TX_TYPE_CHANGE_PUB_KEY,
        result.txInfo
      );

      return [txHash, txHash.tx_hash || txHash.hash || '', null];
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
        undefined : Math.floor(Date.now() / 1000) + expirySeconds;
      return await (this.wallet as WasmSignerClient).createAuthToken(deadline);
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
   */
  async createSubAccount(_nonce: number = -1): Promise<[any, string | null]> {
    // WASM signer doesn't support createSubAccount yet
    throw new Error('createSubAccount not supported with WASM signer.');
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
      const result = await (this.wallet as WasmSignerClient).signCancelAllOrders({
        timeInForce,
        time,
        nonce: nextNonce.nonce
      });

      if (result.error) {
        return [null, null, result.error];
      }

      const txInfo = JSON.parse(result.txInfo);
      const apiResponse = await this.transactionApi.sendTxWithIndices(
        SignerClient.TX_TYPE_CANCEL_ALL_ORDERS,
        result.txInfo,
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
   * Create a unified order with optional stop-loss and take-profit orders
   * Signs all orders individually then sends as batch transaction
   * Includes error handling like Python SDK (acknowledgeFailure on code !== 200)
   * 
   * @param params - Unified order parameters
   * @returns Promise resolving to unified order result
   * 
   * @example
   * const result = await client.createUnifiedOrder({
   *   marketIndex: 0,
   *   clientOrderIndex: Date.now(),
   *   baseAmount: 1000000,
   *   isAsk: false,
   *   orderType: OrderType.MARKET,
   *   avgExecutionPrice: 300000,
   *   stopLoss: { triggerPrice: 285000, isLimit: false },
   *   takeProfit: { triggerPrice: 315000, isLimit: false }
   * });
   */
  async createUnifiedOrder(params: {
    marketIndex: number;
    clientOrderIndex: number;
    baseAmount: number;
    isAsk: boolean;
    orderType: OrderType;
    price?: number;
    avgExecutionPrice?: number;
    maxSlippage?: number; // Max slippage as decimal (e.g., 0.001 = 0.1%, default 0.001)
    idealPrice?: number; // Ideal price to calculate slippage from
    stopLoss?: {
      triggerPrice: number;
      price?: number;
      isLimit?: boolean;
    };
    takeProfit?: {
      triggerPrice: number;
      price?: number;
      isLimit?: boolean;
    };
    reduceOnly?: boolean;
    timeInForce?: TimeInForce;
    orderExpiry?: number;
  }): Promise<{
    mainOrder: { tx: any, hash: string, error: string | null };
    stopLoss?: { tx: any, hash: string, error: string | null };
    takeProfit?: { tx: any, hash: string, error: string | null };
    batchResult: { hashes: string[], errors: string[] };
    success: boolean;
    message: string;
  }> {
    try {
      // Validate required parameters
      if (!params.marketIndex && params.marketIndex !== 0) {
        return {
          mainOrder: { tx: null, hash: '', error: 'Market index is required' },
          batchResult: { hashes: [], errors: ['Market index is required'] },
          success: false,
          message: 'Market index is required'
        };
      }

      if (!params.baseAmount || params.baseAmount <= 0) {
        return {
          mainOrder: { tx: null, hash: '', error: 'Base amount must be greater than 0' },
          batchResult: { hashes: [], errors: ['Base amount must be greater than 0'] },
          success: false,
          message: 'Base amount must be greater than 0'
        };
      }

      // Check if SL/TP should be created (only if triggerPrice > 0)
      // Note: TWAP orders execute over time, creating positions gradually
      // SL/TP in the same batch would execute before positions exist
      // For now, only create SL/TP for LIMIT and MARKET orders
      const isTWAPOrder = params.orderType === OrderType.TWAP;
      const shouldCreateSL = !isTWAPOrder && params.stopLoss && params.stopLoss.triggerPrice > 0;
      const shouldCreateTP = !isTWAPOrder && params.takeProfit && params.takeProfit.triggerPrice > 0;
      
      // Get nonces for all orders in the batch
      const orderCount = 1 + (shouldCreateSL ? 1 : 0) + (shouldCreateTP ? 1 : 0);
      const nonces = await this.getNextNonces(orderCount);

      // Prepare transactions array
      const txTypes: number[] = [];
      const txInfos: string[] = [];

      // 1. Sign main order using WASM signer directly
      let mainTxInfo: string;
      let mainOrderResult: any;

      if (params.orderType === OrderType.MARKET) {
        // Calculate avgExecutionPrice with slippage protection if needed
        let avgExecutionPrice = params.avgExecutionPrice;
        
        // Apply slippage protection if maxSlippage is provided
        if (params.maxSlippage !== undefined && params.maxSlippage > 0) {
          const idealPrice = params.idealPrice || avgExecutionPrice || 4000; // Fallback to 4000 if no price provided
          const slippageMultiplier = 1 + (params.maxSlippage * (params.isAsk ? -1 : 1));
          avgExecutionPrice = Math.round(idealPrice * slippageMultiplier);
        } else if (!avgExecutionPrice) {
          // Default slippage of 0.1% if not provided
          const defaultIdealPrice = params.idealPrice || 4000;
          const defaultSlippage = 0.001; // 0.1%
          const slippageMultiplier = 1 + (defaultSlippage * (params.isAsk ? -1 : 1));
          avgExecutionPrice = Math.round(defaultIdealPrice * slippageMultiplier);
        }
        
        // Use WASM signer directly for market order
        const marketOrderParams = {
          marketIndex: params.marketIndex,
          clientOrderIndex: params.clientOrderIndex,
          baseAmount: params.baseAmount,
          price: avgExecutionPrice!,
          isAsk: params.isAsk ? 1 : 0,
          orderType: SignerClient.ORDER_TYPE_MARKET,
          timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          reduceOnly: (params.reduceOnly ?? false) ? 1 : 0,
          triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
          orderExpiry: 0, // Market orders use 0 for orderExpiry
          nonce: nonces[0]!
        };
        
        mainTxInfo = await (this.wallet as WasmSignerClient).signCreateOrder(marketOrderParams);
        mainOrderResult = JSON.parse(mainTxInfo);
      } else if (params.orderType === OrderType.LIMIT) {
        // Use WASM signer directly for limit order
        const limitOrderParams = {
          marketIndex: params.marketIndex,
          clientOrderIndex: params.clientOrderIndex,
          baseAmount: params.baseAmount,
          price: params.price!,
          isAsk: params.isAsk ? 1 : 0,
          orderType: SignerClient.ORDER_TYPE_LIMIT,
          timeInForce: params.timeInForce ?? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
          reduceOnly: (params.reduceOnly ?? false) ? 1 : 0,
          triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
          orderExpiry: params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
          nonce: nonces[0]!
        };
        
        mainTxInfo = await (this.wallet as WasmSignerClient).signCreateOrder(limitOrderParams);
        mainOrderResult = JSON.parse(mainTxInfo);
      } else if (params.orderType === OrderType.TWAP) {
        // Use WASM signer directly for TWAP order
        const twapOrderParams = {
          marketIndex: params.marketIndex,
          clientOrderIndex: params.clientOrderIndex,
          baseAmount: params.baseAmount,
          price: params.price!,
          isAsk: params.isAsk ? 1 : 0,
          orderType: SignerClient.ORDER_TYPE_TWAP,
          timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
          reduceOnly: (params.reduceOnly ?? false) ? 1 : 0,
          triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
          orderExpiry: params.orderExpiry ?? (Date.now() + (60 * 60 * 1000)), // Default 1 hour for TWAP
          nonce: nonces[0]!
        };
        
        mainTxInfo = await (this.wallet as WasmSignerClient).signCreateOrder(twapOrderParams);
        mainOrderResult = JSON.parse(mainTxInfo);
      } else {
        return {
          mainOrder: { tx: null, hash: '', error: `Unsupported order type: ${params.orderType}` },
          batchResult: { hashes: [], errors: [`Unsupported order type: ${params.orderType}`] },
          success: false,
          message: `Unsupported order type: ${params.orderType}`
        };
      }

      txTypes.push(SignerClient.TX_TYPE_CREATE_ORDER);
      txInfos.push(mainTxInfo);

      // 2. Sign SL order (if provided and triggerPrice > 0)
      let slTxInfo: string | null = null;
      let slOrderResult: any = null;
      if (shouldCreateSL) {
        const sl = params.stopLoss!;
        // SL direction: If main order is ASK (sell), SL should be BID (buy) to close short
        // If main order is BID (buy), SL should be ASK (sell) to close long
        const slIsAsk = !params.isAsk; // Opposite direction for SL
        
        // Use WASM signer directly for SL order
        // SL/TP orders MUST be reduce-only to close positions created by the main order
        // When the parent order creates a position, SL/TP will trigger to close it
        const slOrderParams = {
          marketIndex: params.marketIndex,
          clientOrderIndex: params.clientOrderIndex + 1, // SL uses mainOrderIndex + 1
          baseAmount: params.baseAmount,
          price: sl.price ?? sl.triggerPrice,
          isAsk: slIsAsk ? 1 : 0,
          orderType: sl.isLimit ? SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT : SignerClient.ORDER_TYPE_STOP_LOSS,
          timeInForce: sl.isLimit ? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME : SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          reduceOnly: 1, // SL/TP are ALWAYS reduce-only to close the position
          triggerPrice: sl.triggerPrice,
          orderExpiry: Date.now() + (28 * 24 * 60 * 60 * 1000), // 28 days from now in milliseconds
          nonce: nonces[1]!
        };
        
        slTxInfo = await (this.wallet as WasmSignerClient).signCreateOrder(slOrderParams);
        slOrderResult = JSON.parse(slTxInfo);
        
        txTypes.push(SignerClient.TX_TYPE_CREATE_ORDER);
        txInfos.push(slTxInfo);
      }

      // 3. Sign TP order (if provided and triggerPrice > 0)
      let tpTxInfo: string | null = null;
      let tpOrderResult: any = null;
      if (shouldCreateTP) {
        const tp = params.takeProfit!;
        // TP direction: If main order is ASK (sell), TP should be BID (buy) to close short
        // If main order is BID (buy), TP should be ASK (sell) to close long
        const tpIsAsk = !params.isAsk; // Opposite direction for TP
        
        // Use WASM signer directly for TP order
        // SL/TP orders MUST be reduce-only to close positions created by the main order
        // When the parent order creates a position, SL/TP will trigger to close it
        const tpOrderParams = {
          marketIndex: params.marketIndex,
          clientOrderIndex: params.clientOrderIndex + (shouldCreateSL ? 2 : 1), // TP uses mainOrderIndex + 2 (or +1 if no SL)
          baseAmount: params.baseAmount,
          price: tp.price ?? tp.triggerPrice,
          isAsk: tpIsAsk ? 1 : 0,
          orderType: tp.isLimit ? SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT : SignerClient.ORDER_TYPE_TAKE_PROFIT,
          timeInForce: tp.isLimit ? SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME : SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          reduceOnly: 1, // SL/TP are ALWAYS reduce-only to close the position
          triggerPrice: tp.triggerPrice,
          orderExpiry: Date.now() + (28 * 24 * 60 * 60 * 1000), // 28 days from now in milliseconds
          nonce: nonces[shouldCreateSL ? 2 : 1]!
        };
        
        tpTxInfo = await (this.wallet as WasmSignerClient).signCreateOrder(tpOrderParams);
        tpOrderResult = JSON.parse(tpTxInfo);
        
        txTypes.push(SignerClient.TX_TYPE_CREATE_ORDER);
        txInfos.push(tpTxInfo);
      }

      // Send batch transaction
      const batchResult = await this.transactionApi.sendTransactionBatch({
        tx_types: JSON.stringify(txTypes),
        tx_infos: JSON.stringify(txInfos)
      });

      // Check for immediate errors in the batch response (like Python SDK)
      if (batchResult.code && batchResult.code !== 200) {
        this.acknowledgeFailure();
        return {
          mainOrder: { tx: mainOrderResult, hash: '', error: batchResult.message || 'Batch transaction failed' },
          batchResult: { hashes: [], errors: [batchResult.message || 'Batch transaction failed'] },
          success: false,
          message: batchResult.message || 'Batch transaction failed'
        };
      }

      // Parse results
      const result: {
        mainOrder: { tx: any, hash: string, error: string | null };
        stopLoss?: { tx: any, hash: string, error: string | null };
        takeProfit?: { tx: any, hash: string, error: string | null };
        batchResult: { hashes: string[], errors: string[] };
        success: boolean;
        message: string;
      } = {
        mainOrder: { tx: mainOrderResult, hash: '', error: null },
        batchResult: { hashes: [], errors: [] },
        success: false,
        message: ''
      };

      // Extract hashes from batch result
      if (batchResult.tx_hash && Array.isArray(batchResult.tx_hash)) {
        result.batchResult.hashes = batchResult.tx_hash;
        result.mainOrder.hash = batchResult.tx_hash[0] || '';
        
        if (shouldCreateSL && batchResult.tx_hash[1]) {
          result.stopLoss = { tx: slOrderResult, hash: batchResult.tx_hash[1], error: null };
        }
        
        if (shouldCreateTP && batchResult.tx_hash[shouldCreateSL ? 2 : 1]) {
          const tpHash = batchResult.tx_hash[shouldCreateSL ? 2 : 1];
          if (tpHash) {
            result.takeProfit = { tx: tpOrderResult, hash: tpHash, error: null };
          }
        }
      }

      // Determine success status
      result.success = result.batchResult.hashes.length === orderCount;
      result.message = result.success 
        ? `Successfully created ${orderCount} order(s) with batch transaction`
        : `Partial failure: Created ${result.batchResult.hashes.length}/${orderCount} orders`;

      return result;

    } catch (error) {
      // Acknowledge failure to prevent nonce leak (like Python SDK)
      this.acknowledgeFailure();
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        mainOrder: { tx: null, hash: '', error: errorMessage },
        batchResult: { hashes: [], errors: [errorMessage] },
        success: false,
        message: `Failed to create unified order: ${errorMessage}`
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================
  async modifyOrder(
    _marketIndex: number,
    _orderIndex: number,
    _baseAmount: number,
    _price: number,
    _triggerPrice: number,
    _nonce: number = -1
  ): Promise<[any, string, string | null]> {
    // WASM signer doesn't support modifyOrder yet
    throw new Error('modifyOrder not supported with WASM signer.');
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

        // Use WASM signer
        const txInfo = await (this.wallet as WasmSignerClient).signTransfer({
          toAccountIndex: params.toAccountIndex,
          usdcAmount: scaledAmount,
          fee: params.fee,
          memo: params.memo,
          ethPrivateKey: params.ethPrivateKey,
          nonce: nextNonce.nonce
        });

        if (txInfo.error) {
          return [null, '', txInfo.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          SignerClient.TX_TYPE_TRANSFER,
          txInfo.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response (like Python SDK)
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(txInfo.txInfo), txHash.tx_hash || txHash.hash || '', null];
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
        const txInfo = await (this.wallet as WasmSignerClient).signWithdraw({
          usdcAmount: scaledAmount,
          nonce: nextNonce.nonce
        });

        if (txInfo.error) {
          return [null, '', txInfo.error];
        }

        const txHash = await this.transactionApi.sendTxWithIndices(
          SignerClient.TX_TYPE_WITHDRAW,
          txInfo.txInfo,
          this.config.accountIndex,
          this.config.apiKeyIndex
        );
        
        // Check for immediate errors in the response (like Python SDK)
        if (txHash.code && txHash.code !== 200) {
          this.acknowledgeFailure();
          return [null, '', txHash.message || 'Transaction failed'];
        }
        
        return [JSON.parse(txInfo.txInfo), txHash.tx_hash || txHash.hash || '', null];
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
  // Simple transaction monitoring like Python SDK
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

    // Helper to get status name from code
    const getStatusName = (status: number | string): string => {
      if (typeof status === 'string') return status;
      switch (status) {
        case SignerClient.TX_STATUS_PENDING: return 'Pending';
        case SignerClient.TX_STATUS_QUEUED: return 'Queued';
        case SignerClient.TX_STATUS_COMMITTED: return 'Committed';
        case SignerClient.TX_STATUS_EXECUTED: return 'Executed';
        case SignerClient.TX_STATUS_FAILED: return 'Failed';
        case SignerClient.TX_STATUS_REJECTED: return 'Rejected';
        default: return `Unknown (${status})`;
      }
    };

    // Enhanced error detection (like Python SDK)
    const getErrorInfo = (transaction: Transaction): string => {
      try {
        // 1. Check API response code first (most reliable - like Python SDK)
        if (transaction.code && transaction.code !== 200) {
          if (transaction.message) {
            return transaction.message;
          }
          return 'Transaction failed';
        }
        
        // 2. Check direct message field
        if (transaction.message) {
          return transaction.message;
        }
        
        // 3. Check event_info for execution errors
        if (transaction.event_info) {
          try {
            const eventInfo = JSON.parse(transaction.event_info);
            
            // Check for actual error field (ae) from the API
            if (eventInfo.ae) {
              try {
                // Parse ae which contains the actual error from server
                const parsedAe = JSON.parse(eventInfo.ae);
                // Return the server's actual error message
                return parsedAe.message || JSON.stringify(parsedAe);
              } catch {
                // If not JSON, return as-is
                return eventInfo.ae;
              }
            }
          
            // Only use these as fallbacks if ae is not present
            if (eventInfo.error) {
              return eventInfo.error;
            }
            
            if (eventInfo.message) {
              return eventInfo.message;
            }
          } catch (parseError) {
            // If we can't parse event_info, return it as-is
            return transaction.event_info;
          }
        }
        
        // 4. Check info field for additional error details
        if (transaction.info) {
          const info = JSON.parse(transaction.info);
          
          // Check for Error field (capitalized)
          if (info.Error) {
            return info.Error;
          }
          
          // Check for error field
          if (info.error) {
            return info.error;
          }
          
          // Check for message field
          if (info.message) {
            return info.message;
          }
          
          // Check for specific error structures
          if (info.error_code && info.error_message) {
            return `${info.error_message} (code: ${info.error_code})`;
          }
          
          // Check for validation errors
          if (info.validation_errors && Array.isArray(info.validation_errors)) {
            return `Validation errors: ${info.validation_errors.join(', ')}`;
          }
        }
        
        // 5. Check data field for error information
        if (transaction.data) {
          const data = typeof transaction.data === 'string' ? JSON.parse(transaction.data) : transaction.data;
          
          if (data.error) {
            return data.error;
          }
          
          if (data.message) {
            return data.message;
          }
          
          if (data.Error) {
            return data.Error;
          }
        }
        
      } catch (e) {
        // Failed to parse, log and continue to generic message
        console.log(`Failed to parse transaction error info: ${e}`);
      }
      
      return 'Transaction failed - no detailed error information available';
    };
    
    try {
      startAnimation();
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          const transaction = await this.transactionApi.getTransaction({
            by: 'hash' as const,
            value: txHash
          });
          
          const status = typeof transaction.status === 'number' ? transaction.status : parseInt(String(transaction.status), 10);
          const statusName = getStatusName(status);
          
          // No logging - just check status silently
          
          // Status 3 = EXECUTED (successful)
          if (status === SignerClient.TX_STATUS_EXECUTED) {
            stopAnimation();
            console.log('✅ Transaction executed successfully!');
            return transaction;
          } 
          // Status 4 = FAILED, Status 5 = REJECTED
          else if (status === SignerClient.TX_STATUS_FAILED || status === SignerClient.TX_STATUS_REJECTED) {
            stopAnimation();
            const errorInfo = getErrorInfo(transaction);
            throw new TransactionException(
              errorInfo,
              'waitForTransaction',
              transaction
            );
          } 
          // Status 0,1 = Still processing (PENDING, QUEUED)
          else if (status === SignerClient.TX_STATUS_PENDING || status === SignerClient.TX_STATUS_QUEUED) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
          // Status 2 = COMMITTED - Check for errors or success
          else if (status === SignerClient.TX_STATUS_COMMITTED) {
            const errorInfo = getErrorInfo(transaction);
            
            // If there's an actual error message, throw it
            if (errorInfo && errorInfo !== 'Transaction failed - no detailed error information available') {
              stopAnimation();
              throw new TransactionException(errorInfo, 'waitForTransaction', transaction);
            }
            
            // Check if transaction has code 200 (success) - return immediately
            const txCode = transaction.code;
            if (txCode !== undefined && txCode !== null && (txCode === 200 || String(txCode) === '200')) {
              // Transaction committed successfully with code 200
              stopAnimation();
              console.log('✅ Transaction committed successfully!');
              return transaction;
            }
            
            // No code 200 yet, wait a bit more
            const timeWaiting = Date.now() - startTime;
            if (timeWaiting > maxWaitTime * 0.8) {
              stopAnimation();
              throw new TransactionException('Transaction committed but execution timed out', 'waitForTransaction', transaction);
            }
            
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
          // Unknown status
          else {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
          
        } catch (error) {
          // If transaction not found yet, continue polling
          if (error instanceof Error && (
            error.message.includes('not found') || 
            error.message.includes('404') ||
            error.message.includes('No transaction found') ||
            error.message.includes('Transaction not found')
          )) {
            console.log(`⏳ Transaction not found yet, continuing to poll...`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
          }
          
          // If it's a TransactionException, re-throw it
          if (error instanceof TransactionException) {
            throw error;
          }
          
          // For other errors, log and continue trying
          console.log(`⚠️ Error checking transaction status: ${error instanceof Error ? error.message : String(error)}`);
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
    await this.apiClient.close();
  }
}

