/**
 * Node.js WASM Signer Client for Lighter Protocol
 * 
 * This module provides a Node.js wrapper for the Go WASM signer,
 * enabling cryptographic operations in Node.js environments.
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
// No runtime Go dependency needed; do not import child_process
// Removed WasiSigner import

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
  private wasmInstance: any = null; // Keep reference to prevent GC
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
      // Resolve WASM paths relative to package root if they're relative paths
      const resolvedWasmPath = this.resolveWasmPath(this.config.wasmPath || 'wasm/lighter-signer.wasm');
      let wasmExecPath = this.config.wasmExecPath;

      // Resolve wasm_exec.js runtime - prioritize official Go runtime
      if (wasmExecPath) {
        wasmExecPath = this.resolveWasmPath(wasmExecPath);
      } else {
        // Try official Go runtime first (dev environments)
        try {
          const goroot = execSync('go env GOROOT').toString().trim();
          const candidatesGo = [
            require('path').join(goroot, 'misc', 'wasm', 'wasm_exec.js'),
            require('path').join(goroot, 'lib', 'wasm', 'wasm_exec.js')
          ];
          for (const p of candidatesGo) {
            if (fs.existsSync(p)) {
              wasmExecPath = p;
              break;
            }
          }
        } catch {}

        // Fallback to bundled official wasm_exec.js (no custom nodejs version)
        if (!wasmExecPath) {
          const candidates = [
            'wasm/wasm_exec.js'  // Only use official Go runtime
          ];
          for (const c of candidates) {
            const resolved = this.resolveWasmPath(c);
            if (fs.existsSync(resolved)) {
              wasmExecPath = resolved;
              break;
            }
          }
        }
      }

      if (!wasmExecPath) {
        throw new Error('Unable to locate wasm_exec runtime. Bundled files not found and Go not installed. Please ensure wasm/wasm_exec.js exists in the package.');
      }

      await this.loadWasmExec(wasmExecPath);

      // Load the WASM binary
      const wasmBytes = await this.loadWasmBinary(resolvedWasmPath);
      
      // Initialize the Go runtime
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
      
      // Don't initialize mem here - let wasm_exec.js handle it
      
      // Set up the Go runtime environment before running
      go.env = Object.assign({ TMPDIR: require('os').tmpdir() }, process.env);
      go.argv = process.argv;
      go.exit = process.exit;
      
      // Minimal globals (official runtime sets most as needed)
      (global as any).process = process;
      (global as any).console = console;
      (global as any).Buffer = Buffer;
      
      // The wasm_exec.js now handles mem initialization automatically
      
      // Keep a reference to the instance to prevent garbage collection
      this.wasmInstance = result.instance;
      // Also store globally to prevent GC
      (global as any).wasmInstance = result.instance;
      // Store the memory buffer globally to prevent detachment
      (global as any).wasmMemory = result.instance.exports['mem'];
      console.log('WASM instance stored:', !!this.wasmInstance);
      
      // Run the WASM module using the standard Go runtime approach
      console.log('About to run Go WASM module...');
      try {
        go.run(result.instance);
        console.log('Go WASM module run completed');
      } catch (runError) {
        console.error('Error during go.run():', runError);
        throw new Error(`Go runtime failed: ${runError instanceof Error ? runError.message : String(runError)}`);
      }

      // Wait for functions to be registered
      console.log('Waiting for functions to be registered...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Debug: Log what's available on global
      console.log('Global functions available:', Object.keys(global).filter(k => k.includes('generate') || k.includes('create') || k.includes('sign')));
      //console.log('lighterWasmFunctions:', (global as any).lighterWasmFunctions);

      // Try multiple ways to access the functions (Go exports are capitalized)
      this.wasmModule = {
        generateAPIKey: (global as any).GenerateAPIKey || (global as any).generateAPIKey || (global as any).lighterWasmFunctions?.generateAPIKey,
        createClient: (global as any).CreateClient || (global as any).createClient || (global as any).lighterWasmFunctions?.createClient,
        signCreateOrder: (global as any).SignCreateOrder || (global as any).signCreateOrder || (global as any).lighterWasmFunctions?.signCreateOrder,
        signCancelOrder: (global as any).SignCancelOrder || (global as any).signCancelOrder || (global as any).lighterWasmFunctions?.signCancelOrder,
        signCancelAllOrders: (global as any).SignCancelAllOrders || (global as any).signCancelAllOrders || (global as any).lighterWasmFunctions?.signCancelAllOrders,
        signTransfer: (global as any).SignTransfer || (global as any).signTransfer || (global as any).lighterWasmFunctions?.signTransfer,
        signUpdateLeverage: (global as any).SignUpdateLeverage || (global as any).signUpdateLeverage || (global as any).lighterWasmFunctions?.signUpdateLeverage,
        createAuthToken: (global as any).CreateAuthToken || (global as any).createAuthToken || (global as any).lighterWasmFunctions?.createAuthToken,
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
    
    // Standalone signer: CreateClient(apiKeyPrivateKey, accountIndex, apiKeyIndex, chainId)
    const result = this.wasmModule.createClient(
      params.privateKey,
      params.accountIndex,
      params.apiKeyIndex,
      params.chainId
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

      console.log('Loading wasm_exec from:', absolutePath);

      // Directly require the wasm_exec.js file
      delete require.cache[absolutePath];
      const wasmExec = require(absolutePath);
      
      console.log('wasm_exec loaded, Go class:', !!wasmExec?.Go);
      
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

