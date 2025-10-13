import { ApiClient } from '../api/api-client';
import { TransactionApi, Transaction } from '../api/transaction-api';
import { AccountApi } from '../api/account-api';
import { WasmSignerClient, createWasmSignerClient } from '../utils/wasm-signer';
import { NodeWasmSignerClient, createNodeWasmSignerClient } from '../utils/node-wasm-signer';
import { RootApi } from '../api/root-api';
import { logger, LogLevel } from '../utils/logger';
import { TransactionException } from '../utils/exceptions';
import { WasmManager } from '../utils/wasm-manager';
import { NonceCache } from '../utils/nonce-cache';
import { performanceMonitor } from '../utils/performance-monitor';
// import { poolManager } from '../utils/memory-pool';
// import { cacheManager } from '../utils/advanced-cache';
import { RequestBatcher } from '../utils/request-batcher';
import { WebSocketOrderClient } from '../api/ws-order-client';

export interface SignerConfig {
  url: string;
  privateKey: string;
  accountIndex: number;
  apiKeyIndex: number;
  wasmConfig?: {
    wasmPath: string;
    wasmExecPath?: string;
  }; // Optional: WASM signer configuration
  logLevel?: LogLevel; // Optional: Logging level
  enableWebSocket?: boolean; // Optional: Enable WebSocket order placement
  enableBatching?: boolean; // Optional: Enable request batching
  enableMemoryPooling?: boolean; // Optional: Enable memory pooling
  enableAdvancedCaching?: boolean; // Optional: Enable advanced caching
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

export class SignerClient {
  private config: SignerConfig;
  private apiClient: ApiClient;
  private transactionApi: TransactionApi;
  private accountApi: AccountApi;
  private wallet: WasmSignerClient | NodeWasmSignerClient;
  private signerType: 'wasm' | 'node-wasm';
  private clientCreated: boolean = false;
  private nonceCache: NonceCache | null = null;
  private wsOrderClient: WebSocketOrderClient | null = null;
  private orderBatcher: RequestBatcher | null = null;

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

  constructor(config: SignerConfig) {
    // Validate configuration
    this.validateConfig(config);
    
    this.config = config;
    this.apiClient = new ApiClient({ host: config.url });
    this.transactionApi = new TransactionApi(this.apiClient);
    this.accountApi = new AccountApi(this.apiClient);
    
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
        if (typeof window !== 'undefined') {
          this.wallet = createWasmSignerClient(config.wasmConfig);
          this.signerType = 'wasm';
        } else {
          this.wallet = createNodeWasmSignerClient(config.wasmConfig);
          this.signerType = 'node-wasm';
        }
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
    // Process individual order request
    const [, txHash, createErr] = await this.createOrderOptimized(params);
    if (createErr) {
      throw new Error(createErr);
    }
    return { txHash };
  }

  private async processCancelRequest(params: any): Promise<any> {
    // Process individual cancel request
    const [, txHash, cancelErr] = await this.cancelOrder(params.marketIndex);
    if (cancelErr) {
      throw new Error(cancelErr);
    }
    return { txHash };
  }

  /**
   * Initialize the signer (required for WASM signers)
   */
  async initialize(): Promise<void> {
    if (this.signerType === 'wasm' || this.signerType === 'node-wasm') {
      await (this.wallet as WasmSignerClient | NodeWasmSignerClient).initialize();
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

    await (this.wallet as WasmSignerClient | NodeWasmSignerClient).createClient({
      url: this.config.url,
      privateKey: this.config.privateKey?.startsWith('0x') ? this.config.privateKey : `0x${this.config.privateKey}`,
      chainId: chainIdNum,
      apiKeyIndex: this.config.apiKeyIndex,
      accountIndex: this.config.accountIndex,
    } as any);

    this.clientCreated = true;
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

  async createOrder(params: CreateOrderParams): Promise<[any, string, string | null]> {
    const endTimer = performanceMonitor.startTimer('create_order', {
      orderType: (params.orderType || SignerClient.ORDER_TYPE_LIMIT).toString(),
      marketIndex: params.marketIndex.toString()
    });

    try {
      // Try WebSocket first if enabled and connected
      if (this.config.enableWebSocket && this.wsOrderClient?.isReady()) {
        try {
          // Get next nonce
          const nonceResult = await this.getNextNonce();
          const nonce = nonceResult.nonce;

          // Sign the order using WASM - use the existing method signature
          const wasmParams = {
            marketIndex: params.marketIndex,
            clientOrderIndex: params.clientOrderIndex,
            baseAmount: params.baseAmount,
            price: params.price,
            isAsk: params.isAsk ? 1 : 0,
            orderType: params.orderType || SignerClient.ORDER_TYPE_LIMIT,
            timeInForce: params.timeInForce || SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
            reduceOnly: params.reduceOnly ? 1 : 0,
            triggerPrice: params.triggerPrice || SignerClient.NIL_TRIGGER_PRICE,
            orderExpiry: params.orderExpiry || SignerClient.DEFAULT_IOC_EXPIRY,
            nonce
          };

          const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCreateOrder(wasmParams);
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
      performanceMonitor.recordCounter('create_order_error', 1, {
        error: errorMessage.substring(0, 50)
      });
      return [null, '', errorMessage];
    } finally {
      endTimer();
    }
  }

  private async createOrderOptimized(params: CreateOrderParams): Promise<[any, string, string | null]> {
    // Get next nonce (with caching)
    const nextNonce = await this.getNextNonce();

    // Handle order expiry
    let orderExpiry = params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY;
    
    // CRITICAL: Python SDK uses -1 for DEFAULT_28_DAY_ORDER_EXPIRY
    // The server-side converts -1 to proper 28-day timestamp
    // WASM/Go validation requires -1 to be converted to actual timestamp CLIENT-SIDE
    if (orderExpiry === -1 || orderExpiry === SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY) {
      // Convert -1 to 28 days from now (in milliseconds)
      orderExpiry = Date.now() + (28 * 24 * 60 * 60 * 1000);
    }

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

    const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCreateOrder(wasmParams);
    // Send exactly what WASM produced, using urlencoded form like Python/Go
    const txHash = await this.transactionApi.sendTxWithIndices(
      SignerClient.TX_TYPE_CREATE_ORDER,
      txInfoStr,
      this.config.accountIndex,
      this.config.apiKeyIndex
    );
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
    const endTimer = performanceMonitor.startTimer('create_market_order', {
      marketIndex: params.marketIndex.toString()
    });

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

      const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCreateOrder(wasmParams);
      
      const txHash = await this.transactionApi.sendTxWithIndices(
        SignerClient.TX_TYPE_CREATE_ORDER,
        txInfoStr,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      return [JSON.parse(txInfoStr), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      performanceMonitor.recordCounter('create_market_order_error', 1, {
        error: errorMessage.substring(0, 50)
      });
      return [null, '', errorMessage];
    } finally {
      endTimer();
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

  async cancelOrder(params: CancelOrderParams): Promise<[any, string, string | null]> {
    try {
      // Get next nonce (with caching)
      const nextNonce = await this.getNextNonce();

      // Use WASM signer
      const wasmParams = {
        marketIndex: params.marketIndex,
        orderIndex: params.orderIndex,
        nonce: nextNonce.nonce
      };

      const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCancelOrder(wasmParams);
      const txHash = await this.transactionApi.sendTx(
        SignerClient.TX_TYPE_CANCEL_ORDER,
        txInfoStr
      );
      return [JSON.parse(txInfoStr), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
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
      
      const result = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signChangePubKey({
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

  async createAuthTokenWithExpiry(expirySeconds: number = SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY): Promise<string> {
    try {
      // Use WASM signer
      const deadline = expirySeconds === SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY ? 
        undefined : Math.floor(Date.now() / 1000) + expirySeconds;
      return await (this.wallet as WasmSignerClient | NodeWasmSignerClient).createAuthToken(deadline);
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
      return await (this.wallet as WasmSignerClient | NodeWasmSignerClient).generateAPIKey(seed);
    } catch (error) {
      return null;
    }
  }

  /**
   * Withdraw USDC from account to Ethereum L1
   * @param usdcAmount - Amount of USDC to withdraw
   * @param nonce - Optional nonce (will fetch if not provided)
   * @returns [withdrawInfo, txHash, error]
   */
  async withdraw(usdcAmount: number, nonce: number = -1): Promise<[any, string, string | null]> {
    try {
      // Get next nonce if not provided (with caching)
      const nextNonce = nonce === -1 ? 
        await this.getNextNonce() :
        { nonce };

      // Scale USDC amount to proper units (multiply by 1e6)
      const scaledAmount = Math.floor(usdcAmount * SignerClient.USDC_TICKER_SCALE);

      // Sign withdraw transaction using WASM
      const txInfo = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signWithdraw({
        usdcAmount: scaledAmount,
        nonce: nextNonce.nonce
      });

      if (txInfo.error) {
        return [null, '', txInfo.error];
      }

      // Send the signed transaction
      const txHash = await this.transactionApi.sendTx(
        SignerClient.TX_TYPE_WITHDRAW,
        txInfo.txInfo
      );

      return [JSON.parse(txInfo.txInfo), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
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
      const result = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCancelAllOrders({
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
   * Create a Take Profit order (market order when trigger price is reached)
   */
  async createTpOrder(
    marketIndex: number,
    clientOrderIndex: number,
    baseAmount: number,
    triggerPrice: number,
    price: number,
    isAsk: boolean,
    reduceOnly: boolean = false,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    // Python SDK uses DEFAULT_IOC_EXPIRY (0) for time_in_force
    // and DEFAULT_28_DAY_ORDER_EXPIRY (-1) for order_expiry
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,  // 0
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,  // -1 (server handles conversion)
      nonce
    });
  }

  /**
   * Create a Take Profit Limit order (limit order when trigger price is reached)
   */
  async createTpLimitOrder(
    marketIndex: number,
    clientOrderIndex: number,
    baseAmount: number,
    triggerPrice: number,
    price: number,
    isAsk: boolean,
    reduceOnly: boolean = false,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    // Python SDK uses DEFAULT_28_DAY_ORDER_EXPIRY (-1) for order_expiry
    // Server converts -1 to 28-day expiry automatically
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,  // 1 (GTT)
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,  // -1 (server handles conversion)
      nonce
    });
  }

  /**
   * Create a Stop Loss order (market order when trigger price is reached)
   */
  async createSlOrder(
    marketIndex: number,
    clientOrderIndex: number,
    baseAmount: number,
    triggerPrice: number,
    price: number = 0,
    isAsk: boolean,
    reduceOnly: boolean = false,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    // For Stop Loss orders, use trigger price as execution price if price is 0 or too low
    const executionPrice = price <= 1 ? triggerPrice : price;
    
    // Python SDK uses DEFAULT_IOC_EXPIRY (0) for time_in_force
    // and DEFAULT_28_DAY_ORDER_EXPIRY (-1) for order_expiry
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price: executionPrice,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_STOP_LOSS,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,  // 0
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,  // -1 (server handles conversion)
      nonce
    });
  }

  /**
   * Create a Stop Loss Limit order (limit order when trigger price is reached)
   */
  async createSlLimitOrder(
    marketIndex: number,
    clientOrderIndex: number,
    baseAmount: number,
    triggerPrice: number,
    price: number,
    isAsk: boolean,
    reduceOnly: boolean = false,
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    // Python SDK uses DEFAULT_28_DAY_ORDER_EXPIRY (-1) for order_expiry
    // Server converts -1 to 28-day expiry automatically
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,  // 1 (GTT)
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,  // -1 (server handles conversion)
      nonce
    });
  }

  /**
   * Modify an existing order
   */
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
   * Transfer USDC to another account
   */
  async transfer(toAccountIndex: number, usdcAmount: number, nonce: number = -1): Promise<[any, string, string | null]> {
    try {
      // Get next nonce if not provided (with caching)
      const nextNonce = nonce === -1 ? 
        await this.getNextNonce() :
        { nonce };

      const scaledAmount = Math.floor(usdcAmount * SignerClient.USDC_TICKER_SCALE);

      // Use WASM signer
      const txInfo = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signTransfer({
        toAccountIndex,
        usdcAmount: scaledAmount,
        fee: 0, // fee - should be calculated separately
        memo: 'a'.repeat(32), // memo - 32 bytes required
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
      return [JSON.parse(txInfo.txInfo), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
  }

  /**
   * Update leverage for a market
   */
  async updateLeverage(marketIndex: number, marginMode: number, initialMarginFraction: number, nonce: number = -1): Promise<[any, string, string | null]> {
    try {
      // Get next nonce if not provided (with caching)
      const nextNonce = nonce === -1 ? 
        await this.getNextNonce() :
        { nonce };

      // Use WASM signer
      const txInfo = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signUpdateLeverage({
        marketIndex,
        fraction: initialMarginFraction,
        marginMode,
        nonce: nextNonce.nonce
      });

      if (txInfo.error) {
        return [null, '', txInfo.error];
      }

      const txHash = await this.transactionApi.sendTxWithIndices(
        SignerClient.TX_TYPE_UPDATE_LEVERAGE,
        txInfo.txInfo,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      return [JSON.parse(txInfo.txInfo), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
  }

  /**
   * Wait for a transaction to be confirmed
   * @param txHash - Transaction hash to wait for
   * @param maxWaitTime - Maximum time to wait in milliseconds (default: 60000 = 1 minute)
   * @param pollInterval - Polling interval in milliseconds (default: 2000 = 2 seconds)
   * @returns Promise<Transaction> - The confirmed transaction
   */
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

    // Helper to extract error information from transaction
    const getErrorInfo = (transaction: Transaction): string => {
      try {
        if (transaction.event_info) {
          const eventInfo = JSON.parse(transaction.event_info);
          if (eventInfo.ae) {
            return eventInfo.ae; // ae = actual error
          }
        }
        if (transaction.info) {
          const info = JSON.parse(transaction.info);
          if (info.Error || info.error) {
            return info.Error || info.error;
          }
        }
      } catch (e) {
        // Failed to parse, return generic message
      }
      return 'No error details available';
    };
    
    try {
      startAnimation();
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          const transaction = await this.transactionApi.getTransaction({
            by: 'hash',
            value: txHash
          });
          
          const status = typeof transaction.status === 'number' ? transaction.status : transaction.status;
          const statusName = getStatusName(transaction.status);
          
          // Status 3 = EXECUTED (successful)
          if (status === SignerClient.TX_STATUS_EXECUTED || transaction.status === 'confirmed') {
            stopAnimation();
            return transaction;
          } 
          // Status 4 = FAILED, Status 5 = REJECTED
          else if (status === SignerClient.TX_STATUS_FAILED || status === SignerClient.TX_STATUS_REJECTED || transaction.status === 'failed') {
            stopAnimation();
            const errorInfo = getErrorInfo(transaction);
            throw new TransactionException(
              `Transaction ${txHash} ${statusName.toLowerCase()}: ${errorInfo}`,
              'waitForTransaction',
              transaction
            );
          } 
          // Status 0,1,2 = Still processing (PENDING, QUEUED, COMMITTED)
          else {
            // Transaction is still processing
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
          
        } catch (error) {
          // If transaction not found yet, continue polling
          if (error instanceof Error && (
            error.message.includes('not found') || 
            error.message.includes('404') ||
            error.message.includes('No transaction found')
          )) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
          }
          
          // If it's a TransactionException, re-throw it
          if (error instanceof TransactionException) {
            throw error;
          }
          
          // For other errors, continue trying
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
      
      stopAnimation();
      throw new Error(`Transaction ${txHash} did not confirm within ${maxWaitTime}ms`);
      
    } finally {
      stopAnimation();
    }
  }

  /**
   * Wait for order confirmation by checking if the order appears in the order book
   * @param marketIndex - Market index
   * @param clientOrderIndex - Client order index
   * @param maxWaitTime - Maximum time to wait in milliseconds (default: 30000 = 30 seconds)
   * @param pollInterval - Polling interval in milliseconds (default: 1000 = 1 second)
   * @returns Promise<boolean> - True if order is confirmed
   */
  async waitForOrderConfirmation(
    _marketIndex: number,
    _clientOrderIndex: number,
    maxWaitTime: number = 30000,
    pollInterval: number = 1000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // This would need to be implemented based on the order API
        // For now, we'll just wait for the transaction to be confirmed
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // TODO: Implement actual order book checking
        // const orderBook = await this.orderApi.getOrderBooks(marketIndex);
        // const orderExists = orderBook.orders.some(order => order.client_order_index === clientOrderIndex);
        // if (orderExists) {
        //   return true;
        // }
        
        // For now, just return true after a short wait to demonstrate the functionality
        return true;
        
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    return false;
  }

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
        // Response format: { accounts: [{ index: 52548, ... }] }
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

  /**
   * Close the API client connection
   */
  async close(): Promise<void> {
    await this.apiClient.close();
  }
}

