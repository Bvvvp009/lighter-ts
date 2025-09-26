import { ApiClient } from '../api/api-client';
import { TransactionApi } from '../api/transaction-api';
import { createSignerServerClient, SignerServerClient } from '../utils/signer-server';

export interface SignerConfig {
  url: string;
  privateKey: string;
  accountIndex: number;
  apiKeyIndex: number;
  signerServerUrl?: string; // Optional: URL of the signer server
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
  private wallet: SignerServerClient;

  // Constants from Python SDK
  static readonly ORDER_TYPE_LIMIT = 0;
  static readonly ORDER_TYPE_MARKET = 1;
  static readonly ORDER_TIME_IN_FORCE_GOOD_TILL_TIME = 1;
  static readonly ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 0;
  static readonly ORDER_TIME_IN_FORCE_FILL_OR_KILL = 2;
  //static readonly DEFAULT_10_MIN_AUTH_EXPIRY = 600;
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

 // static readonly ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 0
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
    
    // Use signer server if URL is provided, otherwise fall back to local signer
    if (config.signerServerUrl) {
      this.wallet = createSignerServerClient({ url: config.signerServerUrl });
    } else {
      throw new Error('Signer server URL is required. Please provide signerServerUrl in config.');
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

      // Create order transaction structure - using correct field names from dashboard
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

      // Handle order expiry - use real timestamp for GTT orders (milliseconds)
      const orderExpiry = params.orderExpiry ?? SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY;
      if (orderExpiry !== SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY) {
        orderTx.OrderExpiry = orderExpiry;
        orderTx.ExpiredAt = orderExpiry;
      }

      console.log('Order transaction structure:', JSON.stringify(orderTx, null, 2));

      // Sign the transaction
      const signature = await this.signTransaction(orderTx);
      
      // Create the final transaction info with signature
      const txInfo = {
        ...orderTx,
        Sig: signature,
      };

      // Send transaction using the correct API
      const txHash = await this.transactionApi.sendTx(
        SignerClient.TX_TYPE_CREATE_ORDER,
        JSON.stringify(txInfo)
      );

      return [orderTx, txHash.hash || '', null];
    } catch (error) {
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async createMarketOrder(params: CreateMarketOrderParams): Promise<any> {
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

      // Create market order transaction structure
      const orderTx = {
        AccountIndex: this.config.accountIndex,
        OrderBookIndex: params.marketIndex,
        ClientOrderIndex: params.clientOrderIndex,
        BaseAmount: params.baseAmount,
        Price: params.avgExecutionPrice,
        IsAsk: params.isAsk ? 1 : 0,
        OrderType: SignerClient.ORDER_TYPE_MARKET,
        TimeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        ReduceOnly: 0,
        TriggerPrice: 0,
        Nonce: nextNonce.nonce,
        OrderExpiry: 1000000,
      };

      // Sign the transaction
      const signature = await this.signTransaction(orderTx);
      
      // Create the final transaction info with signature
      const txInfo = {
        ...orderTx,
        Sig: signature,
      };

      // Send transaction using the correct API
      const txHash = await this.transactionApi.sendTx(
        SignerClient.TX_TYPE_CREATE_ORDER,
        JSON.stringify(txInfo)
      );

      return txHash;
    } catch (error) {
      throw error;
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<[any, string, string | null]> {
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

      // Create cancel order transaction structure - using correct field names
      const cancelTx = {
        AccountIndex: this.config.accountIndex,
        ApiKeyIndex: this.config.apiKeyIndex,
        MarketIndex: params.marketIndex,
        OrderIndex: params.orderIndex,
        Nonce: nextNonce.nonce,
      };

      // Sign the transaction
      const signature = await this.signTransaction(cancelTx);
      
      // Create the final transaction info with signature
      const txInfo = {
        ...cancelTx,
        Sig: signature,
      };

      // Send transaction using the correct API
      const txHash = await this.transactionApi.sendTx(
        SignerClient.TX_TYPE_CANCEL_ORDER,
        JSON.stringify(txInfo)
      );

      return [cancelTx, txHash.hash || '', null];
    } catch (error) {
      return [null, '', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async changeApiKey(params: ChangeApiKeyParams): Promise<[any, string | null]> {
    try {
      // Get next nonce
      const nextNonce = await this.transactionApi.getNextNonce(
        this.config.accountIndex,
        this.config.apiKeyIndex
      );

      // Create change API key transaction
      const changeTx = {
        eth_private_key: params.ethPrivateKey,
        new_pubkey: params.newPubkey,
        nonce: nextNonce.nonce,
      };

      // Sign the transaction
      const signature = await this.signTransaction(changeTx);
      
      // Send transaction
      const txHash = await this.transactionApi.sendTransaction({
        account_index: this.config.accountIndex,
        api_key_index: this.config.apiKeyIndex,
        transaction: signature,
      });

      return [txHash, null];
    } catch (error) {
      return [null, error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  async createAuthTokenWithExpiry(expiry: number): Promise<[string, string | null]> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `${this.config.accountIndex}:${this.config.apiKeyIndex}:${timestamp + expiry}`;
      
      // Sign the message using the signer server
      const signature = await this.wallet.signTransaction(this.config.privateKey, { message });
      
      return [signature, null];
    } catch (error) {
      return ['', error instanceof Error ? error.message : 'Unknown error'];
    }
  }

  private async signTransaction(transaction: any): Promise<string> {
    // Use the signer server to sign the transaction
    return await this.wallet.signTransaction(this.config.privateKey, transaction);
  }

  async close(): Promise<void> {
    await this.apiClient.close();
  }
} 