import { ApiClient } from '../api/api-client';
import { TransactionApi } from '../api/transaction-api';
import { createSignerServerClient, SignerServerClient } from '../utils/signer-server';
import { WasmSignerClient, createWasmSignerClient } from '../utils/wasm-signer';
import { NodeWasmSignerClient, createNodeWasmSignerClient } from '../utils/node-wasm-signer';

export interface SignerConfig {
  url: string;
  privateKey: string;
  accountIndex: number;
  apiKeyIndex: number;
  signerServerUrl?: string; // Optional: URL of the signer server
  wasmConfig?: {
    wasmPath: string;
    wasmExecPath?: string;
  }; // Optional: WASM signer configuration
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
}

export interface CreateMarketOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  avgExecutionPrice: number;
  isAsk: boolean;
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
  private wallet: SignerServerClient | WasmSignerClient | NodeWasmSignerClient;
  private signerType: 'server' | 'wasm' | 'node-wasm';

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

  static readonly ORDER_TYPE_STOP_LOSS = 2
  static readonly ORDER_TYPE_STOP_LOSS_LIMIT = 3
  static readonly ORDER_TYPE_TAKE_PROFIT = 4
  static readonly ORDER_TYPE_TAKE_PROFIT_LIMIT = 5
  static readonly ORDER_TYPE_TWAP = 6

  static readonly ORDER_TIME_IN_FORCE_POST_ONLY = 2

  static readonly NIL_TRIGGER_PRICE = 0
  static readonly DEFAULT_28_DAY_ORDER_EXPIRY = -1
  static readonly DEFAULT_IOC_EXPIRY = 0
  static readonly DEFAULT_10_MIN_AUTH_EXPIRY = -1
  static readonly MINUTE = 60

  constructor(config: SignerConfig) {
    this.config = config;
    this.apiClient = new ApiClient({ host: config.url });
    this.transactionApi = new TransactionApi(this.apiClient);
    
    // Determine signer type and initialize accordingly
    if (config.signerServerUrl) {
      this.wallet = createSignerServerClient({ url: config.signerServerUrl });
      this.signerType = 'server';
    } else if (config.wasmConfig) {
      // Check if we're in a browser or Node.js environment
      if (typeof window !== 'undefined') {
        this.wallet = createWasmSignerClient(config.wasmConfig);
        this.signerType = 'wasm';
      } else {
        this.wallet = createNodeWasmSignerClient(config.wasmConfig);
        this.signerType = 'node-wasm';
      }
    } else {
      throw new Error('Either signerServerUrl or wasmConfig must be provided.');
    }
  }

  /**
   * Initialize the signer (required for WASM signers)
   */
  async initialize(): Promise<void> {
    if (this.signerType === 'wasm' || this.signerType === 'node-wasm') {
      await (this.wallet as WasmSignerClient | NodeWasmSignerClient).initialize();
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
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

      // Handle order expiry - use real timestamp for GTT orders (milliseconds)
      const orderExpiry = params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY;

      if (this.signerType === 'server') {
        // Use server signer
        const orderTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          MarketIndex: params.marketIndex,
          ClientOrderIndex: params.clientOrderIndex,
          BaseAmount: params.baseAmount,
          Price: params.price,
          IsAsk: params.isAsk ? 1 : 0,
          Type: params.orderType,
          TimeInForce: params.timeInForce,
          ReduceOnly: params.reduceOnly ? 1 : 0,
          TriggerPrice: params.triggerPrice,
          Nonce: nextNonce.nonce
        };

        if (orderExpiry !== SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY) {
          orderTx.OrderExpiry = orderExpiry;
          orderTx.ExpiredAt = orderExpiry;
        }

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, orderTx);
        const txInfo = { ...orderTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CREATE_ORDER, JSON.stringify(txInfo));
        return [orderTx, txHash.hash, null];
      } else {
        // Use WASM signer
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
          orderExpiry: orderExpiry,
          nonce: nextNonce.nonce
        };

        const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCreateOrder(wasmParams);
        const txInfo = JSON.parse(txInfoStr);
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CREATE_ORDER, txInfoStr);
        return [txInfo, txHash.hash, null];
      }
    } catch (error) {
      console.error('Error creating order:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async createMarketOrder(params: CreateMarketOrderParams): Promise<[any, string, string | null]> {
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

      if (this.signerType === 'server') {
        // Use server signer
        const orderTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          MarketIndex: params.marketIndex,
          ClientOrderIndex: params.clientOrderIndex,
          BaseAmount: params.baseAmount,
          Price: params.avgExecutionPrice,
          IsAsk: params.isAsk ? 1 : 0,
          Type: SignerClient.ORDER_TYPE_MARKET,
          TimeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          ReduceOnly: 0,
          TriggerPrice: SignerClient.NIL_TRIGGER_PRICE,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, orderTx);
        const txInfo = { ...orderTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CREATE_ORDER, JSON.stringify(txInfo));
        return [orderTx, txHash.hash, null];
      } else {
        // Use WASM signer
        const wasmParams = {
          marketIndex: params.marketIndex,
          clientOrderIndex: params.clientOrderIndex,
          baseAmount: params.baseAmount,
          price: params.avgExecutionPrice,
          isAsk: params.isAsk ? 1 : 0,
          orderType: SignerClient.ORDER_TYPE_MARKET,
          timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          reduceOnly: 0,
          triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
          orderExpiry: SignerClient.DEFAULT_IOC_EXPIRY,
          nonce: nextNonce.nonce
        };

        const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCreateOrder(wasmParams);
        const txInfo = JSON.parse(txInfoStr);
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CREATE_ORDER, txInfoStr);
        return [txInfo, txHash.hash, null];
      }
    } catch (error) {
      console.error('Error creating market order:', error);
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

      if (this.signerType === 'server') {
        // Use server signer
        const cancelTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          MarketIndex: params.marketIndex,
          Index: params.orderIndex,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, cancelTx);
        const txInfo = { ...cancelTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CANCEL_ORDER, JSON.stringify(txInfo));
        return [cancelTx, txHash.hash, null];
      } else {
        // Use WASM signer
        const wasmParams = {
          marketIndex: params.marketIndex,
          orderIndex: params.orderIndex,
          nonce: nextNonce.nonce
        };

        const txInfoStr = await (this.wallet as WasmSignerClient | NodeWasmSignerClient).signCancelOrder(wasmParams);
        const txInfo = JSON.parse(txInfoStr);
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CANCEL_ORDER, txInfoStr);
        return [txInfo, txHash.hash, null];
      }
    } catch (error) {
      console.error('Error canceling order:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async changeApiKey(params: ChangeApiKeyParams): Promise<[any, string, string | null]> {
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

      if (this.signerType === 'server') {
        // Use server signer
        const changeTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          PubKey: params.newPubkey,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, changeTx);
        const txInfo = { ...changeTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CHANGE_PUB_KEY, JSON.stringify(txInfo));
        return [changeTx, txHash.hash, null];
      } else {
        // WASM signer doesn't support changeApiKey yet
        throw new Error('changeApiKey not supported with WASM signer. Use signer server instead.');
      }
    } catch (error) {
      console.error('Error changing API key:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async createAuthTokenWithExpiry(expirySeconds: number = SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY): Promise<string> {
    try {
      if (this.signerType === 'server') {
        // Server signer doesn't have this method, return empty string
        return '';
      } else {
        // Use WASM signer
        const deadline = expirySeconds === SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY ? 
          undefined : Math.floor(Date.now() / 1000) + expirySeconds;
        return await (this.wallet as WasmSignerClient | NodeWasmSignerClient).createAuthToken(deadline);
      }
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
      if (this.signerType === 'server') {
        throw new Error('generateAPIKey not supported with server signer. Use WASM signer instead.');
      } else {
        return await (this.wallet as WasmSignerClient | NodeWasmSignerClient).generateAPIKey(seed);
      }
    } catch (error) {
      console.error('Error generating API key:', error);
      return null;
    }
  }

  /**
   * Withdraw USDC from account
   */
  async withdraw(usdcAmount: number, nonce: number = -1): Promise<[any, string, string | null]> {
    try {
      // Get next nonce if not provided
      const nextNonce = nonce === -1 ? 
        await this.transactionApi.getNextNonce(this.config.accountIndex, this.config.apiKeyIndex) :
        { nonce };

      const scaledAmount = Math.floor(usdcAmount * SignerClient.USDC_TICKER_SCALE);

      if (this.signerType === 'server') {
        // Use server signer
        const withdrawTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          Amount: scaledAmount,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, withdrawTx);
        const txInfo = { ...withdrawTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_WITHDRAW, JSON.stringify(txInfo));
        return [withdrawTx, txHash.hash, null];
      } else {
        // WASM signer doesn't support withdraw yet
        throw new Error('withdraw not supported with WASM signer. Use signer server instead.');
      }
    } catch (error) {
      console.error('Error withdrawing:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  /**
   * Create a sub account
   */
  async createSubAccount(nonce: number = -1): Promise<[any, string | null]> {
    try {
      // Get next nonce if not provided
      const nextNonce = nonce === -1 ? 
        await this.transactionApi.getNextNonce(this.config.accountIndex, this.config.apiKeyIndex) :
        { nonce };

      if (this.signerType === 'server') {
        // Use server signer
        const createSubAccountTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, createSubAccountTx);
        const txInfo = { ...createSubAccountTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CREATE_SUB_ACCOUNT, JSON.stringify(txInfo));
        return [txHash.hash, null];
      } else {
        // WASM signer doesn't support createSubAccount yet
        throw new Error('createSubAccount not supported with WASM signer. Use signer server instead.');
      }
    } catch (error) {
      console.error('Error creating sub account:', error);
      return [null, error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  /**
   * Cancel all orders
   */
  async cancelAllOrders(timeInForce: number, time: number, nonce: number = -1): Promise<[any, string | null]> {
    try {
      // Get next nonce if not provided
      const nextNonce = nonce === -1 ? 
        await this.transactionApi.getNextNonce(this.config.accountIndex, this.config.apiKeyIndex) :
        { nonce };

      if (this.signerType === 'server') {
        // Use server signer
        const cancelAllTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          TimeInForce: timeInForce,
          Time: time,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, cancelAllTx);
        const txInfo = { ...cancelAllTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_CANCEL_ALL_ORDERS, JSON.stringify(txInfo));
        return [txHash.hash, null];
      } else {
        // WASM signer doesn't support cancelAllOrders yet
        throw new Error('cancelAllOrders not supported with WASM signer. Use signer server instead.');
      }
    } catch (error) {
      console.error('Error canceling all orders:', error);
      return [null, error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(
    marketIndex: number, 
    orderIndex: number, 
    baseAmount: number, 
    price: number, 
    triggerPrice: number, 
    nonce: number = -1
  ): Promise<[any, string, string | null]> {
    try {
      // Get next nonce if not provided
      const nextNonce = nonce === -1 ? 
        await this.transactionApi.getNextNonce(this.config.accountIndex, this.config.apiKeyIndex) :
        { nonce };

      if (this.signerType === 'server') {
        // Use server signer
        const modifyTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          MarketIndex: marketIndex,
          OrderIndex: orderIndex,
          BaseAmount: baseAmount,
          Price: price,
          TriggerPrice: triggerPrice,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, modifyTx);
        const txInfo = { ...modifyTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_MODIFY_ORDER, JSON.stringify(txInfo));
        return [modifyTx, txHash.hash, null];
      } else {
        // WASM signer doesn't support modifyOrder yet
        throw new Error('modifyOrder not supported with WASM signer. Use signer server instead.');
      }
    } catch (error) {
      console.error('Error modifying order:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
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

      if (this.signerType === 'server') {
        // Use server signer
        const transferTx: any = {
          AccountIndex: this.config.accountIndex,
          ApiKeyIndex: this.config.apiKeyIndex,
          ToAccountIndex: toAccountIndex,
          Amount: scaledAmount,
          Nonce: nextNonce.nonce
        };

        const signature = await (this.wallet as SignerServerClient).signTransaction(this.config.privateKey, transferTx);
        const txInfo = { ...transferTx, Sig: signature };
        const txHash = await this.transactionApi.sendTx(SignerClient.TX_TYPE_TRANSFER, JSON.stringify(txInfo));
        return [transferTx, txHash.hash, null];
      } else {
        // WASM signer doesn't support transfer yet
        throw new Error('transfer not supported with WASM signer. Use signer server instead.');
      }
    } catch (error) {
      console.error('Error transferring:', error);
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  /**
   * Close the API client connection
   */
  async close(): Promise<void> {
    await this.apiClient.close();
  }
}

