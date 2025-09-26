// WebSocket-based order client for real-time order placement using Lighter WebSocket API
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { performanceMonitor } from '../utils/performance-monitor';

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
    tx_types: number[];
    tx_infos: string[]; // Array of JSON strings from WASM signer
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
      ...config
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use the official Lighter WebSocket endpoint
        const wsUrl = this.config.url.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log('✅ WebSocket order client connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error: Error) => {
          console.error('❌ WebSocket order client error:', error);
          this.emit('error', error);
          if (!this.isConnected) {
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: string) => {
          console.log(`🔌 WebSocket order client closed: ${code} ${reason}`);
          this.isConnected = false;
          this.stopHeartbeat();
          this.emit('disconnected', { code, reason });
          this.scheduleReconnect();
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            this.ws?.terminate();
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.config.timeout);

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const response: WsOrderResponse = JSON.parse(data.toString());
      
      // Handle heartbeat response
      if (response.type === 'PONG') {
        return;
      }

      // Handle order response
      if (response.id) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);

          if (response.success) {
            pending.resolve(response.result);
          } else {
            pending.reject(new Error(response.error || 'Unknown error'));
          }
        }
      } else {
        // Emit unhandled responses
        this.emit('response', response);
      }
    } catch (error) {
      console.error('❌ Failed to parse WebSocket message:', error);
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
      console.error('❌ Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts} in ${this.config.reconnectInterval}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(console.error);
    }, this.config.reconnectInterval);
  }

  async sendTransaction(txType: number, txInfo: string): Promise<LighterWsTransaction> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const endTimer = performanceMonitor.startTimer('ws_send_tx', {
      txType: txType.toString()
    });

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
      endTimer();
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

    const endTimer = performanceMonitor.startTimer('ws_send_batch_tx', {
      batchSize: txTypes.length.toString()
    });

    try {
      const requestId = `batch_${Date.now()}_${++this.messageId}`;
      
      const request: WsOrderRequest = {
        id: requestId,
        type: 'SEND_BATCH_TX',
        data: {
          type: 'jsonapi/sendtxbatch',
          data: {
            tx_types: txTypes,
            tx_infos: txInfos
          }
        },
        timestamp: Date.now()
      };

      const result = await this.sendRequest(request);
      return result as LighterWsTransaction[];
    } finally {
      endTimer();
    }
  }

  async batchOrders(orders: any[]): Promise<any[]> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const endTimer = performanceMonitor.startTimer('ws_batch_orders', {
      count: orders.length.toString()
    });

    try {
      const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const request: WsOrderRequest = {
        id: requestId,
        type: 'SEND_BATCH_TX',
        data: {
          type: 'jsonapi/sendtxbatch',
          data: {
            tx_types: orders.map(() => 14), // TX_TYPE_CREATE_ORDER for all
            tx_infos: orders // Assuming orders are already signed tx_infos
          }
        },
        timestamp: Date.now()
      };

      const result = await this.sendRequest(request);
      return result;
    } finally {
      endTimer();
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

      // Send request
      try {
        this.ws!.send(JSON.stringify(request));
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
      for (const [, pending] of this.pendingRequests.entries()) {
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
