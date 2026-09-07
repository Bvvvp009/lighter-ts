import { EventEmitter } from 'events';
import { WsClient } from '../api/ws-client';
import { resolveNetworkFromEnv, resolveWsUrl, type Network } from '../network';
import type { WsMessage } from './ws-events';
import {
  orderBookChannel,
  tickerChannel,
  marketStatsChannel,
  tradeChannel,
  candleChannel,
  markPriceCandleChannel,
  accountAllChannel,
  accountMarketChannel,
  accountOrdersChannel,
  accountAllOrdersChannel,
  accountAllTradesChannel,
  accountAllPositionsChannel,
  accountAllAssetsChannel,
  accountTxChannel,
  userStatsChannel,
  notificationChannel,
  heightChannel,
} from './ws-events';
import type {
  WsOrderBookMessage,
  WsTickerMessage,
  WsMarketStatsMessage,
  WsTradeMessage,
  WsCandleMessage,
  WsMarkPriceCandleMessage,
  WsAccountAllMessage,
  WsAccountMarketMessage,
  WsAccountOrdersMessage,
  WsAccountAllOrdersMessage,
  WsAccountAllTradesMessage,
  WsAccountAllPositionsMessage,
  WsAccountAllAssetsMessage,
  WsAccountTxMessage,
  WsUserStatsMessage,
  WsNotificationMessage,
  WsHeightMessage,
} from './ws-events';

/**
 * Auth token provider — either a `SignerClient` (generates tokens via WASM)
 * or a static token string.
 */
export interface AuthTokenProvider {
  /** Returns a valid auth token string. */
  getToken(): Promise<string>;
}

/**
 * Configuration for WsPrivateClient.
 */
export interface WsPrivateClientConfig {
  /** Full WS URL (e.g. `wss://mainnet.zklighter.elliot.ai/stream`). */
  url: string;
  /** Auth token provider for private channels. Optional for public-only use. */
  auth?: AuthTokenProvider;
  /** Account ID for private channel subscriptions. Required if auth is set. */
  accountId?: number;
  /** Reconnect interval in ms (default 5000). */
  reconnectInterval?: number;
  /** Max reconnect attempts (default 10). */
  maxReconnectAttempts?: number;
  /** Ping interval in ms — server requires a frame every 2 min (default 90000). */
  pingInterval?: number;
  /** Timeout in ms for jsonapi tx submissions (default 10000). */
  txTimeoutMs?: number;
}

// ============================================================================
// jsonapi transaction submission (verified live on mainnet + Robinhood)
// ============================================================================

/** Response to a jsonapi/sendtx or jsonapi/sendtxbatch message. */
export interface WsTxResponse {
  /** Request id we assigned (echoed by the server). */
  id?: string;
  /** 200 on success. */
  code?: number;
  /** Single tx: hash string. Batch: array of hash strings. */
  tx_hash?: string | string[];
  /** Server-side execution time estimate. */
  predicted_execution_time_ms?: number;
  /** Present on failure: {"code": 21501, "message": "invalid tx info"}. */
  error?: { code?: number | string; message?: string };
  /** Echoes 'jsonapi/sendtx' or 'jsonapi/sendtxbatch'. */
  type?: string;
}

interface PendingTxRequest {
  resolve: (value: WsTxResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
}

/**
 * A typed subscription handle. Use `.on('update', cb)` to receive typed messages.
 */
export class WsSubscription<T extends WsMessage> extends EventEmitter {
  constructor(
    public readonly channel: string,
    public readonly isPrivate: boolean,
  ) {
    super();
  }
}

/**
 * WsPrivateClient extends WsClient with:
 * - Auth token auto-generation and refresh (via SignerClient or static token)
 * - Ping keepalive (server requires a frame every 2 min)
 * - Typed subscription helpers for every public and private channel
 * - Per-channel EventEmitter so consumers get typed messages via `.on('update', cb)`
 * - Auto re-subscribe with fresh auth token on reconnect
 * - jsonapi/sendtx + jsonapi/sendtxbatch submission (one socket for
 *   subscriptions AND order transactions, matching lighter-python)
 */

/** Parse JSON, returning the original string on failure. */
function safeParseJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
export class WsPrivateClient extends WsClient {
  private auth?: AuthTokenProvider;
  private accountId?: number;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingIntervalMs: number;
  private txTimeoutMs: number;
  /** channel string → WsSubscription */
  private typedSubscriptions = new Map<string, WsSubscription<any>>();
  /** Pending jsonapi tx requests, keyed by the id we assigned. */
  private pendingTxRequests = new Map<string, PendingTxRequest>();
  private txRequestId = 0;

  constructor(config: WsPrivateClientConfig) {
    super({
      url: config.url,
      reconnectInterval: config.reconnectInterval ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      onMessage: (msg: any) => this.routeMessage(msg),
    });
    if (config.auth !== undefined) this.auth = config.auth;
    if (config.accountId !== undefined) this.accountId = config.accountId;
    this.pingIntervalMs = config.pingInterval ?? 90000;
    this.txTimeoutMs = config.txTimeoutMs ?? 10000;
  }

  // --------------------------------------------------------------------------
  // Connection lifecycle
  // --------------------------------------------------------------------------

  /**
   * Connect to the WS server. After connecting, automatically starts the
   * ping keepalive loop.
   */
  public override async connect(): Promise<void> {
    await super.connect();
    this.startPing();
  }

  /** Disconnect and stop ping. */
  public override disconnect(): void {
    this.stopPing();
    super.disconnect();
  }

  /**
   * Re-subscribe to all channels after a reconnect. Overrides the base
   * `resubscribeAll` to inject a fresh auth token into private channels.
   */
  protected override resubscribeAll(): void {
    // We track our own subscriptions with typed metadata; re-subscribe each.
    for (const [, sub] of this.typedSubscriptions) {
      this.sendSubscribe(sub.channel, sub.isPrivate);
    }
  }

  // --------------------------------------------------------------------------
  // Ping keepalive
  // --------------------------------------------------------------------------

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.isConnectedToWebSocket()) {
        try {
          this.send({ type: 'ping' });
        } catch {
          // socket not open — will reconnect via base client
        }
      }
    }, this.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // jsonapi transaction submission (merged order channel)
  // --------------------------------------------------------------------------

  /**
   * Submit ONE signed transaction over /stream via `jsonapi/sendtx`.
   *
   * Wire format (verified live on mainnet + Robinhood /stream):
   *   {"type":"jsonapi/sendtx","data":{"id":"...","tx_type":16,"tx_info":{...}}}
   * tx_info MUST be a parsed JSON object (not a string).
   * Response: {"code":200,"id","tx_hash","predicted_execution_time_ms"}.
   */
  public async sendTransaction(txType: number, txInfo: string | object): Promise<WsTxResponse> {
    if (!this.isConnectedToWebSocket()) {
      throw new Error('WebSocket is not connected. Call connect() first.');
    }

    const id = `tx_${Date.now()}_${++this.txRequestId}`;
    const txInfoObj = typeof txInfo === 'string' ? safeParseJson(txInfo) : txInfo;

    const message = {
      type: 'jsonapi/sendtx',
      data: { id, tx_type: txType, tx_info: txInfoObj },
    };

    return this.sendTxRequest(message, id);
  }

  /**
   * Submit a batch of signed transactions over /stream via
   * `jsonapi/sendtxbatch`. All txs must belong to the same API key.
   *
   * Wire format (verified live):
   *   {"type":"jsonapi/sendtxbatch","data":{
   *     "id":"...","tx_types":"[14,15]","tx_infos":"[\"{...}\",\"{...}\"]"}}
   * tx_types/tx_infos are JSON STRINGS; tx_infos is double-encoded (each
   * element is itself the JSON string of one tx_info).
   * Response: {"code":200,"id","tx_hash":["...","..."]}.
   */
  public async sendBatchTransactions(txTypes: number[], txInfos: Array<string | object>): Promise<WsTxResponse> {
    if (!this.isConnectedToWebSocket()) {
      throw new Error('WebSocket is not connected. Call connect() first.');
    }
    if (txTypes.length !== txInfos.length) {
      throw new Error('txTypes and txInfos must have the same length');
    }
    if (txTypes.length === 0) {
      throw new Error('Empty batch');
    }
    if (txTypes.length > 15) {
      throw new Error('Batch size exceeds max 15 transactions');
    }

    const id = `batch_${Date.now()}_${++this.txRequestId}`;
    const txInfoStrs = txInfos.map((ti) => (typeof ti === 'string' ? ti : JSON.stringify(ti)));

    const message = {
      type: 'jsonapi/sendtxbatch',
      data: {
        id,
        tx_types: JSON.stringify(txTypes),
        tx_infos: JSON.stringify(txInfoStrs),
      },
    };

    return this.sendTxRequest(message, id);
  }

  /** Number of tx requests awaiting a response. */
  public getPendingTxCount(): number {
    return this.pendingTxRequests.size;
  }

  private sendTxRequest(message: object, id: string): Promise<WsTxResponse> {
    return new Promise<WsTxResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingTxRequests.delete(id);
        reject(new Error(`jsonapi tx request timeout: ${id}`));
      }, this.txTimeoutMs);

      this.pendingTxRequests.set(id, {
        resolve,
        reject,
        timeout,
        timestamp: Date.now(),
      });

      try {
        this.send(message);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingTxRequests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // --------------------------------------------------------------------------
  // Auth token management
  // --------------------------------------------------------------------------

  private async getAuthToken(): Promise<string | undefined> {
    if (!this.auth) return undefined;
    try {
      return await this.auth.getToken();
    } catch {
      return undefined;
    }
  }

  // --------------------------------------------------------------------------
  // Message routing
  // --------------------------------------------------------------------------

  private routeMessage(msg: any): void {
    // Forward to user's raw onMessage if set
    // (base WsClient already calls config.onMessage, but we override it in
    // the constructor to point here, so we don't double-forward)

    // jsonapi tx responses carry our request id at the TOP LEVEL
    // (verified: {"code":200,"id":"probe_sendtx_1","tx_hash":"..."} and
    // {"error":{...},"id":"probe_batch_1"}).
    if (msg && msg.id !== undefined && this.pendingTxRequests.size > 0) {
      const pending = this.pendingTxRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingTxRequests.delete(msg.id);
        if (msg.error) {
          const errCode = msg.error.code ?? 'UNKNOWN';
          const errMsg = typeof msg.error === 'object' ? (msg.error.message ?? JSON.stringify(msg.error)) : String(msg.error);
          pending.reject(new Error(`[${errCode}] ${errMsg}`));
        } else {
          pending.resolve(msg as WsTxResponse);
        }
        return;
      }
    }

    // Route to typed subscription by channel
    if (msg && msg.channel) {
      // WS uses "channel:{id}" format in responses (colon, not slash)
      // We need to match against our registered channels which use "/"
      // Try exact match first, then normalized match
      let sub = this.typedSubscriptions.get(msg.channel);
      if (!sub) {
        // Normalize "order_book:0" → "order_book/0"
      const normalized = this.normalizeChannelName(msg.channel);
        sub = this.typedSubscriptions.get(normalized);
      }
      if (sub) {
        sub.emit('update', msg);
      }
    }

    // Also emit a general 'message' event for catch-all listeners
    this.emit('message', msg);
  }

  /**
   * Convert WS response channel format to subscription format.
   * "order_book:0" → "order_book/0"
   * "account_all:123" → "account_all/123"
   * "candle:0:1m" → "candle/0/1m"
   * "account_orders:0" → "account_orders/0/76" (prefix match — server drops
   *   the account suffix for some channels)
   */
  private normalizeChannelName(channel: string): string {
    // The WS reference uses ":" in responses but "/" in subscriptions.
    // However, some channels like "account_market/{market}/{account}" have
    // two path segments, so we can't just replace all colons.
    // Match by checking all registered subscription channels.
    for (const [subChannel] of this.typedSubscriptions) {
      // Build a regex from the subscription channel: "order_book/0" → "order_book:0"
      const responseForm = subChannel.replace(/\//g, ':');
      // Exact match: "order_book:0" === "order_book:0"
      if (channel === responseForm) {
        return subChannel;
      }
      // Response is a prefix of subscription: "account_orders:0" matches "account_orders:0:76"
      if (responseForm.startsWith(channel + ':')) {
        return subChannel;
      }
    }
    return channel;
  }

  // --------------------------------------------------------------------------
  // Subscribe / unsubscribe (internal)
  // --------------------------------------------------------------------------

  private async sendSubscribe(channel: string, isPrivate: boolean): Promise<void> {
    const msg: any = { type: 'subscribe', channel };
    if (isPrivate) {
      const token = await this.getAuthToken();
      if (token) {
        msg.auth = token;
      }
    }
    this.send(msg);
  }

  /**
   * Subscribe to a channel and return a typed EventEmitter.
   * @param channel - Channel path (e.g. "order_book/0", "account_orders/0/123")
   * @param isPrivate - Whether this channel requires an auth token
   */
  public async subscribeTyped<T extends WsMessage>(
    channel: string,
    isPrivate: boolean,
  ): Promise<WsSubscription<T>> {
    if (!this.isConnectedToWebSocket()) {
      throw new Error('WebSocket is not connected. Call connect() first.');
    }

    // If already subscribed, return existing handle
    const existing = this.typedSubscriptions.get(channel);
    if (existing) {
      return existing as WsSubscription<T>;
    }

    const sub = new WsSubscription<T>(channel, isPrivate);
    this.typedSubscriptions.set(channel, sub);
    await this.sendSubscribe(channel, isPrivate);
    return sub;
  }

  /**
   * Unsubscribe from a typed channel.
   */
  public unsubscribeTyped(channel: string): void {
    const sub = this.typedSubscriptions.get(channel);
    if (sub) {
      sub.removeAllListeners();
      this.typedSubscriptions.delete(channel);
    }
    if (this.isConnectedToWebSocket()) {
      this.send({ type: 'unsubscribe', channel });
    }
  }

  /** Get all active typed subscriptions. */
  public getTypedSubscriptions(): WsSubscription<any>[] {
    return Array.from(this.typedSubscriptions.values());
  }

  // --------------------------------------------------------------------------
  // Public channel helpers
  // --------------------------------------------------------------------------

  /** Subscribe to `order_book/{marketId}`. */
  public async subscribeOrderBook(marketId: number): Promise<WsSubscription<WsOrderBookMessage>> {
    return this.subscribeTyped<WsOrderBookMessage>(orderBookChannel(marketId), false);
  }

  /** Subscribe to `ticker/{marketId}` (BBO). */
  public async subscribeTicker(marketId: number): Promise<WsSubscription<WsTickerMessage>> {
    return this.subscribeTyped<WsTickerMessage>(tickerChannel(marketId), false);
  }

  /** Subscribe to `market_stats/{marketId}` (includes best_ask_price, best_bid_price). */
  public async subscribeMarketStats(marketId: number): Promise<WsSubscription<WsMarketStatsMessage>> {
    return this.subscribeTyped<WsMarketStatsMessage>(marketStatsChannel(marketId), false);
  }

  /** Subscribe to `trade/{marketId}`. */
  public async subscribeTrade(marketId: number): Promise<WsSubscription<WsTradeMessage>> {
    return this.subscribeTyped<WsTradeMessage>(tradeChannel(marketId), false);
  }

  /** Subscribe to `candle/{marketId}/{resolution}`. */
  public async subscribeCandle(marketId: number, resolution: string): Promise<WsSubscription<WsCandleMessage>> {
    return this.subscribeTyped<WsCandleMessage>(candleChannel(marketId, resolution), false);
  }

  /** Subscribe to `mark_price_candle/{marketId}/{resolution}`. */
  public async subscribeMarkPriceCandle(
    marketId: number,
    resolution: string,
  ): Promise<WsSubscription<WsMarkPriceCandleMessage>> {
    return this.subscribeTyped<WsMarkPriceCandleMessage>(
      markPriceCandleChannel(marketId, resolution),
      false,
    );
  }

  /** Subscribe to `height` (block height updates). */
  public async subscribeHeight(): Promise<WsSubscription<WsHeightMessage>> {
    return this.subscribeTyped<WsHeightMessage>(heightChannel(), false);
  }

  // --------------------------------------------------------------------------
  // Private channel helpers (require auth)
  // --------------------------------------------------------------------------

  /** Subscribe to `account_all/{accountId}` — full account snapshot + updates. */
  public async subscribeAccountAllTyped(accountId?: number): Promise<WsSubscription<WsAccountAllMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_all subscription');
    return this.subscribeTyped<WsAccountAllMessage>(accountAllChannel(id), true);
  }

  /** Subscribe to `account_market/{marketId}/{accountId}` — per-market orders+position+trades. */
  public async subscribeAccountMarket(
    marketId: number,
    accountId?: number,
  ): Promise<WsSubscription<WsAccountMarketMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_market subscription');
    return this.subscribeTyped<WsAccountMarketMessage>(accountMarketChannel(marketId, id), true);
  }

  /** Subscribe to `account_orders/{marketId}/{accountId}` — per-market order status updates. */
  public async subscribeAccountOrders(
    marketId: number,
    accountId?: number,
  ): Promise<WsSubscription<WsAccountOrdersMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_orders subscription');
    return this.subscribeTyped<WsAccountOrdersMessage>(accountOrdersChannel(marketId, id), true);
  }

  /** Subscribe to `account_all_orders/{accountId}` — all orders across markets. */
  public async subscribeAccountAllOrders(accountId?: number): Promise<WsSubscription<WsAccountAllOrdersMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_all_orders subscription');
    return this.subscribeTyped<WsAccountAllOrdersMessage>(accountAllOrdersChannel(id), true);
  }

  /** Subscribe to `account_all_trades/{accountId}` — all fills for the account. */
  public async subscribeAccountAllTrades(
    accountId?: number,
  ): Promise<WsSubscription<WsAccountAllTradesMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_all_trades subscription');
    return this.subscribeTyped<WsAccountAllTradesMessage>(accountAllTradesChannel(id), true);
  }

  /** Subscribe to `account_all_positions/{accountId}` — position tracking. */
  public async subscribeAccountAllPositions(
    accountId?: number,
  ): Promise<WsSubscription<WsAccountAllPositionsMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_all_positions subscription');
    return this.subscribeTyped<WsAccountAllPositionsMessage>(accountAllPositionsChannel(id), true);
  }

  /** Subscribe to `account_all_assets/{accountId}` — spot asset balances. */
  public async subscribeAccountAllAssets(
    accountId?: number,
  ): Promise<WsSubscription<WsAccountAllAssetsMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_all_assets subscription');
    return this.subscribeTyped<WsAccountAllAssetsMessage>(accountAllAssetsChannel(id), true);
  }

  /** Subscribe to `account_tx/{accountId}` — transaction status updates. */
  public async subscribeAccountTx(accountId?: number): Promise<WsSubscription<WsAccountTxMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for account_tx subscription');
    return this.subscribeTyped<WsAccountTxMessage>(accountTxChannel(id), true);
  }

  /** Subscribe to `user_stats/{accountId}` — account stats (collateral, leverage). */
  public async subscribeUserStats(accountId?: number): Promise<WsSubscription<WsUserStatsMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for user_stats subscription');
    return this.subscribeTyped<WsUserStatsMessage>(userStatsChannel(id), false);
  }

  /** Subscribe to `notification/{accountId}` — liquidation/deleverage alerts. */
  public async subscribeNotifications(accountId?: number): Promise<WsSubscription<WsNotificationMessage>> {
    const id = accountId ?? this.accountId;
    if (id === undefined) throw new Error('accountId is required for notification subscription');
    return this.subscribeTyped<WsNotificationMessage>(notificationChannel(id), true);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Disconnect, unsubscribe all typed channels, reject pending tx requests,
   * and clean up.
   */
  public async destroy(): Promise<void> {
    this.stopPing();
    for (const [, sub] of this.typedSubscriptions) {
      sub.removeAllListeners();
    }
    this.typedSubscriptions.clear();
    for (const [, pending] of this.pendingTxRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WebSocket disconnected'));
    }
    this.pendingTxRequests.clear();
    this.disconnect();
  }
}

// ----------------------------------------------------------------------------
// Convenience: AuthTokenProvider adapters
// ----------------------------------------------------------------------------

/**
 * Static auth token provider — wraps a pre-generated token string.
 * Tokens expire (default 10 min), so refresh manually if needed.
 */
export class StaticAuthTokenProvider implements AuthTokenProvider {
  constructor(private token: string) {}
  async getToken(): Promise<string> {
    return this.token;
  }
}

/**
 * Options for the SignerClient-based auth token provider.
 */
export interface SignerAuthTokenOptions {
  /** Token expiry in seconds (default 600 = 10 min). */
  expirySeconds?: number;
  /** Refresh threshold in ms before expiry (default 60000 = 1 min). */
  refreshThresholdMs?: number;
}

export interface SignerClientLike {
  createAuthTokenWithExpiry(expirySeconds?: number): Promise<string>;
}

/**
 * SignerClient-backed auth token provider. Generates fresh tokens via the
 * WASM signer and caches them, refreshing before expiry.
 */
export class SignerAuthTokenProvider implements AuthTokenProvider {
  private cachedToken: string | null = null;
  private cachedAt: number = 0;
  private expirySeconds: number;
  private refreshThresholdMs: number;

  constructor(
    private signer: SignerClientLike,
    options?: SignerAuthTokenOptions,
  ) {
    this.expirySeconds = options?.expirySeconds ?? 600;
    this.refreshThresholdMs = options?.refreshThresholdMs ?? 60000;
  }

  async getToken(): Promise<string> {
    const elapsed = Date.now() - this.cachedAt;
    const tokenAgeMs = this.expirySeconds * 1000;
    if (this.cachedToken && elapsed < tokenAgeMs - this.refreshThresholdMs) {
      return this.cachedToken;
    }
    this.cachedToken = await this.signer.createAuthTokenWithExpiry(this.expirySeconds);
    this.cachedAt = Date.now();
    return this.cachedToken;
  }
}

/**
 * Create a WsPrivateClient from a network + optional SignerClient.
 */
export function createWsPrivateClient(
  network: Network,
  signer?: SignerClientLike,
  accountId?: number,
): WsPrivateClient {
  const url = resolveWsUrl(network);
  const config: WsPrivateClientConfig = { url };
  if (signer !== undefined) {
    config.auth = new SignerAuthTokenProvider(signer);
  }
  if (accountId !== undefined) {
    config.accountId = accountId;
  }
  return new WsPrivateClient(config);
}

export { resolveNetworkFromEnv } from '../network';