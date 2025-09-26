// Optimized HTTP client with connection pooling for better performance
import https from 'https';
import http from 'http';
import { URL } from 'url';

export interface HttpRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export class OptimizedHttpClient {
  private keepAliveAgent: https.Agent;
  private httpAgent: http.Agent;
  
  constructor() {
    // HTTPS agent with connection pooling
    this.keepAliveAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 20, // Increased from default 15
      maxFreeSockets: 10, // Keep more free connections
      timeout: 60000,
      keepAliveMsecs: 30000, // Keep connections alive for 30s
      scheduling: 'fifo' // First in, first out for fairness
    });
    
    // HTTP agent for non-HTTPS requests
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 20,
      maxFreeSockets: 10,
      timeout: 60000,
      keepAliveMsecs: 30000
    });
  }

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const url = new URL(options.url);
    const isHttps = url.protocol === 'https:';
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method,
      headers: {
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Lighter-TypeScript-SDK/1.0.0',
        ...options.headers
      },
      agent: isHttps ? this.keepAliveAgent : this.httpAgent,
      timeout: options.timeout || 10000
    };

    return new Promise((resolve, reject) => {
      const req = (isHttps ? https : http).request(requestOptions, (res) => {
        let body = '';
        
        res.setEncoding('utf8');
        
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') {
              headers[key] = value;
            } else if (Array.isArray(value)) {
              headers[key] = value.join(', ');
            }
          }
          
          resolve({
            statusCode: res.statusCode || 0,
            headers,
            body
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  // Convenience methods
  async get(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'GET', url, headers: headers || {} });
  }

  async post(url: string, body: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ 
      method: 'POST', 
      url, 
      body, 
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        ...headers
      }
    });
  }

  async put(url: string, body: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ 
      method: 'PUT', 
      url, 
      body, 
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        ...headers
      }
    });
  }

  async delete(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', url, headers: headers || {} });
  }

  // Cleanup method
  destroy(): void {
    this.keepAliveAgent.destroy();
    this.httpAgent.destroy();
  }

  // Get connection pool stats for monitoring
  getConnectionStats(): { https: any; http: any } {
    return {
      https: {
        totalSockets: (this.keepAliveAgent as any).totalSockets || 0,
        freeSockets: this.keepAliveAgent.freeSockets,
        sockets: this.keepAliveAgent.sockets,
        requests: this.keepAliveAgent.requests
      },
      http: {
        totalSockets: (this.httpAgent as any).totalSockets || 0,
        freeSockets: this.httpAgent.freeSockets,
        sockets: this.httpAgent.sockets,
        requests: this.httpAgent.requests
      }
    };
  }
}

// Singleton instance for reuse across the application
export const httpClient = new OptimizedHttpClient();

