/**
 * Unified WASM Signer Client for Lighter Protocol
 * 
 * This module provides a TypeScript wrapper for the Go WASM signer,
 * enabling cryptographic operations in both browser and Node.js environments.
 * Automatically detects the environment and uses the appropriate initialization method.
 */

import * as fs from 'fs';

export interface WasmSignerConfig {
  wasmPath?: string; // Path to the WASM binary (optional; defaults to bundled)
  wasmExecPath?: string; // Path to wasm_exec.js (optional, defaults to bundled)
}

export interface ApiKeyPair {
  privateKey: string;
  publicKey: string;
}

export interface CreateClientParams {
  url: string;
  privateKey: string;
  chainId: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface CreateOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  price: number;
  isAsk: number;
  orderType: number;
  timeInForce: number;
  reduceOnly: number;
  triggerPrice: number;
  orderExpiry: number;
  nonce: number;
  apiKeyIndex?: number;
  accountIndex?: number;
}

export interface CancelOrderParams {
  marketIndex: number;
  orderIndex: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface CancelAllOrdersParams {
  timeInForce: number;
  time: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface TransferParams {
  toAccountIndex: number;
  usdcAmount: number;
  fee: number;
  memo: string;
  ethPrivateKey: string;
  nonce?: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface UpdateLeverageParams {
  marketIndex: number;
  fraction: number;
  marginMode: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface WithdrawParams {
  usdcAmount: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface ModifyOrderParams {
  marketIndex: number;
  index: number;
  baseAmount: number;
  price: number;
  triggerPrice: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface UpdateMarginParams {
  marketIndex: number;
  usdcAmount: number;
  direction: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface CreateSubAccountParams {
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface CreatePublicPoolParams {
  operatorFee: number;
  initialTotalShares: number;
  minOperatorShareRate: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface UpdatePublicPoolParams {
  publicPoolIndex: number;
  status: number;
  operatorFee: number;
  minOperatorShareRate: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface MintSharesParams {
  publicPoolIndex: number;
  shareAmount: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface BurnSharesParams {
  publicPoolIndex: number;
  shareAmount: number;
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface CreateGroupedOrderParams {
  marketIndex: number;
  clientOrderIndex: number;  // Must be 0 for grouped orders
  baseAmount: number;
  price: number;
  isAsk: number;
  orderType: number;
  timeInForce: number;
  reduceOnly: number;
  triggerPrice: number;
  orderExpiry: number;
}

export interface CreateGroupedOrdersParams {
  groupingType: number;  // 1=OTO, 2=OCO, 3=OTOCO
  orders: CreateGroupedOrderParams[];
  nonce: number;
  apiKeyIndex: number;
  accountIndex: number;
}

export interface WasmSignerResponse<T = any> {
  success?: boolean;
  error?: string;
  data?: T;
}

/**
 * Composite transaction response from WASM signer
 * Includes all transaction details in a standardized format
 */
export interface WasmTxResponse {
  /** Transaction type (e.g., 14 for CREATE_ORDER) */
  txType: number;
  /** Transaction info as JSON string */
  txInfo: string;
  /** Transaction hash */
  txHash: string;
  /** Message to sign for L1 signature (only for ChangePubKey and Transfer) */
  messageToSign?: string;
  /** Error message if signing failed */
  error?: string;
}

// ============================================================================
// WASM Manager (Singleton Pattern)
// ============================================================================
export interface WasmConfig {
  wasmPath: string;
  wasmExecPath?: string;
}

export type WasmClientType = 'browser' | 'node';

export class WasmManager {
  private static instance: WasmManager | null = null;
  private wasmClient: WasmSignerClient | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private config: WasmConfig | null = null;

  private constructor() {}

  static getInstance(): WasmManager {
    if (!WasmManager.instance) {
      WasmManager.instance = new WasmManager();
    }
    return WasmManager.instance;
  }

  async initialize(config: WasmConfig, clientType: WasmClientType = 'node'): Promise<void> {
    if (this.isInitialized && this.wasmClient) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize(config, clientType);
    
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async doInitialize(config: WasmConfig, clientType: WasmClientType): Promise<void> {
    try {
      this.config = config;

      if (clientType === 'browser' && typeof window !== 'undefined') {
        this.wasmClient = createWasmSignerClient(config);
      } else {
        this.wasmClient = createWasmSignerClient(config);
      }

      // Initialize the WASM client
      await (this.wasmClient as any).initialize();

      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  getWasmClient(): WasmSignerClient {
    if (!this.isInitialized || !this.wasmClient) {
      throw new Error('WASM client not initialized. Call initialize() first.');
    }
    return this.wasmClient;
  }

  isReady(): boolean {
    return this.isInitialized && this.wasmClient !== null;
  }

  async ensureReady(): Promise<void> {
    if (!this.isReady()) {
      if (!this.config) {
        throw new Error('WASM manager not configured. Call initialize() first.');
      }
      await this.initialize(this.config);
    }
  }

  // Pre-initialize with default config for faster startup
  static async preInitialize(config: WasmConfig, clientType: WasmClientType = 'node'): Promise<void> {
    const manager = WasmManager.getInstance();
    await manager.initialize(config, clientType);
  }

  // Get initialization status for monitoring
  getStatus(): {
    isInitialized: boolean;
    hasClient: boolean;
    config: WasmConfig | null;
  } {
    return {
      isInitialized: this.isInitialized,
      hasClient: this.wasmClient !== null,
      config: this.config
    };
  }

  // Cleanup method
  destroy(): void {
    if (this.wasmClient) {
      // Call cleanup method if available
      if (typeof (this.wasmClient as any).destroy === 'function') {
        (this.wasmClient as any).destroy();
      }
      this.wasmClient = null;
    }
    this.isInitialized = false;
    this.config = null;
    WasmManager.instance = null;
  }

  // Reset instance for testing
  static reset(): void {
    if (WasmManager.instance) {
      WasmManager.instance.destroy();
    }
    WasmManager.instance = null;
  }
}

export class WasmSignerClient {
  private wasmModule: any = null;
  // @ts-ignore - Keep reference to prevent GC even though not directly accessed
  private wasmInstance: any = null;
  private isInitialized = false;
  private config: WasmSignerConfig;
  private isBrowser = typeof window !== 'undefined';

  constructor(config: WasmSignerConfig) {
    this.config = config;
  }

  /**
   * Initialize the WASM module (unified for both browser and Node.js)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (this.isBrowser) {
        await this.initializeBrowser();
      } else {
        await this.initializeNode();
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize WASM signer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Browser-specific initialization
   */
  private async initializeBrowser(): Promise<void> {
    // Load the Go WASM runtime
    const wasmExecPath = this.config.wasmExecPath || this.config.wasmPath?.replace('.wasm', '_exec.js') || 'wasm/wasm_exec.js';
    await this.loadScript(wasmExecPath);

    // Load the WASM binary
    const wasmPath = this.config.wasmPath || 'wasm/lighter-signer.wasm';
    const wasmBytes = await this.loadWasmBinary(wasmPath);
    
    // Initialize the WASM runtime
    const Go = (window as any).Go;
    const go = new Go();
    
    const result = await WebAssembly.instantiate(wasmBytes, go.importObject);
    
    // Run the WASM module
    go.run(result.instance);
    
    // Wait for functions to be registered
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Access the functions
    this.wasmModule = {
      generateAPIKey: (window as any).GenerateAPIKey || (window as any).generateAPIKey,
      // Note: GetPublicKey is not exported from lighter-go WASM - use GenerateAPIKey instead
      getPublicKey: (window as any).GetPublicKey || (window as any).getPublicKey || undefined,
      createClient: (window as any).CreateClient || (window as any).createClient,
      signChangePubKey: (window as any).SignChangePubKey || (window as any).signChangePubKey,
      signCreateOrder: (window as any).SignCreateOrder || (window as any).signCreateOrder,
      signCancelOrder: (window as any).SignCancelOrder || (window as any).signCancelOrder,
      signCancelAllOrders: (window as any).SignCancelAllOrders || (window as any).signCancelAllOrders,
      signTransfer: (window as any).SignTransfer || (window as any).signTransfer,
      signWithdraw: (window as any).SignWithdraw || (window as any).signWithdraw,
      signUpdateLeverage: (window as any).SignUpdateLeverage || (window as any).signUpdateLeverage,
      createAuthToken: (window as any).CreateAuthToken || (window as any).createAuthToken,
      checkClient: (window as any).CheckClient || (window as any).checkClient,
      // All transaction signing functions from lighter-go WASM
      signModifyOrder: (window as any).SignModifyOrder || (window as any).signModifyOrder,
      signUpdateMargin: (window as any).SignUpdateMargin || (window as any).signUpdateMargin,
      signCreateSubAccount: (window as any).SignCreateSubAccount || (window as any).signCreateSubAccount,
      signCreatePublicPool: (window as any).SignCreatePublicPool || (window as any).signCreatePublicPool,
      signUpdatePublicPool: (window as any).SignUpdatePublicPool || (window as any).signUpdatePublicPool,
      signMintShares: (window as any).SignMintShares || (window as any).signMintShares,
      signBurnShares: (window as any).SignBurnShares || (window as any).signBurnShares,
      signCreateGroupedOrders: (window as any).SignCreateGroupedOrders || (window as any).signCreateGroupedOrders,
      // Note: SwitchAPIKey is not exported from lighter-go WASM - use CreateClient with different apiKeyIndex instead
      switchAPIKey: (window as any).SwitchAPIKey || (window as any).switchAPIKey || undefined,
    };

    // Verify that the functions are available
    if (!this.wasmModule.generateAPIKey) {
      throw new Error('WASM functions not properly registered');
    }
  }

  /**
   * Node.js-specific initialization
   */
  private async initializeNode(): Promise<void> {
    // Resolve WASM paths relative to package root if they're relative paths
    const resolvedWasmPath = this.resolveWasmPath(this.config.wasmPath || 'wasm/lighter-signer.wasm');
    let wasmExecPath = this.config.wasmExecPath;

    // Use bundled wasm_exec.js directly (no need for Go runtime)
    if (!wasmExecPath) {
      const bundledPath = this.resolveWasmPath('wasm/wasm_exec.js');
      if (fs.existsSync(bundledPath)) {
        wasmExecPath = bundledPath;
      } else {
        throw new Error('Bundled wasm_exec.js not found. Please ensure wasm/wasm_exec.js exists.');
      }
    } else {
      wasmExecPath = this.resolveWasmPath(wasmExecPath);
    }

    if (!wasmExecPath) {
      throw new Error('Unable to locate wasm_exec runtime. Bundled files not found and Go not installed. Please ensure wasm/wasm_exec.js exists in the package.');
    }

    await this.loadWasmExec(wasmExecPath);

    // Load the WASM binary
    const wasmBytes = await this.loadWasmBinary(resolvedWasmPath);
    
    // Initialize the WASM runtime
    const Go = (global as any).Go;
    const go = new Go();
    
    // Build a compatible import object for both 'go' and 'gojs' module names
    const baseImport = go.importObject as any;
    const goModule = baseImport.go || baseImport.gojs;
    // Ensure aliases expected by our WASM are present
    if (goModule && !goModule['syscall/js.copyBytesToGo'] && goModule['syscall/js.valueCopyBytesToGo']) {
      goModule['syscall/js.copyBytesToGo'] = goModule['syscall/js.valueCopyBytesToGo'];
    }
    if (goModule && !goModule['syscall/js.copyBytesToJS'] && goModule['syscall/js.valueCopyBytesToJS']) {
      goModule['syscall/js.copyBytesToJS'] = goModule['syscall/js.valueCopyBytesToJS'];
    }
    const compatImportObject = {
      ...baseImport,
      go: goModule,
      gojs: goModule,
    } as any;

    const result = await WebAssembly.instantiate(wasmBytes, compatImportObject);
    
    // Set up the WASM runtime environment before running
    // Only pass essential environment variables to avoid exceeding WASM limits
    const essentialEnvVars: Record<string, string> = {
      TMPDIR: require('os').tmpdir(),
      HOME: process.env['HOME'] || '',
      PATH: process.env['PATH'] || '',
      // Add any specific vars your signer needs here
    };
    go.env = essentialEnvVars;
    // Limit argv to avoid exceeding length limits
    go.argv = ['js']; // Minimal argv
    go.exit = process.exit;
    
    // Minimal globals (official runtime sets most as needed)
    (global as any).process = process;
    (global as any).console = console;
    (global as any).Buffer = Buffer;
    
    // Keep a reference to the instance to prevent garbage collection
    this.wasmInstance = result.instance;
    // Also store globally to prevent GC
    (global as any).wasmInstance = result.instance;
    // Store the memory buffer globally to prevent detachment
    (global as any).wasmMemory = result.instance.exports['mem'];
    
    // Run the WASM module using the standard runtime approach
    try {
      go.run(result.instance);
    } catch (runError) {
      throw new Error(`WASM runtime failed: ${runError instanceof Error ? runError.message : String(runError)}`);
    }

    // Wait for functions to be registered
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Try multiple ways to access the functions (Go exports are capitalized)
    // Note: lighter-go WASM exports all functions with capitalized names
    this.wasmModule = {
      generateAPIKey: (global as any).GenerateAPIKey || (global as any).generateAPIKey || (global as any).lighterWasmFunctions?.generateAPIKey,
      // Note: GetPublicKey is not exported from lighter-go WASM - use GenerateAPIKey instead
      getPublicKey: (global as any).GetPublicKey || (global as any).getPublicKey || (global as any).lighterWasmFunctions?.getPublicKey || undefined,
      createClient: (global as any).CreateClient || (global as any).createClient || (global as any).lighterWasmFunctions?.createClient,
      signChangePubKey: (global as any).SignChangePubKey || (global as any).signChangePubKey || (global as any).lighterWasmFunctions?.signChangePubKey,
      signCreateOrder: (global as any).SignCreateOrder || (global as any).signCreateOrder || (global as any).lighterWasmFunctions?.signCreateOrder,
      signCancelOrder: (global as any).SignCancelOrder || (global as any).signCancelOrder || (global as any).lighterWasmFunctions?.signCancelOrder,
      signCancelAllOrders: (global as any).SignCancelAllOrders || (global as any).signCancelAllOrders || (global as any).lighterWasmFunctions?.signCancelAllOrders,
      signTransfer: (global as any).SignTransfer || (global as any).signTransfer || (global as any).lighterWasmFunctions?.signTransfer,
      signWithdraw: (global as any).SignWithdraw || (global as any).signWithdraw || (global as any).lighterWasmFunctions?.signWithdraw,
      signUpdateLeverage: (global as any).SignUpdateLeverage || (global as any).signUpdateLeverage || (global as any).lighterWasmFunctions?.signUpdateLeverage,
      createAuthToken: (global as any).CreateAuthToken || (global as any).createAuthToken || (global as any).lighterWasmFunctions?.createAuthToken,
      checkClient: (global as any).CheckClient || (global as any).checkClient || (global as any).lighterWasmFunctions?.checkClient,
      // All transaction signing functions from lighter-go WASM
      signModifyOrder: (global as any).SignModifyOrder || (global as any).signModifyOrder || (global as any).lighterWasmFunctions?.signModifyOrder,
      signUpdateMargin: (global as any).SignUpdateMargin || (global as any).signUpdateMargin || (global as any).lighterWasmFunctions?.signUpdateMargin,
      signCreateSubAccount: (global as any).SignCreateSubAccount || (global as any).signCreateSubAccount || (global as any).lighterWasmFunctions?.signCreateSubAccount,
      signCreatePublicPool: (global as any).SignCreatePublicPool || (global as any).signCreatePublicPool || (global as any).lighterWasmFunctions?.signCreatePublicPool,
      signUpdatePublicPool: (global as any).SignUpdatePublicPool || (global as any).signUpdatePublicPool || (global as any).lighterWasmFunctions?.signUpdatePublicPool,
      signMintShares: (global as any).SignMintShares || (global as any).signMintShares || (global as any).lighterWasmFunctions?.signMintShares,
      signBurnShares: (global as any).SignBurnShares || (global as any).signBurnShares || (global as any).lighterWasmFunctions?.signBurnShares,
      signCreateGroupedOrders: (global as any).SignCreateGroupedOrders || (global as any).signCreateGroupedOrders || (global as any).lighterWasmFunctions?.signCreateGroupedOrders,
      // Note: SwitchAPIKey is not exported from lighter-go WASM - use CreateClient with different apiKeyIndex instead
      switchAPIKey: (global as any).SwitchAPIKey || (global as any).switchAPIKey || (global as any).lighterWasmFunctions?.switchAPIKey || undefined,
    };

    // Verify that the functions are available
    if (!this.wasmModule.generateAPIKey) {
      throw new Error('WASM functions not properly registered');
    }
  }

  /**
   * Generate a new API key pair
   */
  async generateAPIKey(seed?: string): Promise<ApiKeyPair> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.generateAPIKey(seed);
    if (result.error) {
      throw new Error(`Failed to generate API key: ${result.error}`);
    }
    
    return {
      privateKey: result.privateKey,
      publicKey: result.publicKey,
    };
  }

  /**
   * Get public key from private key
   * Note: This function is not exported from lighter-go WASM.
   * Use generateAPIKey() instead, which returns both private and public keys.
   * This method is kept for backward compatibility but will throw if GetPublicKey is not available.
   */
  async getPublicKey(privateKey: string): Promise<string> {
    await this.ensureInitialized();
    
    // Check if GetPublicKey is available (it's not in lighter-go WASM)
    if (!this.wasmModule.getPublicKey) {
      // Fallback: Use GenerateAPIKey with the private key as seed
      // Note: This is a workaround - GenerateAPIKey expects a seed, not a private key
      throw new Error('GetPublicKey is not available in lighter-go WASM. Use generateAPIKey() instead, which returns both keys.');
    }
    
    const result = this.wasmModule.getPublicKey(privateKey);
    
    if (result && result.error) {
      throw new Error(`Failed to get public key: ${result.error}`);
    }
    
    return result.publicKey;
  }

  /**
   * Sign a ChangePubKey transaction
   * Returns composite response with txType, txInfo, txHash, messageToSign
   */
  async signChangePubKey(params: {
    pubkey: string;
    nonce: number;
    apiKeyIndex: number;
    accountIndex: number;
  }): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signChangePubKey(
      params.pubkey,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 8, // Default to CHANGE_PUB_KEY
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign // ChangePubKey requires L1 signature
    };
  }

  /**
   * Create a client for signing transactions
   */
  async createClient(params: CreateClientParams): Promise<void> {
    await this.ensureInitialized();
    
    // CreateClient expects: url, privateKey, chainId, apiKeyIndex, accountIndex
    const result = this.wasmModule.createClient(
      params.url,
      params.privateKey,
      params.chainId,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      throw new Error(`Failed to create client: ${result.error}`);
    }
  }

  /**
   * Sign a create order transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signCreateOrder(params: CreateOrderParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    // Use provided values or default to 0 if not provided
    const apiKeyIndex = params.apiKeyIndex ?? 0;
    const accountIndex = params.accountIndex ?? 0;
    
    const result = this.wasmModule.signCreateOrder(
      params.marketIndex,
      params.clientOrderIndex,
      params.baseAmount,
      params.price,
      params.isAsk,
      params.orderType,
      params.timeInForce,
      params.reduceOnly,
      params.triggerPrice,
      params.orderExpiry,
      params.nonce,
      apiKeyIndex,
      accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 14, // Default to CREATE_ORDER
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign a cancel order transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signCancelOrder(params: CancelOrderParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signCancelOrder(
      params.marketIndex,
      params.orderIndex,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 15, // Default to CANCEL_ORDER
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Create an authentication token
   */
  async createAuthToken(deadline: number, apiKeyIndex: number, accountIndex: number): Promise<string> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.createAuthToken(deadline, apiKeyIndex, accountIndex);
    
    if (result.error) {
      throw new Error(`Failed to create auth token: ${result.error}`);
    }
    
    return result.authToken;
  }

  /**
   * Sign a cancel all orders transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signCancelAllOrders(params: CancelAllOrdersParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signCancelAllOrders(
      params.timeInForce,
      params.time,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 16, // Default to CANCEL_ALL_ORDERS
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign a transfer transaction
   * Returns composite response with txType, txInfo, txHash, messageToSign
   */
  async signTransfer(params: TransferParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signTransfer(
      params.toAccountIndex,
      params.usdcAmount,
      params.fee,
      params.memo,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 12, // Default to TRANSFER
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign // Transfer requires L1 signature
    };
  }

  /**
   * Sign a withdraw transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signWithdraw(params: WithdrawParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signWithdraw(
      params.usdcAmount,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 13, // Default to WITHDRAW
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign an update leverage transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signUpdateLeverage(params: UpdateLeverageParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signUpdateLeverage(
      params.marketIndex,
      params.fraction,
      params.marginMode,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 20, // Default to UPDATE_LEVERAGE
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign a modify order transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signModifyOrder(params: ModifyOrderParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signModifyOrder(
      params.marketIndex,
      params.index,
      params.baseAmount,
      params.price,
      params.triggerPrice,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 17, // Default to MODIFY_ORDER
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign an update margin transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signUpdateMargin(params: UpdateMarginParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signUpdateMargin(
      params.marketIndex,
      params.usdcAmount,
      params.direction,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 29, // Default to UPDATE_MARGIN
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign a create sub account transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signCreateSubAccount(params: CreateSubAccountParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signCreateSubAccount(
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 9, // Default to CREATE_SUB_ACCOUNT
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign a create public pool transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signCreatePublicPool(params: CreatePublicPoolParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signCreatePublicPool(
      params.operatorFee,
      params.initialTotalShares,
      params.minOperatorShareRate,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 10, // Default to CREATE_PUBLIC_POOL
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign an update public pool transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signUpdatePublicPool(params: UpdatePublicPoolParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signUpdatePublicPool(
      params.publicPoolIndex,
      params.status,
      params.operatorFee,
      params.minOperatorShareRate,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 11, // Default to UPDATE_PUBLIC_POOL
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign a mint shares transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signMintShares(params: MintSharesParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signMintShares(
      params.publicPoolIndex,
      params.shareAmount,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 18, // Default to MINT_SHARES
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Sign a burn shares transaction
   * Returns composite response with txType, txInfo, txHash
   */
  async signBurnShares(params: BurnSharesParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signBurnShares(
      params.publicPoolIndex,
      params.shareAmount,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 19, // Default to BURN_SHARES
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  /**
   * Switch active API key
   * Note: This function is not exported from lighter-go WASM.
   * In lighter-go, multiple API keys are managed via CreateClient with different apiKeyIndex values.
   * This method is kept for backward compatibility but will throw if SwitchAPIKey is not available.
   * 
   * To use multiple API keys with lighter-go:
   * 1. Call createClient() with different apiKeyIndex values
   * 2. The signer functions accept apiKeyIndex and accountIndex parameters
   * 3. lighter-go automatically routes to the correct client based on these indices
   */
  async switchAPIKey(apiKeyIndex: number): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.wasmModule.switchAPIKey) {
      throw new Error(
        'SwitchAPIKey is not available in lighter-go WASM. ' +
        'Use createClient() with different apiKeyIndex values instead. ' +
        'The signer functions accept apiKeyIndex and accountIndex parameters to select the correct client.'
      );
    }
    
    const result = this.wasmModule.switchAPIKey(apiKeyIndex);
    
    if (result && result.error) {
      throw new Error(`Failed to switch API key: ${result.error}`);
    }
  }

  /**
   * Sign a create grouped orders transaction
   * Creates a single transaction with multiple orders (OTO/OCO/OTOCO)
   * Returns composite response with txType, txInfo, txHash
   */
  async signCreateGroupedOrders(params: CreateGroupedOrdersParams): Promise<WasmTxResponse> {
    await this.ensureInitialized();
    
    // Convert orders array to format expected by WASM (array of objects)
    const ordersArray = params.orders.map(order => ({
      MarketIndex: order.marketIndex,
      ClientOrderIndex: order.clientOrderIndex,
      BaseAmount: order.baseAmount,
      Price: order.price,
      IsAsk: order.isAsk,
      Type: order.orderType,
      TimeInForce: order.timeInForce,
      ReduceOnly: order.reduceOnly,
      TriggerPrice: order.triggerPrice,
      OrderExpiry: order.orderExpiry,
    }));
    
    const result = this.wasmModule.signCreateGroupedOrders(
      params.groupingType,
      ordersArray,
      params.nonce,
      params.apiKeyIndex,
      params.accountIndex
    );
    
    if (result.error) {
      return { txType: 0, txInfo: '', txHash: '', error: result.error };
    }
    
    return {
      txType: result.txType ?? 28, // Default to CREATE_GROUPED_ORDERS
      txInfo: result.txInfo ?? '',
      txHash: result.txHash ?? '',
      messageToSign: result.messageToSign
    };
  }

  async checkClient(apiKeyIndex: number, accountIndex: number): Promise<void> {
    await this.ensureInitialized();
    if (!this.wasmModule.checkClient) return; // optional
    
    // lighter-go CheckClient returns:
    // - Success: {} (empty object)
    // - Error: {error: "message"}
    const result = this.wasmModule.checkClient(apiKeyIndex, accountIndex);
    if (result && result.error) {
      throw new Error(typeof result.error === 'string' ? result.error : String(result.error));
    }
  }

  /**
   * Ensure the WASM module is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Load script for browser environment
   */
  private async loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Load wasm_exec.js for Node.js
   */
  private async loadWasmExec(path: string): Promise<void> {
    try {
      let absolutePath: string = path;
      
      if (!absolutePath.startsWith('/') && !absolutePath.includes(':')) {
        try {
          absolutePath = require.resolve(path, { paths: [process.cwd()] });
        } catch {
          absolutePath = require('path').resolve(process.cwd(), path);
        }
      }

      // Directly require the wasm_exec.js file
      delete require.cache[absolutePath];
      const wasmExec = require(absolutePath);
      
      // Set Go class on global object
      if (wasmExec && wasmExec.Go) {
        (global as any).Go = wasmExec.Go;
      } else if ((global as any).Go) {
        // already provided by official runtime
      } else {
        throw new Error('Go class not found in wasm_exec.js');
      }
    } catch (error) {
      throw new Error(`Failed to load wasm_exec.js: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resolve WASM path relative to package root
   */
  private resolveWasmPath(path: string): string {
    // If path is already absolute, return as-is
    if (require('path').isAbsolute(path)) {
      return path;
    }

    // Try to resolve relative to package root first
    try {
      // Look for the package root by finding node_modules/lighter-ts-sdk
      const packageRoot = this.findPackageRoot();
      if (packageRoot) {
        const resolvedPath = require('path').join(packageRoot, path);
        if (fs.existsSync(resolvedPath)) {
          return resolvedPath;
        }
      }
    } catch {}

    // Fallback to current working directory
    return require('path').resolve(process.cwd(), path);
  }

  /**
   * Find the package root directory
   */
  private findPackageRoot(): string | null {
    try {
      // Try to resolve the package.json of lighter-ts-sdk
      const packageJsonPath = require.resolve('lighter-ts-sdk/package.json');
      return require('path').dirname(packageJsonPath);
    } catch {
      // Fallback: look for node_modules/lighter-ts-sdk in current or parent directories
      let currentDir = process.cwd();
      const maxDepth = 10; // Prevent infinite loops
      let depth = 0;
      
      while (currentDir && depth < maxDepth) {
        const packagePath = require('path').join(currentDir, 'node_modules', 'lighter-ts-sdk');
        if (fs.existsSync(packagePath)) {
          return packagePath;
        }
        currentDir = require('path').dirname(currentDir);
        depth++;
      }
    }
    return null;
  }

  /**
   * Load WASM binary for Node.js
   */
  private async loadWasmBinary(path: string): Promise<ArrayBuffer> {
    if (this.isBrowser) {
      // Browser path
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load WASM binary: ${response.statusText}`);
      }
      return response.arrayBuffer();
    } else {
      // Node.js path
      const buffer = fs.readFileSync(path);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  }
}

/**
 * Create a unified WASM signer client instance
 * Automatically detects browser vs Node.js environment
 */
export function createWasmSignerClient(config: WasmSignerConfig): WasmSignerClient {
  return new WasmSignerClient(config);
}

// Legacy exports for backward compatibility
export { WasmSignerClient as NodeWasmSignerClient };
export const createNodeWasmSignerClient = createWasmSignerClient;