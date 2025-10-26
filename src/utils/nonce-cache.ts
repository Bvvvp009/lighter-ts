// Nonce caching system to reduce API calls and improve performance
export interface NonceInfo {
  nonce: number;
  timestamp: number;
  apiKeyIndex: number;
}

export class NonceCache {
  private cache = new Map<number, NonceInfo[]>();
  private batchSize = 20; // Pre-fetch 20 nonces at a time (was 10, now 20 for multiple markets)
  private maxCacheAge = 30000; // 30 seconds
  private lastFetch = 0;
  private fetchPromise: Promise<void> | null = null;

  constructor(
    private fetchNonceCallback: (apiKeyIndex: number, count: number) => Promise<number[]>
  ) {}

  async getNextNonce(apiKeyIndex: number): Promise<number> {
    const nonces = this.cache.get(apiKeyIndex);
    
    // If no cached nonces or cache is empty, fetch new batch
    if (!nonces || nonces.length === 0 || this.isCacheExpired()) {
      await this.refreshNonces(apiKeyIndex);
    }

    const cachedNonces = this.cache.get(apiKeyIndex);
    if (!cachedNonces || cachedNonces.length === 0) {
      throw new Error('Failed to get nonce from cache');
    }

    // Return the first nonce and remove it from cache
    const nonceInfo = cachedNonces.shift()!;
    
    // Update the cache with the remaining nonces
    this.cache.set(apiKeyIndex, cachedNonces);
    
    // If cache is getting low, pre-fetch more nonces
    if (cachedNonces.length <= 2) {
      this.refreshNonces(apiKeyIndex).catch(() => {});
    }

    return nonceInfo.nonce;
  }

  async getNextNonces(apiKeyIndex: number, count: number): Promise<number[]> {
    const nonces: number[] = [];
    
    for (let i = 0; i < count; i++) {
      const nonce = await this.getNextNonce(apiKeyIndex);
      nonces.push(nonce);
    }
    
    return nonces;
  }

  async refreshNonces(apiKeyIndex: number): Promise<void> {
    // Prevent concurrent fetches
    if (this.fetchPromise) {
      await this.fetchPromise;
      return;
    }

    this.fetchPromise = this.doRefreshNonces(apiKeyIndex);
    
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async doRefreshNonces(apiKeyIndex: number): Promise<void> {
    try {
      const newNonces = await this.fetchNonceCallback(apiKeyIndex, this.batchSize);
      
      const nonceInfos: NonceInfo[] = newNonces.map(nonce => ({
        nonce,
        timestamp: Date.now(),
        apiKeyIndex
      }));

      this.cache.set(apiKeyIndex, nonceInfos);
      this.lastFetch = Date.now();
    } catch (error) {
      throw error;
    }
  }

  private isCacheExpired(): boolean {
    return Date.now() - this.lastFetch > this.maxCacheAge;
  }

  // Pre-warm the cache for better performance
  async preWarmCache(apiKeyIndices: number[]): Promise<void> {
    const promises = apiKeyIndices.map(index => this.refreshNonces(index));
    await Promise.all(promises);
  }

  // Clear cache for a specific API key
  clearCache(apiKeyIndex: number): void {
    this.cache.delete(apiKeyIndex);
  }

  // Clear all cache
  clearAllCache(): void {
    this.cache.clear();
    this.lastFetch = 0;
  }

  // Get cache statistics for monitoring
  getCacheStats(): Record<number, { count: number; oldest: number; newest: number }> {
    const stats: Record<number, { count: number; oldest: number; newest: number }> = {};
    
    for (const [apiKeyIndex, nonces] of Array.from(this.cache.entries())) {
      if (nonces.length > 0) {
        const timestamps = nonces.map(n => n.timestamp);
        stats[apiKeyIndex] = {
          count: nonces.length,
          oldest: Math.min(...timestamps),
          newest: Math.max(...timestamps)
        };
      }
    }
    
    return stats;
  }

  // Health check for cache
  isHealthy(): boolean {
    const now = Date.now();
    return now - this.lastFetch < this.maxCacheAge * 2; // Allow some tolerance
  }

  /**
   * Acknowledge failure and rollback nonce
   */
  acknowledgeFailure(apiKeyIndex: number): void {
    const nonces = this.cache.get(apiKeyIndex);
    if (nonces && nonces.length > 0) {
      // Rollback the last used nonce by adding it back to the front
      const lastNonce = nonces[0];
      if (lastNonce) {
        nonces.unshift({
          nonce: lastNonce.nonce - 1,
          timestamp: Date.now(),
          apiKeyIndex
        });
        this.cache.set(apiKeyIndex, nonces);
      }
    }
  }

  /**
   * Hard refresh nonce from API (used when invalid nonce error occurs)
   */
  async hardRefreshNonce(apiKeyIndex: number): Promise<void> {
    // Clear current cache for this API key
    this.cache.delete(apiKeyIndex);
    // Fetch fresh nonce from API
    await this.refreshNonces(apiKeyIndex);
  }
}
