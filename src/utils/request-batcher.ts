// Request batching system for multiple operations in single API call
import { performanceMonitor } from './performance-monitor';

export interface BatchRequest {
  id: string;
  type: 'CREATE_ORDER' | 'CANCEL_ORDER' | 'MODIFY_ORDER';
  params: any;
  timestamp: number;
}

export interface BatchResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
  flushInterval: number;
}

export class RequestBatcher {
  private config: BatchConfig;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }>();
  private batchQueue: BatchRequest[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private batchProcessor: (requests: BatchRequest[]) => Promise<BatchResponse[]>,
    config?: Partial<BatchConfig>
  ) {
    this.config = {
      maxBatchSize: 10,
      maxWaitTime: 50, // 50ms max wait time
      flushInterval: 25, // 25ms flush interval
      ...config
    };
  }

  async addRequest(type: 'CREATE_ORDER' | 'CANCEL_ORDER' | 'MODIFY_ORDER', params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const request: BatchRequest = {
        id: requestId,
        type,
        params,
        timestamp: Date.now()
      };

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Add to batch queue
      this.batchQueue.push(request);

      // Check if we should flush immediately
      if (this.batchQueue.length >= this.config.maxBatchSize) {
        this.flush();
      } else {
        // Schedule flush if not already scheduled
        this.scheduleFlush();
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return; // Already scheduled
    }

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.isProcessing || this.batchQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Clear flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Get current batch
    const currentBatch = [...this.batchQueue];
    this.batchQueue = [];

    if (currentBatch.length === 0) {
      this.isProcessing = false;
      return;
    }

    const endTimer = performanceMonitor.startTimer('batch_process', {
      count: currentBatch.length.toString()
    });

    try {
      if (process.env["NODE_ENV"] === 'development') {
        console.log(`📦 Processing batch of ${currentBatch.length} requests`);
      }
      
      // Process batch
      const responses = await this.batchProcessor(currentBatch);

      // Handle responses
      for (const response of responses) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);

          if (response.success) {
            pending.resolve(response.result);
          } else {
            pending.reject(new Error(response.error || 'Batch request failed'));
          }
        }
      }

      // Handle any requests that didn't get responses (shouldn't happen)
      for (const request of currentBatch) {
        const pending = this.pendingRequests.get(request.id);
        if (pending) {
          this.pendingRequests.delete(request.id);
          pending.reject(new Error('No response received for batch request'));
        }
      }

      if (process.env["NODE_ENV"] === 'development') {
        console.log(`✅ Batch processed: ${responses.length} responses`);
      }
      
    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      
      // Reject all pending requests in this batch
      for (const request of currentBatch) {
        const pending = this.pendingRequests.get(request.id);
        if (pending) {
          this.pendingRequests.delete(request.id);
          pending.reject(error instanceof Error ? error : new Error('Batch processing failed'));
        }
      }
    } finally {
      this.isProcessing = false;
      endTimer();
    }
  }

  async flushAll(): Promise<void> {
    // Clear any pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Process any remaining requests
    await this.flush();
  }

  getStats(): {
    pendingRequests: number;
    batchQueue: number;
    isProcessing: boolean;
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      batchQueue: this.batchQueue.length,
      isProcessing: this.isProcessing
    };
  }

  async destroy(): Promise<void> {
    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error('RequestBatcher destroyed'));
    }
    this.pendingRequests.clear();

    // Clear batch queue
    this.batchQueue = [];
  }
}

// Factory function for creating batchers with common configurations
export function createOrderBatcher(
  batchProcessor: (requests: BatchRequest[]) => Promise<BatchResponse[]>,
  options?: {
    maxBatchSize?: number;
    maxWaitTime?: number;
    flushInterval?: number;
  }
): RequestBatcher {
  return new RequestBatcher(batchProcessor, options);
}

// High-frequency trading optimized batcher
export function createHFTBatcher(
  batchProcessor: (requests: BatchRequest[]) => Promise<BatchResponse[]>
): RequestBatcher {
  return new RequestBatcher(batchProcessor, {
    maxBatchSize: 5, // Smaller batches for lower latency
    maxWaitTime: 10, // 10ms max wait
    flushInterval: 5  // 5ms flush interval
  });
}

// General trading optimized batcher
export function createGeneralBatcher(
  batchProcessor: (requests: BatchRequest[]) => Promise<BatchResponse[]>
): RequestBatcher {
  return new RequestBatcher(batchProcessor, {
    maxBatchSize: 20, // Larger batches for efficiency
    maxWaitTime: 100, // 100ms max wait
    flushInterval: 50 // 50ms flush interval
  });
}
