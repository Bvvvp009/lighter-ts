import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OrderApi, CreateOrderParams, Order, OrderBookOrders, Trade } from '../src/api/order-api';
import { ApiClient } from '../src/api/api-client';

describe('OrderApi dormant methods', () => {
  let mockClient: { post: jest.Mock; get: jest.Mock; delete: jest.Mock };
  let orderApi: OrderApi;

  beforeEach(() => {
    mockClient = {
      post: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    orderApi = new OrderApi(mockClient as unknown as ApiClient);
  });

  describe('createOrder', () => {
    it('should forward payload to POST /api/v1/orders', async () => {
      const params: CreateOrderParams = {
        market_id: 1,
        side: 'buy',
        type: 'limit',
        size: '1.5',
        price: '2500',
        reduce_only: true,
        post_only: false,
        time_in_force: 'GTC',
        client_order_id: 'client-123',
      };

      const expectedOrder: Order = {
        order_id: 'abc',
        market_id: 1,
        side: 'buy',
        type: 'limit',
        size: '1.5',
      };

      mockClient.post.mockImplementation(async () => ({ data: expectedOrder }));

      const result = await orderApi.createOrder(params);

      expect(mockClient.post).toHaveBeenCalledWith('/api/v1/orders', {
        market_id: 1,
        side: 'buy',
        type: 'limit',
        size: '1.5',
        price: '2500',
        reduce_only: true,
        post_only: false,
        time_in_force: 'GTC',
        client_order_id: 'client-123',
      });
      expect(result).toEqual(expectedOrder);
    });

    it('should allow market orders without price', async () => {
      const params: CreateOrderParams = {
        market_id: 2,
        side: 'sell',
        type: 'market',
        size: '0.5',
        time_in_force: 'IOC',
        client_order_id: 'market-123',
      };

      const expectedOrder: Order = {
        order_id: 'market-abc',
        market_id: 2,
        side: 'sell',
        type: 'market',
        size: '0.5',
      };

      mockClient.post.mockImplementation(async () => ({ data: expectedOrder }));

      const result = await orderApi.createOrder(params);

      expect(mockClient.post).toHaveBeenCalledWith('/api/v1/orders', {
        market_id: 2,
        side: 'sell',
        type: 'market',
        size: '0.5',
        price: undefined,
        reduce_only: undefined,
        post_only: undefined,
        time_in_force: 'IOC',
        client_order_id: 'market-123',
      });
      expect(result).toEqual(expectedOrder);
    });
  });

  describe('getOrderBookOrders', () => {
    it('should request order book orders with market and depth', async () => {
      const expected: OrderBookOrders = {
        market_id: 2,
        orders: [],
      };

      mockClient.get.mockImplementation(async () => ({ data: expected }));

      const result = await orderApi.getOrderBookOrders({ market_id: 2, depth: 5 });

      expect(mockClient.get).toHaveBeenCalledWith('/api/v1/orderBookOrders', {
        market_id: 2,
        depth: 5,
      });
      expect(result).toEqual(expected);
    });
  });

  describe('getTrades', () => {
    it('should request trades with pagination support', async () => {
      const trades: Trade[] = [{
        id: 't1',
        market_id: 3,
        side: 'sell',
        size: '0.1',
        price: '3000',
        fee: '0.01',
        timestamp: '123456',
        order_id: 'o1',
        taker_order_id: 'taker1',
        maker_order_id: 'maker1',
      }];

      mockClient.get.mockImplementation(async () => ({ data: trades }));

      const result = await orderApi.getTrades({ market_id: 3, limit: 50, index: 10, sort: 'desc' });

      expect(mockClient.get).toHaveBeenCalledWith('/api/v1/trades', {
        market_id: 3,
        limit: 50,
        index: 10,
        sort: 'desc',
      });
      expect(result).toEqual(trades);
    });
  });

  describe('getAccountOrders', () => {
    it('should request account orders with pagination', async () => {
      const orders: Order[] = [];

      mockClient.get.mockImplementation(async () => ({ data: orders }));

      const result = await orderApi.getAccountOrders(42, { limit: 20, index: 5 });

      expect(mockClient.get).toHaveBeenCalledWith('/api/v1/accountOrders', {
        account_index: 42,
        limit: 20,
        index: 5,
      });
      expect(result).toEqual(orders);
    });
  });

  describe('cancelOrder', () => {
    it('should call DELETE /api/v1/orders with params', async () => {
      mockClient.delete.mockImplementation(async () => ({ data: { success: true } }));

      const result = await orderApi.cancelOrder({ market_id: 5, order_id: 'order-5' });

      expect(mockClient.delete).toHaveBeenCalledWith('/api/v1/orders', {
        params: {
          market_id: 5,
          order_id: 'order-5',
        },
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('cancelAllOrders', () => {
    it('should call DELETE /api/v1/orders/all with optional market filter', async () => {
      mockClient.delete.mockImplementation(async () => ({ data: { success: true } }));

      const result = await orderApi.cancelAllOrders(7);

      expect(mockClient.delete).toHaveBeenCalledWith('/api/v1/orders/all', {
        params: {
          market_id: 7,
        },
      });
      expect(result).toEqual({ success: true });
    });

    it('should call DELETE /api/v1/orders/all without market filter when omitted', async () => {
      mockClient.delete.mockImplementation(async () => ({ data: { success: true } }));

      await orderApi.cancelAllOrders();

      expect(mockClient.delete).toHaveBeenCalledWith('/api/v1/orders/all', {
        params: {},
      });
    });
  });
});

