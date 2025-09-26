// Performance monitoring and metrics collection
export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  total: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;
  private metrics = new Map<string, number[]>();
  private maxMetricsPerKey = 1000; // Keep last 1000 measurements
  private isEnabled = true;

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.isEnabled) return;

    const key = this.getMetricKey(name, tags);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const values = this.metrics.get(key)!;
    values.push(value);

    // Keep only the most recent measurements
    if (values.length > this.maxMetricsPerKey) {
      values.shift();
    }
  }

  getStats(name: string, tags?: Record<string, string>): PerformanceStats | null {
    const key = this.getMetricKey(name, tags);
    const values = this.metrics.get(key);
    
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const total = sorted.reduce((sum, val) => sum + val, 0);
    const avg = total / count;
    const min = sorted[0] || 0;
    const max = sorted[count - 1] || 0;
    
    const p50 = this.getPercentile(sorted, 0.5);
    const p95 = this.getPercentile(sorted, 0.95);
    const p99 = this.getPercentile(sorted, 0.99);

    return {
      count,
      min,
      max,
      avg,
      p50,
      p95,
      p99,
      total
    };
  }

  getAllStats(): Record<string, PerformanceStats> {
    const stats: Record<string, PerformanceStats> = {};
    
    for (const [key, values] of this.metrics.entries()) {
      const sorted = [...values].sort((a, b) => a - b);
      const count = sorted.length;
      const total = sorted.reduce((sum, val) => sum + val, 0);
      const avg = total / count;
      const min = sorted[0] || 0;
      const max = sorted[count - 1] || 0;
      
      const p50 = this.getPercentile(sorted, 0.5);
      const p95 = this.getPercentile(sorted, 0.95);
      const p99 = this.getPercentile(sorted, 0.99);

      stats[key] = {
        count,
        min,
        max,
        avg,
        p50,
        p95,
        p99,
        total
      };
    }
    
    return stats;
  }

  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  private getMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join(',');
    
    return `${name}{${tagString}}`;
  }

  // Convenience methods for common metrics
  startTimer(name: string, tags?: Record<string, string>): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.recordMetric(name, duration, tags);
    };
  }

  recordCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.recordMetric(name, value, tags);
  }

  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric(name, value, tags);
  }

  // Performance decorators
  measureAsync<T extends any[], R>(
    name: string,
    fn: (...args: T) => Promise<R>,
    tags?: Record<string, string>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const endTimer = this.startTimer(name, tags);
      try {
        const result = await fn(...args);
        return result;
      } finally {
        endTimer();
      }
    };
  }

  measureSync<T extends any[], R>(
    name: string,
    fn: (...args: T) => R,
    tags?: Record<string, string>
  ): (...args: T) => R {
    return (...args: T): R => {
      const endTimer = this.startTimer(name, tags);
      try {
        const result = fn(...args);
        return result;
      } finally {
        endTimer();
      }
    };
  }

  // Clear metrics
  clearMetrics(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }

  // Enable/disable monitoring
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  isMonitoringEnabled(): boolean {
    return this.isEnabled;
  }

  // Export metrics for external monitoring systems
  exportMetrics(): Record<string, any> {
    return {
      timestamp: Date.now(),
      metrics: this.getAllStats(),
      enabled: this.isEnabled
    };
  }

  // Print summary to console
  printSummary(): void {
    console.log('\n📊 PERFORMANCE METRICS SUMMARY');
    console.log('===============================');
    
    const stats = this.getAllStats();
    const sortedKeys = Object.keys(stats).sort();
    
    for (const key of sortedKeys) {
      const stat = stats[key];
      if (stat) {
        console.log(`\n${key}:`);
        console.log(`  Count: ${stat.count}`);
        console.log(`  Min: ${stat.min.toFixed(2)}ms`);
        console.log(`  Max: ${stat.max.toFixed(2)}ms`);
        console.log(`  Avg: ${stat.avg.toFixed(2)}ms`);
        console.log(`  P50: ${stat.p50.toFixed(2)}ms`);
        console.log(`  P95: ${stat.p95.toFixed(2)}ms`);
        console.log(`  P99: ${stat.p99.toFixed(2)}ms`);
      }
    }
  }
}

// Global instance
export const performanceMonitor = PerformanceMonitor.getInstance();
