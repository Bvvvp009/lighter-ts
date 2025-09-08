import WebSocket from 'ws';
import { WebSocketConfig, WebSocketSubscription } from '../types';

export class WsClient {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, WebSocketSubscription> = new Map();
  private isConnecting = false;
  private isConnected = false;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 5,
      ...config,
    };
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || this.isConnected) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.on('open', () => {
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.config.onOpen?.();

          // Resubscribe to all channels
          this.resubscribeAll();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.config.onMessage?.(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        });

        this.ws.on('error', (error: Error) => {
          this.isConnecting = false;
          this.config.onError?.(error);
          reject(error);
        });

        this.ws.on('close', () => {
          this.isConnected = false;
          this.config.onClose?.();
          this.attemptReconnect();
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
  }

  public subscribe(subscription: WebSocketSubscription): void {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket is not connected');
    }

    const message = {
      method: 'subscribe',
      params: {
        channel: subscription.channel,
        ...subscription.params,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.subscriptions.set(subscription.channel, subscription);
  }

  public unsubscribe(channel: string): void {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket is not connected');
    }

    const message = {
      method: 'unsubscribe',
      params: {
        channel,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.subscriptions.delete(channel);
  }

  public send(message: any): void {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 5)) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
        this.attemptReconnect();
      });
    }, this.config.reconnectInterval || 5000);
  }

  private resubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      this.subscribe(subscription);
    }
  }

  public isConnectedToWebSocket(): boolean {
    return this.isConnected;
  }

  public getSubscriptions(): WebSocketSubscription[] {
    return Array.from(this.subscriptions.values());
  }
}