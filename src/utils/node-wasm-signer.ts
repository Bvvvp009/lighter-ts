/**
 * Node.js WASM Signer Client for Lighter Protocol
 * 
 * This module provides a Node.js wrapper for the Go WASM signer,
 * enabling cryptographic operations in Node.js environments.
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
// Removed WasiSigner import

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

export interface CancelAllOrdersParams {
  timeInForce: number;
  time: number;
  nonce: number;
}

export interface TransferParams {
  toAccountIndex: number;
  usdcAmount: number;
  fee: number;
  memo: string;
  nonce: number;
}

export interface UpdateLeverageParams {
  marketIndex: number;
  fraction: number;
  marginMode: number;
  nonce: number;
}

export class NodeWasmSignerClient {
  private wasmModule: any = null;
  private isInitialized = false;
  private config: WasmSignerConfig;
  // private wasiSigner: WasiSigner | null = null;  // removed

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
      // Resolve wasm_exec.js runtime
      let wasmExecPath = this.config.wasmExecPath;
      // Prefer official Go runtime first if available (node-specific if present)
      try {
        const goroot = execSync('go env GOROOT').toString().trim();
        const libPath = require('path').join(goroot, 'lib', 'wasm', 'wasm_exec.js');
        const miscPath = require('path').join(goroot, 'misc', 'wasm', 'wasm_exec.js');
        const nodeCli = require('path').join(goroot, 'lib', 'wasm', 'wasm_exec_node.js');
        if (fs.existsSync(libPath)) {
          wasmExecPath = libPath;
        } else if (fs.existsSync(miscPath)) {
          wasmExecPath = miscPath;
        } else if (fs.existsSync(nodeCli)) {
          // fallback only if nothing else is available
          wasmExecPath = nodeCli;
        }
      } catch {}

      if (!wasmExecPath) {
        const candidates = [
          'wasm/wasm_exec_nodejs.js',
          'wasm/wasm_exec.js'
        ];
        for (const c of candidates) {
          const abs = require('path').resolve(process.cwd(), c);
          if (fs.existsSync(abs)) { wasmExecPath = abs; break; }
        }
      }

      if (!wasmExecPath) {
        throw new Error('Unable to locate wasm_exec runtime. Provide wasmExecPath or install Go.');
      }

      await this.loadWasmExec(wasmExecPath);

      // Load the WASM binary
      const wasmBytes = await this.loadWasmBinary(this.config.wasmPath);
      
      // Initialize the Go runtime
      const Go = (global as any).Go;
      const go = new Go();
      // Do not override runtime-provided imports; alias only if missing
      const io = go.importObject as any;
      if (!io["gojs"]) {
        if (io["go"]) io["gojs"] = io["go"]; else if (io["env"]) io["gojs"] = io["env"]; 
      }
      
      // Add Node.js environment
      go.env = Object.assign({ TMPDIR: require('os').tmpdir() }, process.env);
      go.argv = process.argv;
      go.exit = process.exit;
      
      const result = await WebAssembly.instantiate(wasmBytes, go.importObject);
      
      // Run the WASM module (must succeed to register functions)
      go.run(result.instance);

      // Wait for functions to be registered
      await new Promise(resolve => setTimeout(resolve, 200));

      // Try multiple ways to access the functions
      this.wasmModule = {
        generateAPIKey: (global as any).generateAPIKey || (global as any).lighterWasmFunctions?.generateAPIKey,
        createClient: (global as any).createClient || (global as any).lighterWasmFunctions?.createClient,
        signCreateOrder: (global as any).signCreateOrder || (global as any).lighterWasmFunctions?.signCreateOrder,
        signCancelOrder: (global as any).signCancelOrder || (global as any).lighterWasmFunctions?.signCancelOrder,
        signCancelAllOrders: (global as any).signCancelAllOrders || (global as any).lighterWasmFunctions?.signCancelAllOrders,
        signTransfer: (global as any).signTransfer || (global as any).lighterWasmFunctions?.signTransfer,
        signUpdateLeverage: (global as any).signUpdateLeverage || (global as any).lighterWasmFunctions?.signUpdateLeverage,
        createAuthToken: (global as any).createAuthToken || (global as any).lighterWasmFunctions?.createAuthToken,
        checkClient: (global as any).CheckClient || (global as any).checkClient || (global as any).lighterWasmFunctions?.checkClient,
      };

      // Verify that the functions are available
      if (!this.wasmModule.generateAPIKey) {
        throw new Error('WASM functions not properly registered');
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize WASM signer: ${error instanceof Error ? error.message : String(error)}`);
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
   * Sign a cancel all orders transaction
   */
  async signCancelAllOrders(params: CancelAllOrdersParams): Promise<{ txInfo: string; error?: string }> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signCancelAllOrders(
      params.timeInForce,
      params.time,
      params.nonce
    );
    
    if (result.error) {
      return { txInfo: '', error: result.error };
    }
    
    return { txInfo: result.txInfo };
  }

  /**
   * Sign a transfer transaction
   */
  async signTransfer(params: TransferParams): Promise<{ txInfo: string; error?: string }> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signTransfer(
      params.toAccountIndex,
      params.usdcAmount,
      params.fee,
      params.memo,
      params.nonce
    );
    
    if (result.error) {
      return { txInfo: '', error: result.error };
    }
    
    return { txInfo: result.txInfo };
  }

  /**
   * Sign an update leverage transaction
   */
  async signUpdateLeverage(params: UpdateLeverageParams): Promise<{ txInfo: string; error?: string }> {
    await this.ensureInitialized();
    
    const result = this.wasmModule.signUpdateLeverage(
      params.marketIndex,
      params.fraction,
      params.marginMode,
      params.nonce
    );
    
    if (result.error) {
      return { txInfo: '', error: result.error };
    }
    
    return { txInfo: result.txInfo };
  }

  async checkClient(apiKeyIndex: number, accountIndex: number): Promise<void> {
    await this.ensureInitialized();
    if (!this.wasmModule.checkClient) return; // optional
    const err = this.wasmModule.checkClient(apiKeyIndex, accountIndex);
    if (err) {
      throw new Error(typeof err === 'string' ? err : String(err));
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

