// WASM manager for pre-initialization and singleton pattern
import { NodeWasmSignerClient, createNodeWasmSignerClient } from './node-wasm-signer';
import { WasmSignerClient, createWasmSignerClient } from './wasm-signer';

export interface WasmConfig {
  wasmPath: string;
  wasmExecPath?: string;
}

export type WasmClientType = 'browser' | 'node';

export class WasmManager {
  private static instance: WasmManager | null = null;
  private wasmClient: WasmSignerClient | NodeWasmSignerClient | null = null;
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
      console.log('🚀 Initializing WASM client...');
      const startTime = Date.now();

      this.config = config;

      if (clientType === 'browser' && typeof window !== 'undefined') {
        this.wasmClient = createWasmSignerClient(config);
      } else {
        this.wasmClient = createNodeWasmSignerClient(config);
      }

      // Initialize the WASM client
      await (this.wasmClient as any).initialize();

      const initTime = Date.now() - startTime;
      console.log(`✅ WASM client initialized in ${initTime.toFixed(2)}ms`);

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize WASM client:', error);
      throw error;
    }
  }

  getWasmClient(): WasmSignerClient | NodeWasmSignerClient {
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

