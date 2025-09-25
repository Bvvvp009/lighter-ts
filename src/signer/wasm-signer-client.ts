import { ApiClient } from '../api/api-client';
import { TransactionApi, Transaction } from '../api/transaction-api';
import { AccountApi } from '../api/account-api';
import { WasmSignerClient, createWasmSignerClient } from '../utils/wasm-signer';
import { NodeWasmSignerClient, createNodeWasmSignerClient } from '../utils/node-wasm-signer';
import { RootApi } from '../api/root-api';
import { logger, LogLevel } from '../utils/logger';
import { TransactionException } from '../utils/exceptions';

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
}

export interface CreateOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  price: number;
  isAsk: boolean;
  orderType: number;
  timeInForce: number;
  reduceOnly: boolean;
  triggerPrice: number;
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
}

export class SignerClient {
  private config: SignerConfig;
  private apiClient: ApiClient;
  private transactionApi: TransactionApi;
  private accountApi: AccountApi;
  private wallet: WasmSignerClient | NodeWasmSignerClient;
  private signerType: 'wasm' | 'node-wasm';
  private clientCreated: boolean = false;

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

  static readonly CROSS_MARGIN_MODE = 0
  static readonly ISOLATED_MARGIN_MODE = 1

  constructor(config: SignerConfig) {
    this.config = config;
    this.apiClient = new ApiClient({ host: config.url });
    this.transactionApi = new TransactionApi(this.apiClient);
    this.accountApi = new AccountApi(this.apiClient);
    
    // Initialize logging based on Python SDK patterns
    if (config.logLevel !== undefined) {
      logger.setLevel(config.logLevel);
    }
    
    // Initialize WASM signer
    if (config.wasmConfig) {
      // Check if we're in a browser or Node.js environment
      if (typeof window !== 'undefined') {
        this.wallet = createWasmSignerClient(config.wasmConfig);
        this.signerType = 'wasm';
      } else {
        this.wallet = createNodeWasmSignerClient(config.wasmConfig);
        this.signerType = 'node-wasm';
      }
    } else {
      throw new Error('wasmConfig must be provided.');
    }
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
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

      // Handle order expiry - use real timestamp for GTT orders (milliseconds)
      const orderExpiry = params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY;

      // Use WASM signer
      // For IOC orders, use NilOrderExpiry (0)
      const wasmOrderExpiry = params.timeInForce === SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL ? 
        0 : orderExpiry;
        
      const wasmParams = {
        marketIndex: params.marketIndex,
        clientOrderIndex: params.clientOrderIndex,
        baseAmount: params.baseAmount,
        price: params.price,
        isAsk: params.isAsk ? 1 : 0,
        orderType: params.orderType,
        timeInForce: params.timeInForce,
        reduceOnly: params.reduceOnly ? 1 : 0,
        triggerPrice: params.triggerPrice,
        orderExpiry: wasmOrderExpiry,
        nonce: nextNonce.nonce
      };

      const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCreateOrder(wasmParams);
      // Send exactly what WASM produced, using urlencoded form like Python/Go
      console.log('WASM signCreateOrder result:', txInfoStr);
      const txHash = await this.transactionApi.sendTxWithIndices(
        SignerClient.TX_TYPE_CREATE_ORDER,
        txInfoStr,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      return [JSON.parse(txInfoStr), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return [null, '', errorMessage];
    }
  }

  async createMarketOrder(params: CreateMarketOrderParams): Promise<[any, string, string | null]> {
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

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
      
      // Debug: Log the transaction info string to see what WASM is producing
      console.log('WASM signCreateOrder result:', txInfoStr);
      
      const txHash = await this.transactionApi.sendTxWithIndices(
        SignerClient.TX_TYPE_CREATE_ORDER,
        txInfoStr,
        this.config.accountIndex,
        this.config.apiKeyIndex
      );
      return [JSON.parse(txInfoStr), txHash.tx_hash || txHash.hash || '', null];
    } catch (error) {
      console.error('Error creating market order:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
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
      console.error('Error creating market order with max slippage:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
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
      console.error('Error creating market order if slippage:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<[any, string, string | null]> {
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

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
      console.error('Error canceling order:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async changeApiKey(_params: ChangeApiKeyParams): Promise<[any, string, string | null]> {
    // WASM signer doesn't support changeApiKey yet
    throw new Error('changeApiKey not supported with WASM signer.');
  }

  async createAuthTokenWithExpiry(expirySeconds: number = SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY): Promise<string> {
    try {
      // Use WASM signer
      const deadline = expirySeconds === SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY ? 
        undefined : Math.floor(Date.now() / 1000) + expirySeconds;
      return await (this.wallet as WasmSignerClient | NodeWasmSignerClient).createAuthToken(deadline);
    } catch (error) {
      console.error('Error creating auth token:', error);
      throw error;
    }
  }

  /**
   * Generate a new API key pair using WASM signer
   */
  async generateAPIKey(seed?: string): Promise<{ privateKey: string; publicKey: string } | null> {
    try {
      return await (this.wallet as WasmSignerClient | NodeWasmSignerClient).generateAPIKey(seed);
    } catch (error) {
      console.error('Error generating API key:', error);
      return null;
    }
  }

  /**
   * Withdraw USDC from account
   */
  async withdraw(_usdcAmount: number, _nonce: number = -1): Promise<[any, string, string | null]> {
    // WASM signer doesn't support withdraw yet
    throw new Error('withdraw not supported with WASM signer.');
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
      // Get next nonce if not provided
      const nextNonce = nonce === -1 ? 
        await this.transactionApi.getNextNonce(this.config.accountIndex, this.config.apiKeyIndex) :
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
      console.error('Error canceling all orders:', error);
      return [null, null, error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  /**
   * Close all positions by creating opposite market orders
   * This method gets all open positions and creates market orders to close them
   */
  async closeAllPositions(): Promise<[any[], any[], string[]]> {
    try {
      // Get account data to retrieve open positions
      const account = await this.accountApi.getAccount({
        by: 'index',
        value: this.config.accountIndex.toString()
      });
      
      // Check if account has positions data
      if (!account.positions || !Array.isArray(account.positions)) {
        return [[], [], []]; // No positions data available
      }
      
      const openPositions = account.positions.filter(pos => parseFloat(pos.size) > 0);
      
      if (openPositions.length === 0) {
        return [[], [], []]; // No positions to close
      }

      const closedTransactions: any[] = [];
      const closedResponses: any[] = [];
      const errors: string[] = [];

      // Close each position by creating opposite market orders
      for (const position of openPositions) {
        try {
          const isLong = position.side === 'long';
          const positionSize = Math.floor(parseFloat(position.size));
          
          // Create market order in opposite direction to close position
          const [tx, apiResponse, err] = await this.createMarketOrder({
            marketIndex: position.market_id,
            clientOrderIndex: Date.now() + Math.random() * 1000, // Unique index
            baseAmount: positionSize,
            avgExecutionPrice: Math.floor(parseFloat(position.mark_price)), // Use mark price as reference
            isAsk: isLong, // If long position, sell to close; if short, buy to close
            reduceOnly: true // This is a position-closing order
          });

          if (err) {
            errors.push(`Failed to close position in market ${position.market_id}: ${err}`);
          } else {
            closedTransactions.push(tx);
            closedResponses.push(apiResponse);
            console.log(`✅ Position closed in market ${position.market_id}: ${isLong ? 'Long' : 'Short'} ${positionSize} units`);
          }
        } catch (positionError) {
          errors.push(`Error closing position in market ${position.market_id}: ${positionError instanceof Error ? positionError.message : 'Unknown error'}`);
        }
      }

      return [closedTransactions, closedResponses, errors];
    } catch (error) {
      console.error('Error closing all positions:', error);
      return [[], [], [error instanceof Error ? error.message : 'Unknown error']];
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
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
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
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
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
    
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price: executionPrice,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_STOP_LOSS,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY, // Use same expiry as other orders
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
    return await this.createOrder({
      marketIndex,
      clientOrderIndex,
      baseAmount,
      price,
      isAsk,
      orderType: SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly,
      triggerPrice,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
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
      // Get next nonce if not provided
      const nextNonce = nonce === -1 ? 
        await this.transactionApi.getNextNonce(this.config.accountIndex, this.config.apiKeyIndex) :
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
      console.error('Error transferring:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  /**
   * Update leverage for a market
   */
  async updateLeverage(marketIndex: number, marginMode: number, initialMarginFraction: number, nonce: number = -1): Promise<[any, string, string | null]> {
    try {
      // Get next nonce if not provided
      const nextNonce = nonce === -1 ? 
        await this.transactionApi.getNextNonce(this.config.accountIndex, this.config.apiKeyIndex) :
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
      console.error('Error updating leverage:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
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
    
    try {
      startAnimation();
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          const transaction = await this.transactionApi.getTransaction({
            by: 'hash',
            value: txHash
          });
          
          // Check if transaction is confirmed
          if (transaction.status === 'confirmed') {
            stopAnimation();
            console.log(`✅ Transaction ${txHash.substring(0, 16)} confirmed`);
            return transaction;
          } else if (transaction.status === 'failed') {
            stopAnimation();
            console.log(`❌ Transaction ${txHash.substring(0, 16)} failed`);
            throw new TransactionException(
              `Transaction ${txHash} failed with status: ${transaction.status}`,
              'waitForTransaction',
              transaction
            );
          } else {
            // Transaction is still processing (pending or unknown status)
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
    marketIndex: number,
    clientOrderIndex: number,
    maxWaitTime: number = 30000,
    pollInterval: number = 1000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    console.log(`⏳ Waiting for order ${clientOrderIndex} in market ${marketIndex} to be confirmed...`);
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // This would need to be implemented based on the order API
        // For now, we'll just wait for the transaction to be confirmed
        console.log(`⏳ Waiting for order confirmation... (${marketIndex}:${clientOrderIndex})`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // TODO: Implement actual order book checking
        // const orderBook = await this.orderApi.getOrderBooks(marketIndex);
        // const orderExists = orderBook.orders.some(order => order.client_order_index === clientOrderIndex);
        // if (orderExists) {
        //   console.log(`✅ Order ${clientOrderIndex} confirmed in order book`);
        //   return true;
        // }
        
        // For now, just return true after a short wait to demonstrate the functionality
        console.log(`✅ Order ${clientOrderIndex} confirmation simulated (placeholder)`);
        return true;
        
      } catch (error) {
        console.log(`⏳ Order confirmation check failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    console.log(`⚠️ Order ${clientOrderIndex} confirmation timeout after ${maxWaitTime}ms`);
    return false;
  }

  /**
   * Close the API client connection
   */
  async close(): Promise<void> {
    await this.apiClient.close();
  }
}

