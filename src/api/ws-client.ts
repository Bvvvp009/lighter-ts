import WebSocket from 'ws';
// @ts-ignore - ws module declaration
import { WebSocketConfig, WebSocketSubscription } from '../types';

export interface AccountAllSubscriptionParams {
  accountIndex: number;
  apiKeyIndex?: number;
  auth?: string;
}

export interface WsAccountAllPosition {
  market_id?: number;
  side?: 'long' | 'short' | string;
  size?: string;
  entry_price?: string;
  mark_price?: string;
  unrealized_pnl?: string;
  realized_pnl?: string;
  total_funding_paid_out?: string;
  [key: string]: any;
}

export interface WsAccountAllMessage {
  channel?: 'account_all' | string;
  account_index?: number;
  positions?: WsAccountAllPosition[];
  [key: string]: any;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
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

      this.shouldReconnect = true;
      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.config.url);

        this.ws!.on('open', () => {
          this.isConnecting = false;
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.config.onOpen?.();

          // Resubscribe to all channels
          this.resubscribeAll();
          resolve();
        });

        this.ws!.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.config.onMessage?.(message);
          } catch (error) {
            // Silently ignore parse errors
          }
        });

        this.ws!.on('error', (error: Error) => {
          this.isConnecting = false;
          this.config.onError?.(error);
          reject(error);
        });

        this.ws!.on('close', () => {
          this.isConnected = false;
          this.config.onClose?.();
          if (this.shouldReconnect) {
            this.attemptReconnect();
          }
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  public disconnect(): void {
    this.shouldReconnect = false;

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

    // Use the same format as send() method for consistency
    const message = {
      type: 'subscribe',
      channel: subscription.channel,
      ...subscription.params,
    };

    this.ws.send(JSON.stringify(message));
    this.subscriptions.set(subscription.channel, subscription);
  }

  public unsubscribe(channel: string): void {
    if (!this.isConnected || !this.ws) {
      throw new Error('WebSocket is not connected');
    }

    // Use the same format as send() method for consistency
    const message = {
      type: 'unsubscribe',
      channel,
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

  /**
   * Subscribe to account_all updates.
   * This channel can include total_funding_paid_out per position.
   */
  public subscribeAccountAll(params: AccountAllSubscriptionParams): void {
    const subParams: Record<string, any> = {
      account_index: params.accountIndex,
    };

    if (params.apiKeyIndex !== undefined) {
      subParams.api_key_index = params.apiKeyIndex;
    }
    if (params.auth) {
      subParams.auth = params.auth;
    }

    this.subscribe({
      channel: 'account_all',
      params: subParams,
    });
  }

  public unsubscribeAccountAll(): void {
    this.unsubscribe('account_all');
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 5)) {
      return;
    }

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        this.attemptReconnect();
      });
    }, this.config.reconnectInterval || 5000);
  }

  private resubscribeAll(): void {
    const subscriptions = Array.from(this.subscriptions.values());
    for (const subscription of subscriptions) {
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