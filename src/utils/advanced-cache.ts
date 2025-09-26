// Advanced multi-level caching system
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  size: number;
  memoryUsage: number;
}

export class AdvancedCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  };
  private maxSize: number;
  private defaultTtl: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(maxSize = 1000, defaultTtl = 300000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
    this.startCleanup();
  }

  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      ttl: ttl || this.defaultTtl,
      accessCount: 0,
      lastAccessed: now
    };

    this.cache.set(key, entry);
    this.stats.sets++;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    
    // Check if expired
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = now;
    this.stats.hits++;

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    if (keysToDelete.length > 0) {
      if (process.env['NODE_ENV'] === 'development') {
        console.log(`🧹 Cache cleanup: removed ${keysToDelete.length} expired entries`);
      }
    }
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      size: this.cache.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private estimateMemoryUsage(): number {
    let size = 0;
    for (const [key, entry] of this.cache.entries()) {
      size += key.length * 2; // UTF-16 characters
      size += JSON.stringify(entry.value).length * 2;
      size += 64; // Overhead for entry object
    }
    return size;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

// Specialized cache for API responses (nonce caching handled separately)
export class ApiResponseCache {
  private cache: AdvancedCache<any>;

  constructor() {
    this.cache = new AdvancedCache(500, 60000); // 1 minute TTL
  }

  setApiResponse(key: string, response: any, ttl?: number): void {
    this.cache.set(key, response, ttl);
  }

  getApiResponse(key: string): any | null {
    return this.cache.get(key);
  }

  getStats(): {
    apiCache: CacheStats;
  } {
    return {
      apiCache: this.cache.getStats()
    };
  }

  clear(): void {
    this.cache.clear();
  }
}

// Cache manager for different types of data
export class CacheManager {
  private static instance: CacheManager | null = null;
  
  public apiCache: ApiResponseCache;
  public orderBookCache: AdvancedCache<any>;
  public accountCache: AdvancedCache<any>;

  private constructor() {
    this.apiCache = new ApiResponseCache();
    this.orderBookCache = new AdvancedCache(100, 5000); // 5 second TTL for order book
    this.accountCache = new AdvancedCache(10, 10000); // 10 second TTL for account data
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // Order book caching
  setOrderBook(marketIndex: number, orderBook: any): void {
    this.orderBookCache.set(`orderbook_${marketIndex}`, orderBook);
  }

  getOrderBook(marketIndex: number): any | null {
    return this.orderBookCache.get(`orderbook_${marketIndex}`);
  }

  // Account data caching
  setAccountData(accountIndex: number, accountData: any): void {
    this.accountCache.set(`account_${accountIndex}`, accountData);
  }

  getAccountData(accountIndex: number): any | null {
    return this.accountCache.get(`account_${accountIndex}`);
  }

  // Clear all caches
  clearAll(): void {
    this.apiCache.clear();
    this.orderBookCache.clear();
    this.accountCache.clear();
  }

  // Get comprehensive stats
  getStats(): {
    apiCache: any;
    orderBookCache: CacheStats;
    accountCache: CacheStats;
  } {
    return {
      apiCache: this.apiCache.getStats(),
      orderBookCache: this.orderBookCache.getStats(),
      accountCache: this.accountCache.getStats()
    };
  }

  // Warm up caches
  async warmup(): Promise<void> {
    if (process.env["NODE_ENV"] === 'development') {
      console.log('🔥 Warming up caches...');
    }
    // Pre-populate commonly accessed data
    // This would be called during initialization
  }
}

// Global instance
export const cacheManager = CacheManager.getInstance();
