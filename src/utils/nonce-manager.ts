/**
 * Standalone Nonce Manager Utility
 * Provides nonce management functionality that can be imported and used independently
 */

import { NonceCache, NonceInfo } from './nonce-cache';
import { TransactionApi } from '../api/transaction-api';
import { ApiClient } from '../api/api-client';

export interface NonceManagerConfig {
  accountIndex: number;
  apiKeyIndex: number;
  batchSize?: number;
  maxCacheAge?: number;
}

export class NonceManager {
  private nonceCache: NonceCache;
  private transactionApi: TransactionApi;
  private config: NonceManagerConfig;

  constructor(apiClient: ApiClient, config: NonceManagerConfig) {
    this.config = {
      batchSize: 20,
      maxCacheAge: 30000, // 30 seconds
      ...config
    };

    this.transactionApi = new TransactionApi(apiClient);
    
    this.nonceCache = new NonceCache(
      async (apiKeyIndex: number, count: number) => {
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
  }

  /**
   * Get next nonce for current API key
   */
  async getNextNonce(): Promise<number> {
    return this.nonceCache.getNextNonce(this.config.apiKeyIndex);
  }

  /**
   * Get multiple nonces for batch operations
   */
  async getNextNonces(count: number): Promise<number[]> {
    return this.nonceCache.getNextNonces(this.config.apiKeyIndex, count);
  }

  /**
   * Pre-warm the nonce cache for better performance
   */
  async preWarmCache(): Promise<void> {
    await this.nonceCache.refreshNonces(this.config.apiKeyIndex);
  }

  /**
   * Clear nonce cache
   */
  clearCache(): void {
    this.nonceCache.clearCache(this.config.apiKeyIndex);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): Record<number, { count: number; oldest: number; newest: number }> {
    return this.nonceCache.getCacheStats();
  }

  /**
   * Check if nonce manager is healthy
   */
  isHealthy(): boolean {
    return this.nonceCache.isHealthy();
  }

  /**
   * Get current configuration
   */
  getConfig(): NonceManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<NonceManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Factory function to create a nonce manager
 */
export function createNonceManager(
  apiClient: ApiClient, 
  config: NonceManagerConfig
): NonceManager {
  return new NonceManager(apiClient, config);
}

/**
 * Standalone nonce fetching function (without caching)
 */
export async function fetchNextNonce(
  apiClient: ApiClient,
  accountIndex: number,
  apiKeyIndex: number
): Promise<number> {
  const transactionApi = new TransactionApi(apiClient);
  const result = await transactionApi.getNextNonce(accountIndex, apiKeyIndex);
  return result.nonce;
}

/**
 * Standalone batch nonce fetching function (without caching)
 */
export async function fetchNextNonces(
  apiClient: ApiClient,
  accountIndex: number,
  apiKeyIndex: number,
  count: number
): Promise<number[]> {
  const transactionApi = new TransactionApi(apiClient);
  const firstNonceResult = await transactionApi.getNextNonce(accountIndex, apiKeyIndex);
  
  const nonces: number[] = [];
  for (let i = 0; i < count; i++) {
    nonces.push(firstNonceResult.nonce + i);
  }
  return nonces;
}
