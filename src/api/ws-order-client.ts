// WebSocket-based order client for real-time order placement using Lighter WebSocket API
import WebSocket from 'ws';
import { EventEmitter } from 'events';
// Performance monitoring removed

// Lighter WebSocket API interfaces based on official documentation
export interface LighterWsSendTx {
  type: 'jsonapi/sendtx';
  data: {
    tx_type: number;
    tx_info: string; // JSON string from WASM signer
  };
}

export interface LighterWsSendBatchTx {
  type: 'jsonapi/sendtxbatch';
  data: {
    tx_types: string; // JSON stringified array of transaction types (like REST API)
    tx_infos: string; // JSON stringified array of transaction infos (like REST API)
  };
}

export interface LighterWsTransaction {
  hash: string;
  type: number;
  info: string;
  event_info: string;
  status: number;
  transaction_index: number;
  l1_address: string;
  account_index: number;
  nonce: number;
  expire_at: number;
  block_height: number;
  queued_at: number;
  executed_at: number;
  sequence_index: number;
  parent_hash: string;
}

export interface WsOrderRequest {
  id: string;
  type: 'SEND_TX' | 'SEND_BATCH_TX';
  data: LighterWsSendTx | LighterWsSendBatchTx;
  timestamp: number;
}

export interface WsOrderResponse {
  id?: string;
  success: boolean;
  result?: LighterWsTransaction | LighterWsTransaction[];
  error?: string;
  timestamp: number;
  type?: string;
}

export interface WsConnectionConfig {
  url: string;
  /**
   * WebSocket endpoint path used for order/transaction JSON API.
   * Many deployments expose market data at `/stream` and JSON TX API at `/jsonapi`.
   * Default: `/jsonapi`
   */
  endpointPath?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  timeout?: number;
}

export class WebSocketOrderClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WsConnectionConfig;
  private isConnected = false;
  private reconnectAttempts = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    timestamp: number;
  }>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageId = 0;

  constructor(config: WsConnectionConfig) {
    super();
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      timeout: 10000,
      endpointPath: '/jsonapi',
      ...config
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL candidates:
        // - If url is already ws(s)://, treat it as full WS URL (no extra path)
        // - Else, if endpointPath explicitly provided: use only that
        // - Else, try `/jsonapi` then fall back to `/stream`
        const isWsUrl = this.config.url.startsWith('ws://') || this.config.url.startsWith('wss://');
        const base = isWsUrl
          ? this.config.url.replace(/\/+$/, '')
          : this.config.url.replace('https://', 'wss://').replace('http://', 'ws://').replace(/\/+$/, '');
        const normalizePath = (p: string) => (p.startsWith('/') ? p : `/${p}`);
        const explicitPath = isWsUrl
          ? '' // already a complete ws URL
          : (this.config.endpointPath ? normalizePath(this.config.endpointPath) : undefined);
        const candidates = explicitPath !== undefined ? [explicitPath] : (isWsUrl ? [''] : ['/jsonapi', '/stream']);

        let attemptIndex = 0;
        const attemptConnect = () => {
          const path = candidates[attemptIndex];
          const wsUrl = `${base}${path}`;
          this.ws = new WebSocket(wsUrl);

          const handleOpen = () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.emit('connected');
            cleanupListeners();
            resolve();
          };

          const handleMessage = (data: WebSocket.Data) => {
            this.handleMessage(data);
          };

          const handleError = (error: Error) => {
            // Check for 404 errors in multiple formats
            const errorMsg = error.message || String(error);
            const errorCode = (error as any).code;
            const is404 = errorMsg.includes('404') || 
                         errorMsg.includes('Unexpected server response: 404') ||
                         errorCode === 404 ||
                         errorMsg.includes('Not Found');
            
            // If not connected and 404 occurred, try next candidate when endpointPath not explicitly set
            const canFallback = !explicitPath && is404 && attemptIndex < candidates.length - 1;
            if (canFallback) {
              attemptIndex += 1;
              // Close current socket if any and try next
              try { 
                if (this.ws) {
                  this.ws.removeAllListeners();
                  this.ws.terminate();
                  this.ws = null;
                }
              } catch {}
              // Small delay before retry
              setTimeout(() => attemptConnect(), 100);
              return;
            }
            this.emit('error', error);
            if (!this.isConnected) {
              cleanupListeners();
              reject(error);
            }
          };

          const handleClose = (code: number, reason: string) => {
            this.isConnected = false;
            this.stopHeartbeat();
            this.emit('disconnected', { code, reason });
            cleanupListeners();
            this.scheduleReconnect();
          };

          const cleanupListeners = () => {
            if (!this.ws) return;
            this.ws.removeListener('open', handleOpen);
            this.ws.removeListener('message', handleMessage);
            this.ws.removeListener('error', handleError);
            this.ws.removeListener('close', handleClose);
          };

          this.ws.on('open', handleOpen);
          this.ws.on('message', handleMessage);
          this.ws.on('error', handleError);
          this.ws.on('close', handleClose);

          // Connection timeout per attempt
          setTimeout(() => {
            if (!this.isConnected && this.ws?.readyState !== WebSocket.OPEN) {
              try { this.ws?.terminate(); } catch {}
              if (!explicitPath && attemptIndex < candidates.length - 1) {
                attemptIndex += 1;
                attemptConnect();
              } else {
                cleanupListeners();
                reject(new Error('WebSocket connection timeout'));
              }
            }
          }, this.config.timeout);
        };

        attemptConnect();

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      // Debug: log received messages
      if (process.env.DEBUG_WS) {
        console.log('[WS DEBUG] Pending requests:', Array.from(this.pendingRequests.keys()));
        console.log('[WS DEBUG] Message type:', message.type || 'unknown');
      }
      
      // Handle heartbeat response
      if (message.type === 'PONG' || message.type === 'pong') {
        return;
      }

      // Handle error responses (may or may not have id)
      if (message.error) {
        const errorMsg = typeof message.error === 'object' 
          ? message.error.message || JSON.stringify(message.error)
          : message.error;
        const errorCode = message.error?.code || 'UNKNOWN';
        
        // Try to match with pending request by id
        if (message.id) {
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(message.id);
            pending.reject(new Error(`[${errorCode}] ${errorMsg}`));
            return;
          }
        }
        
        // If no id, try to match with oldest pending request
        if (this.pendingRequests.size > 0) {
          const oldestKey = Array.from(this.pendingRequests.keys())[0];
          const oldestRequest = this.pendingRequests.get(oldestKey)!;
          clearTimeout(oldestRequest.timeout);
          this.pendingRequests.delete(oldestKey);
          oldestRequest.reject(new Error(`[${errorCode}] ${errorMsg}`));
          return;
        }
        
        // No pending requests, emit as error event
        this.emit('error', new Error(`[${errorCode}] ${errorMsg}`));
        return;
      }

      // Handle order response - check if it has an id field for request matching
      if (message.id) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);

          // Check if response has success/error structure or is direct transaction result
          if ('success' in message) {
            if (message.success) {
              pending.resolve(message.result);
            } else {
              pending.reject(new Error(message.error || 'Unknown error'));
            }
          } else if ('hash' in message) {
            // Direct transaction result (LighterWsTransaction)
            pending.resolve(message);
          } else if (Array.isArray(message) && message.length > 0 && 'hash' in message[0]) {
            // Array of transaction results (batch)
            pending.resolve(message);
          } else {
            // Unknown format, resolve with the message itself
            pending.resolve(message);
          }
        }
      } else if ('hash' in message || (Array.isArray(message) && message.length > 0 && 'hash' in message[0])) {
        // Transaction result without id - try to match with oldest pending request
        // This handles cases where server doesn't echo back the id
        if (this.pendingRequests.size > 0) {
          const oldestKey = Array.from(this.pendingRequests.keys())[0];
          const oldestRequest = this.pendingRequests.get(oldestKey)!;
          clearTimeout(oldestRequest.timeout);
          this.pendingRequests.delete(oldestKey);
          oldestRequest.resolve(message);
        } else {
          this.emit('response', message);
        }
      } else {
        // Emit unhandled responses
        this.emit('response', message);
      }
    } catch (error) {
      // Silently ignore parse errors
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, this.config.reconnectInterval);
  }

  async sendTransaction(txType: number, txInfo: string): Promise<LighterWsTransaction> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    // Performance monitoring removed

    try {
      const requestId = `tx_${Date.now()}_${++this.messageId}`;
      
      const request: WsOrderRequest = {
        id: requestId,
        type: 'SEND_TX',
        data: {
          type: 'jsonapi/sendtx',
          data: {
            tx_type: txType,
            tx_info: txInfo
          }
        },
        timestamp: Date.now()
      };

      const result = await this.sendRequest(request);
      return result as LighterWsTransaction;
    } finally {
    }
  }

  async sendBatchTransactions(txTypes: number[], txInfos: string[]): Promise<LighterWsTransaction[]> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    if (txTypes.length !== txInfos.length) {
      throw new Error('txTypes and txInfos arrays must have the same length');
    }

    if (txTypes.length > 50) {
      throw new Error('Batch size cannot exceed 50 transactions');
    }

    // Performance monitoring removed

    try {
      const requestId = `batch_${Date.now()}_${++this.messageId}`;
      
      const request: WsOrderRequest = {
        id: requestId,
        type: 'SEND_BATCH_TX',
        data: {
          type: 'jsonapi/sendtxbatch',
          data: {
            tx_types: JSON.stringify(txTypes), // Server expects JSON string like REST API
            tx_infos: JSON.stringify(txInfos)  // Server expects JSON string like REST API
          }
        },
        timestamp: Date.now()
      };

      const result = await this.sendRequest(request);
      return result as LighterWsTransaction[];
    } finally {
    }
  }

  async batchOrders(orders: any[]): Promise<any[]> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    // Performance monitoring removed

    try {
      const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const request: WsOrderRequest = {
        id: requestId,
        type: 'SEND_BATCH_TX',
        data: {
          type: 'jsonapi/sendtxbatch',
          data: {
            // Server expects JSON string for both fields (same as REST form encoding)
            tx_types: JSON.stringify(orders.map(() => 14)), // TX_TYPE_CREATE_ORDER for all
            tx_infos: JSON.stringify(orders) // Assuming orders are already signed tx_info strings
          }
        },
        timestamp: Date.now()
      };

      const result = await this.sendRequest(request);
      return result;
    } finally {
    }
  }

  private sendRequest(request: WsOrderRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout: ${request.id}`));
      }, this.config.timeout);

      // Store pending request
      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now()
      });

      // Send request - server expects the message in the format: { type: 'jsonapi/sendtx', data: { id, tx_type, tx_info } }
      // Note: id goes INSIDE data, and tx_info should be parsed JSON object (not string)
      try {
        const dataPayload: any = {
          id: request.id, // ID goes INSIDE data object
          ...(request.data as any).data
        };
        
        // Parse tx_info from JSON string to object if needed
        if (dataPayload.tx_info) {
          if (typeof dataPayload.tx_info === 'string') {
            try {
              const parsed = JSON.parse(dataPayload.tx_info);
              dataPayload.tx_info = parsed;
              if (process.env.DEBUG_WS) {
                console.log('[WS DEBUG] Parsed tx_info from string to object');
              }
            } catch (e) {
              // If parsing fails, keep as string
              if (process.env.DEBUG_WS) {
                console.warn('[WS DEBUG] Failed to parse tx_info as JSON:', e);
              }
            }
          } else if (process.env.DEBUG_WS) {
            console.log('[WS DEBUG] tx_info is already an object');
          }
        }
        
        // Parse tx_infos array from JSON strings to objects (for batch)
        if (dataPayload.tx_infos && typeof dataPayload.tx_infos === 'string') {
          try {
            const parsed = JSON.parse(dataPayload.tx_infos);
            if (Array.isArray(parsed)) {
              dataPayload.tx_infos = parsed.map((ti: string) => {
                try {
                  return typeof ti === 'string' ? JSON.parse(ti) : ti;
                } catch {
                  return ti;
                }
              });
            }
          } catch (e) {
            // If parsing fails, keep as string
          }
        }
        
        const messageToSend: any = {
          type: request.data.type,
          data: dataPayload
        };
        const messageStr = JSON.stringify(messageToSend);
        // Debug: log the message being sent (truncate tx_info for readability)
        if (process.env.DEBUG_WS) {
          const debugMsg = JSON.parse(messageStr);
          if (debugMsg.data?.tx_info) {
            const txInfoStr = typeof debugMsg.data.tx_info === 'string' 
              ? debugMsg.data.tx_info 
              : JSON.stringify(debugMsg.data.tx_info);
            debugMsg.data.tx_info = txInfoStr.substring(0, 100) + '...';
          }
          if (debugMsg.data?.tx_infos) {
            debugMsg.data.tx_infos = debugMsg.data.tx_infos.map((ti: any) => {
              const tiStr = typeof ti === 'string' ? ti : JSON.stringify(ti);
              return tiStr.substring(0, 100) + '...';
            });
          }
        }
        this.ws!.send(messageStr);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(request.id);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      this.stopHeartbeat();

      // Reject all pending requests
      for (const [, pending] of Array.from(this.pendingRequests.entries())) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('WebSocket disconnected'));
      }
      this.pendingRequests.clear();

      if (this.ws) {
        this.ws.on('close', () => {
          this.ws = null;
          this.isConnected = false;
          resolve();
        });
        this.ws.close();
      } else {
        resolve();
      }
    });
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionStats(): {
    isConnected: boolean;
    pendingRequests: number;
    reconnectAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      pendingRequests: this.pendingRequests.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}
