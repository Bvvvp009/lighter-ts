/**
 * Node.js WASM Signer Client for Lighter Protocol
 * 
 * This module provides a Node.js wrapper for the Go WASM signer,
 * enabling cryptographic operations in Node.js environments.
 */

import * as fs from 'fs';

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

export class NodeWasmSignerClient {
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
      await this.loadWasmExec(wasmExecPath);

      // Load the WASM binary
      const wasmBytes = await this.loadWasmBinary(this.config.wasmPath);
      
      // Initialize the Go runtime with better error handling
      const Go = (global as any).Go;
      if (!Go) {
        throw new Error('Go class not found after loading wasm_exec.js');
      }
      
      const go = new Go();
      const result = await WebAssembly.instantiate(wasmBytes, go.importObject);
      
      // Run the WASM module
      go.run(result.instance);

      // Wait a bit for the Go functions to be registered
      await new Promise(resolve => setTimeout(resolve, 100));

      this.wasmModule = {
        generateAPIKey: (global as any).generateAPIKey,
        createClient: (global as any).createClient,
        signCreateOrder: (global as any).signCreateOrder,
        signCancelOrder: (global as any).signCancelOrder,
        createAuthToken: (global as any).createAuthToken,
      };

      // Verify that the functions are available
      if (!this.wasmModule.generateAPIKey) {
        throw new Error('WASM functions not properly registered');
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize WASM signer: ${error.message}`);
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
   * Load wasm_exec.js for Node.js
   */
  private async loadWasmExec(path: string): Promise<void> {
    const wasmExecCode = fs.readFileSync(path, 'utf8');
    
    // Execute the wasm_exec.js code directly
    eval(wasmExecCode);
    
    // Ensure Go class is available globally
    if (typeof global !== 'undefined') {
      global.Go = (global as any).Go;
    }
  }

  /**
   * Load WASM binary for Node.js
   */
  private async loadWasmBinary(path: string): Promise<ArrayBuffer> {
    const buffer = fs.readFileSync(path);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
}

/**
 * Create a Node.js WASM signer client instance
 */
export function createNodeWasmSignerClient(config: WasmSignerConfig): NodeWasmSignerClient {
  return new NodeWasmSignerClient(config);
}

