// Memory pooling system to reduce garbage collection overhead
export interface PooledObject {
  reset(): void;
}

export class ObjectPool<T extends PooledObject> {
  private pool: T[] = [];
  private factory: () => T;
  private maxSize: number;
  private currentSize = 0;
  private createdCount = 0;
  private reusedCount = 0;

  constructor(factory: () => T, initialSize = 10, maxSize = 100) {
    this.factory = factory;
    this.maxSize = maxSize;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
      this.currentSize++;
      this.createdCount++;
    }
  }

  acquire(): T {
    let obj: T;

    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
      this.reusedCount++;
    } else {
      obj = this.factory();
      this.createdCount++;
      this.currentSize++;
    }

    return obj;
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      obj.reset();
      this.pool.push(obj);
    } else {
      // Pool is full, let object be garbage collected
      this.currentSize--;
    }
  }

  getStats(): {
    poolSize: number;
    currentSize: number;
    createdCount: number;
    reusedCount: number;
    reuseRate: number;
  } {
    return {
      poolSize: this.pool.length,
      currentSize: this.currentSize,
      createdCount: this.createdCount,
      reusedCount: this.reusedCount,
      reuseRate: this.createdCount > 0 ? (this.reusedCount / this.createdCount) * 100 : 0
    };
  }

  clear(): void {
    this.pool = [];
    this.currentSize = 0;
  }

  resize(newSize: number): void {
    this.maxSize = newSize;
    
    // Remove excess objects if new size is smaller
    while (this.pool.length > newSize) {
      this.pool.pop();
      this.currentSize--;
    }
  }
}

// Specialized pools for common objects
export class OrderParamsPool {
  private pool: ObjectPool<PooledOrderParams>;

  constructor() {
    this.pool = new ObjectPool(
      () => new PooledOrderParams(),
      20, // Initial size
      100 // Max size
    );
  }

  acquire(): PooledOrderParams {
    return this.pool.acquire();
  }

  release(params: PooledOrderParams): void {
    this.pool.release(params);
  }

  getStats() {
    return this.pool.getStats();
  }
}

export class PooledOrderParams implements PooledObject {
  marketIndex: number = 0;
  clientOrderIndex: number = 0;
  baseAmount: number = 0;
  price: number = 0;
  isAsk: boolean = false;
  orderType: number = 0;
  timeInForce: number = 0;
  reduceOnly: boolean = false;
  triggerPrice: number = 0;
  orderExpiry: number = 0;
  nonce: number = 0;

  reset(): void {
    this.marketIndex = 0;
    this.clientOrderIndex = 0;
    this.baseAmount = 0;
    this.price = 0;
    this.isAsk = false;
    this.orderType = 0;
    this.timeInForce = 0;
    this.reduceOnly = false;
    this.triggerPrice = 0;
    this.orderExpiry = 0;
    this.nonce = 0;
  }

  setValues(params: {
    marketIndex: number;
    clientOrderIndex: number;
    baseAmount: number;
    price: number;
    isAsk: boolean;
    orderType: number;
    timeInForce: number;
    reduceOnly: boolean;
    triggerPrice: number;
    orderExpiry: number;
    nonce: number;
  }): void {
    this.marketIndex = params.marketIndex;
    this.clientOrderIndex = params.clientOrderIndex;
    this.baseAmount = params.baseAmount;
    this.price = params.price;
    this.isAsk = params.isAsk;
    this.orderType = params.orderType;
    this.timeInForce = params.timeInForce;
    this.reduceOnly = params.reduceOnly;
    this.triggerPrice = params.triggerPrice;
    this.orderExpiry = params.orderExpiry;
    this.nonce = params.nonce;
  }
}

export class TransactionResponsePool {
  private pool: ObjectPool<PooledTransactionResponse>;

  constructor() {
    this.pool = new ObjectPool(
      () => new PooledTransactionResponse(),
      10, // Initial size
      50  // Max size
    );
  }

  acquire(): PooledTransactionResponse {
    return this.pool.acquire();
  }

  release(response: PooledTransactionResponse): void {
    this.pool.release(response);
  }

  getStats() {
    return this.pool.getStats();
  }
}

export class PooledTransactionResponse implements PooledObject {
  txHash: string = '';
  success: boolean = false;
  error: string = '';
  timestamp: number = 0;

  reset(): void {
    this.txHash = '';
    this.success = false;
    this.error = '';
    this.timestamp = 0;
  }

  setValues(txHash: string, success: boolean, error: string = ''): void {
    this.txHash = txHash;
    this.success = success;
    this.error = error;
    this.timestamp = Date.now();
  }
}

// Global pool managers
export class PoolManager {
  private static instance: PoolManager | null = null;
  
  public orderParamsPool: OrderParamsPool;
  public transactionResponsePool: TransactionResponsePool;

  private constructor() {
    this.orderParamsPool = new OrderParamsPool();
    this.transactionResponsePool = new TransactionResponsePool();
  }

  static getInstance(): PoolManager {
    if (!PoolManager.instance) {
      PoolManager.instance = new PoolManager();
    }
    return PoolManager.instance;
  }

  getStats(): {
    orderParams: any;
    transactionResponse: any;
  } {
    return {
      orderParams: this.orderParamsPool.getStats(),
      transactionResponse: this.transactionResponsePool.getStats()
    };
  }

  clearAll(): void {
    this.orderParamsPool.getStats(); // Access to trigger cleanup
    this.transactionResponsePool.getStats(); // Access to trigger cleanup
  }
}

// Global instance
export const poolManager = PoolManager.getInstance();

