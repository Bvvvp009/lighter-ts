/**
 * WASM Signer Client for Lighter Protocol
 * 
 * This module provides a TypeScript wrapper for the Go WASM signer,
 * enabling cryptographic operations in the browser and Node.js environments.
 */

export interface WasmSignerConfig {
  wasmPath: string; // Path to the WASM binary
  wasmExecPath?: string; // Path to wasm_exec.js (optional, defaults to same directory)
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
}

export interface CancelOrderParams {
  marketIndex: number;
  orderIndex: number;
  nonce: number;
}

export interface WasmSignerResponse<T = any> {
  success?: boolean;
  error?: string;
  data?: T;
}

export class WasmSignerClient {
  private wasmModule: any = null;
  private isInitialized = false;
  private config: WasmSignerConfig;

  constructor(config: WasmSignerConfig) {
    this.config = config;
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load the Go WASM runtime
      const wasmExecPath = this.config.wasmExecPath || this.config.wasmPath.replace('.wasm', '_exec.js');
      await this.loadScript(wasmExecPath);

      // Load the WASM binary
      const wasmBytes = await this.loadWasmBinary(this.config.wasmPath);
      
      // Initialize the Go runtime
      const go = new (window as any).Go();
      const result = await WebAssembly.instantiate(wasmBytes, go.importObject);
      go.run(result.instance);

      this.wasmModule = {
        generateAPIKey: (window as any).generateAPIKey,
        createClient: (window as any).createClient,
        signCreateOrder: (window as any).signCreateOrder,
        signCancelOrder: (window as any).signCancelOrder,
        createAuthToken: (window as any).createAuthToken,
      };

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize WASM signer: ${error}`);
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
   * Create a client for signing transactions
   */
  async createClient(params: CreateClientParams): Promise<void> {
    await this.ensureInitialized();
    
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
   */
  async signCreateOrder(params: CreateOrderParams): Promise<string> {
    await this.ensureInitialized();
    
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
      params.nonce
    );
    
    if (result.error) {
      throw new Error(`Failed to sign create order: ${result.error}`);
    }
    
    return result.txInfo;
  }

  /**
   * Sign a cancel order transaction
   */
  async signCancelOrder(params: CancelOrderParams): Promise<string> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signCancelOrder(
      params.marketIndex,
      params.orderIndex,
      params.nonce
    );
    
    if (result.error) {
      throw new Error(`Failed to sign cancel order: ${result.error}`);
    }
    
    return result.txInfo;
  }

  /**
   * Create an authentication token
   */
  async createAuthToken(deadline?: number): Promise<string> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.createAuthToken(deadline);
    
    if (result.error) {
      throw new Error(`Failed to create auth token: ${result.error}`);
    }
    
    return result.authToken;
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
   * Load a script dynamically
   */
  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Load WASM binary
   */
  private async loadWasmBinary(path: string): Promise<ArrayBuffer> {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load WASM binary: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }
}

/**
 * Create a WASM signer client instance
 */
export function createWasmSignerClient(config: WasmSignerConfig): WasmSignerClient {
  return new WasmSignerClient(config);
}

