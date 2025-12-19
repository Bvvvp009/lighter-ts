import WebSocket from 'ws';
import { WebSocketConfig, WebSocketSubscription, ProxyConfig } from '../types';

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

  private createProxyAgent(proxyConfig: ProxyConfig): any {
    try {
      // Try to load proxy agent libraries (optional dependencies)
      const protocol = proxyConfig.protocol || 'http';
      
      if (protocol === 'https' || protocol === 'http') {
        // For HTTP/HTTPS proxies
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const proxyUrl = proxyConfig.auth
          ? `${protocol}://${proxyConfig.auth.username}:${proxyConfig.auth.password}@${proxyConfig.host}:${proxyConfig.port}`
          : `${protocol}://${proxyConfig.host}:${proxyConfig.port}`;
        return new HttpsProxyAgent(proxyUrl);
      } else if (protocol === 'socks4' || protocol === 'socks5') {
        // For SOCKS proxies
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const proxyUrl = proxyConfig.auth
          ? `${protocol}://${proxyConfig.auth.username}:${proxyConfig.auth.password}@${proxyConfig.host}:${proxyConfig.port}`
          : `${protocol}://${proxyConfig.host}:${proxyConfig.port}`;
        return new SocksProxyAgent(proxyUrl);
      }
    } catch (error) {
      throw new Error(
        `Proxy agent library not found. Install 'https-proxy-agent' for HTTP/HTTPS proxies or 'socks-proxy-agent' for SOCKS proxies. Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return undefined;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || this.isConnected) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        const wsOptions: any = {};
        
        // Add proxy agent if configured
        if (this.config.proxy) {
          try {
            wsOptions.agent = this.createProxyAgent(this.config.proxy);
          } catch (error) {
            this.isConnecting = false;
            reject(error);
            return;
          }
        }

        this.ws = new WebSocket(this.config.url, wsOptions);

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