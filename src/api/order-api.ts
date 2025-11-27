import { ApiClient } from './api-client';
import { OrderBookParams, TradeParams, PaginationParams } from '../types';

export interface OrderBook {
  market_id: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  last_update_id: string;
}

export interface PriceLevel {
  price: string;
  size: string;
}

export interface OrderBookDetail {
  market_id: number;
  depth: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  last_update_id: string;
}

export interface OrderBookDetailsResponse {
  code: number;
  order_book_details: OrderBookDetailItem[];
}

export interface OrderBookDetailItem {
  symbol: string;
  market_id: number;
  status: string;
  taker_fee: string;
  maker_fee: string;
  liquidation_fee: string;
  min_base_amount: string;
  min_quote_amount: string;
  order_quote_limit: string;
  supported_size_decimals: number;
  supported_price_decimals: number;
  supported_quote_decimals: number;
  size_decimals: number;
  price_decimals: number;
  quote_multiplier: number;
  default_initial_margin_fraction: number;
  min_initial_margin_fraction: number;
  maintenance_margin_fraction: number;
  closeout_margin_fraction: number;
  last_trade_price: number;
  daily_trades_count: number;
  daily_base_token_volume: number;
  daily_quote_token_volume: number;
  daily_price_low: number;
  daily_price_high: number;
  daily_price_change: number;
  open_interest: number;
  daily_chart: Record<string, any>;
  market_config: {
    market_margin_mode: number;
    insurance_fund_account_index: number;
    liquidation_mode: number;
    force_reduce_only: boolean;
    trading_hours: string;
  };
}

export interface OrderBookOrders {
  market_id: number;
  orders: Order[];
}

export interface Order {
  id?: string;
  order_index?: number;
  order_id?: string;
  client_order_index?: number;
  client_order_id?: string;
  market_id?: number;
  market_index?: number;
  owner_account_index?: number;
  side?: 'buy' | 'sell' | '';
  type?: 'limit' | 'market' | 'stop-loss' | 'take-profit';
  size?: string;
  initial_base_amount?: string;
  price?: string;
  base_price?: number;
  filled_size?: string;
  filled_base_amount?: string;
  filled_quote_amount?: string;
  remaining_size?: string;
  remaining_base_amount?: string;
  status?: string;
  created_at?: number;
  updated_at?: number;
  timestamp?: number;
  nonce?: number;
  time_in_force?: string;
  reduce_only?: boolean;
  trigger_price?: string;
  order_expiry?: number;
  trigger_status?: string;
  trigger_time?: number;
  parent_order_index?: number;
  parent_order_id?: string;
  to_trigger_order_id_0?: string;
  to_trigger_order_id_1?: string;
  to_cancel_order_id_0?: string;
  block_height?: number;
  is_ask?: boolean;
  base_size?: number;
}

export interface Trade {
  id: string;
  market_id: number;
  side: 'buy' | 'sell';
  size: string;
  price: string;
  fee: string;
  timestamp: string;
  order_id: string;
  taker_order_id: string;
  maker_order_id: string;
}

// API-specific order interfaces
export interface CreateOrderParams {
  market_id: number;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  size: string;
  price?: string;
  reduce_only?: boolean;
  post_only?: boolean;
  time_in_force?: 'GTC' | 'IOC' | 'FOK';
  client_order_id?: string;
}

export interface CancelOrderParams {
  market_id: number;
  order_id: string;
}

export interface ExchangeStats {
  total_volume_24h: string;
  total_trades_24h: number;
  total_orders_24h: number;
  active_markets: number;
}

export class OrderApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getExchangeStats(): Promise<ExchangeStats> {
    const response = await this.client.get<ExchangeStats>('/api/v1/exchangeStats');
    return response.data;
  }

  public async getOrderBooks(): Promise<OrderBook[]> {
    const response = await this.client.get<OrderBook[]>('/api/v1/orderBooks');
    return response.data;
  }

  public async getOrderBookDetails(params: OrderBookParams): Promise<OrderBookDetail> {
    const response = await this.client.get<OrderBookDetail>('/api/v1/orderBookDetails', {
      market_id: params.market_id,
    });
    return response.data;
  }

  public async getOrderBookDetailsRaw(marketId: number): Promise<OrderBookDetailsResponse> {
    const response = await this.client.get<OrderBookDetailsResponse>('/api/v1/orderBookDetails', {
      market_id: marketId,
    });
    return response.data;
  }

  public async getOrderBookOrders(params: OrderBookParams): Promise<OrderBookOrders> {
    const response = await this.client.get<OrderBookOrders>('/api/v1/orderBookOrders', {
      market_id: params.market_id,
    });
    return response.data;
  }

  public async getRecentTrades(params: TradeParams): Promise<Trade[]> {
    const response = await this.client.get<Trade[]>('/api/v1/recentTrades', {
      market_id: params.market_id,
      limit: params.limit,
    });
    return response.data;
  }

  public async getTrades(params: TradeParams & PaginationParams): Promise<Trade[]> {
    const response = await this.client.get<Trade[]>('/api/v1/trades', {
      market_id: params.market_id,
      limit: params.limit,
      index: params.index,
    });
    return response.data;
  }

  public async getAccountActiveOrders(accountIndex: number, marketId: number, auth?: string): Promise<Order[]> {
    const response = await this.client.get<{code: number, orders: Order[]}>('/api/v1/accountActiveOrders', {
      account_index: accountIndex,
      market_id: marketId,
      ...(auth && { auth })
    });
    return response.data.orders || [];
  }

  public async getAccountInactiveOrders(accountIndex: number, limit: number = 20, auth?: string, marketId?: number): Promise<Order[]> {
    const response = await this.client.get<{code: number, orders: Order[], next_cursor?: string}>('/api/v1/accountInactiveOrders', {
      account_index: accountIndex,
      limit,
      ...(marketId !== undefined && { market_id: marketId }),
      ...(auth && { auth })
    });
    return response.data.orders || [];
  }

  public async getAccountOrders(accountIndex: number, params?: PaginationParams): Promise<Order[]> {
    const response = await this.client.get<Order[]>('/api/v1/accountOrders', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }

  public async createOrder(params: CreateOrderParams): Promise<Order> {
    const response = await this.client.post<Order>('/api/v1/orders', {
      market_id: params.market_id,
      side: params.side,
      type: params.type,
      size: params.size,
      price: params.price,
      reduce_only: params.reduce_only,
      post_only: params.post_only,
      time_in_force: params.time_in_force,
      client_order_id: params.client_order_id,
    });
    return response.data;
  }

  public async cancelOrder(params: CancelOrderParams): Promise<{ success: boolean }> {
    const response = await this.client.delete<{ success: boolean }>('/api/v1/orders', {
      params: {
        market_id: params.market_id,
        order_id: params.order_id,
      },
    });
    return response.data;
  }

  public async cancelAllOrders(marketId?: number): Promise<{ success: boolean }> {
    const params: any = {};
    if (marketId !== undefined) {
      params.market_id = marketId;
    }
    
    const response = await this.client.delete<{ success: boolean }>('/api/v1/orders/all', {
      params,
    });
    return response.data;
  }
}