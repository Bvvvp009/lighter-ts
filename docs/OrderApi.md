# OrderApi

The `OrderApi` class provides methods for retrieving order book data, exchange statistics, and trade information.

## Constructor

```typescript
new OrderApi(client: ApiClient)
```

## Methods

### getExchangeStats()

Gets exchange-wide statistics.

**Returns:** `Promise<ExchangeStats>` - Exchange statistics

**Example:**
```typescript
const orderApi = new OrderApi(client);
const stats = await orderApi.getExchangeStats();
console.log('Exchange stats:', stats);
```

### getOrderBookDetails(params: OrderBookParams)

Gets detailed order book information for a specific market.

**Parameters:**
- `marketIndex: number` - Market index (0 for ETH/USDC)

**Returns:** `Promise<OrderBookDetail>` - Order book details

**Example:**
```typescript
const orderBook = await orderApi.getOrderBookDetails({ marketIndex: 0 });
console.log('Order book:', orderBook);
```

### getOrderBooks()

Gets order book information for all markets.

**Returns:** `Promise<OrderBook[]>` - Array of order books

**Example:**
```typescript
const orderBooks = await orderApi.getOrderBooks();
console.log(`Found ${orderBooks.length} order books`);
```

### getOrderBookOrders(params: OrderBookParams)

Gets orders from the order book for a specific market.

**Parameters:**
- `marketIndex: number` - Market index

**Returns:** `Promise<OrderBookOrders>` - Order book orders

**Example:**
```typescript
const orders = await orderApi.getOrderBookOrders({ marketIndex: 0 });
console.log('Order book orders:', orders);
```

### getRecentTrades(params: TradeParams)

Gets recent trades for a specific market.

**Parameters:**
- `marketIndex: number` - Market index
- `limit?: number` - Maximum number of trades to return

**Returns:** `Promise<Trade[]>` - Array of recent trades

**Example:**
```typescript
const trades = await orderApi.getRecentTrades({ 
  marketIndex: 0, 
  limit: 50 
});
console.log(`Found ${trades.length} recent trades`);
```

### getTrades(params: TradeParams & PaginationParams)

Gets trades for a specific market with pagination.

**Parameters:**
- `marketIndex: number` - Market index
- `limit?: number` - Maximum number of trades to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Trade[]>` - Array of trades

**Example:**
```typescript
const trades = await orderApi.getTrades({ 
  marketIndex: 0, 
  limit: 100,
  index: 0
});
console.log(`Found ${trades.length} trades`);
```

### getAccountActiveOrders(accountIndex: number, marketId: number, auth?: string)

Gets active orders for a specific account and market.

**Parameters:**
- `accountIndex: number` - Account index
- `marketId: number` - Market ID
- `auth?: string` - Optional authentication token

**Returns:** `Promise<Order[]>` - Array of active orders

**Example:**
```typescript
const activeOrders = await orderApi.getAccountActiveOrders(123, 0);
console.log(`Found ${activeOrders.length} active orders`);
```

### getAccountInactiveOrders(accountIndex: number, limit?: number, auth?: string, marketId?: number)

Gets inactive (filled/cancelled) orders for a specific account.

**Parameters:**
- `accountIndex: number` - Account index
- `limit?: number` - Maximum number of orders to return (default: 20)
- `auth?: string` - Optional authentication token
- `marketId?: number` - Optional market ID filter

**Returns:** `Promise<Order[]>` - Array of inactive orders

**Example:**
```typescript
const inactiveOrders = await orderApi.getAccountInactiveOrders(123, 50);
console.log(`Found ${inactiveOrders.length} inactive orders`);
```

### getAccountOrders(accountIndex: number, params?: PaginationParams)

Gets all orders (active and inactive) for a specific account.

**Parameters:**
- `accountIndex: number` - Account index
- `limit?: number` - Maximum number of orders to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Order[]>` - Array of orders

**Example:**
```typescript
const allOrders = await orderApi.getAccountOrders(123, { limit: 100 });
console.log(`Found ${allOrders.length} orders`);
```

### createOrder(params: CreateOrderParams)

Creates a new order via REST API (for advanced use cases; prefer `SignerClient.createOrder()`).

**Parameters:**
- `marketIndex: number` - Market index
- `clientOrderIndex: number` - Unique client order identifier
- `baseAmount: number` - Order size in base units
- `price: number` - Order price
- `isAsk: boolean` - True for sell orders, false for buy orders
- `orderType: number` - Order type (0=limit, 1=market)
- `timeInForce: number` - Time in force
- `reduceOnly?: boolean` - Whether this is a reduce-only order
- `triggerPrice?: number` - Trigger price for conditional orders
- `orderExpiry?: number` - Order expiry timestamp

**Returns:** `Promise<Order>` - Created order

**Example:**
```typescript
const order = await orderApi.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  price: 400000,
  isAsk: false,
  orderType: 0, // Limit order
  timeInForce: 1
});
console.log('Order created:', order);
```

### cancelOrder(params: CancelOrderParams)

Cancels an order via REST API (for advanced use cases; prefer `SignerClient.cancelOrder()`).

**Parameters:**
- `marketIndex: number` - Market index
- `orderIndex: number` - Order index to cancel

**Returns:** `Promise<{ success: boolean }>` - Cancellation result

**Example:**
```typescript
const result = await orderApi.cancelOrder({
  marketIndex: 0,
  orderIndex: 12345
});
console.log('Cancel result:', result);
```

### cancelAllOrders(marketId?: number)

Cancels all orders for a market via REST API (for advanced use cases; prefer `SignerClient.cancelAllOrders()`).

**Parameters:**
- `marketId?: number` - Optional market ID (if not provided, cancels all orders)

**Returns:** `Promise<{ success: boolean }>` - Cancellation result

**Example:**
```typescript
const result = await orderApi.cancelAllOrders(0); // Cancel all orders for market 0
console.log('Cancel all result:', result);
```

## Types

### OrderBookParams

```typescript
interface OrderBookParams {
  marketIndex: number;
}
```

### TradeParams

```typescript
interface TradeParams {
  marketIndex: number;
  limit?: number;
}
```

### ExchangeStats

```typescript
interface ExchangeStats {
  total_volume: string;
  total_trades: number;
  // ... other statistics
}
```

### OrderBookDetail

```typescript
interface OrderBookDetail {
  market_index: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  // ... other order book data
}
```

### OrderBook

```typescript
interface OrderBook {
  market_id: number;
  symbol: string;
  // ... other order book information
}
```

### Trade

```typescript
interface Trade {
  trade_id: string;
  market_index: number;
  price: string;
  size: string;
  timestamp: string;
  // ... other trade data
}
```

### PriceLevel

```typescript
interface PriceLevel {
  price: string;
  size: string;
}
```

## Error Handling

All methods throw errors for invalid parameters or network issues:

```typescript
try {
  const orderBook = await orderApi.getOrderBookDetails({ marketIndex: 0 });
  console.log('Order book:', orderBook);
} catch (error) {
  console.error('Failed to get order book:', error.message);
}
```

## Complete Example

```typescript
import { ApiClient, OrderApi } from 'lighter-ts-sdk';

async function main() {
  const client = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const orderApi = new OrderApi(client);

  try {
    // Get exchange statistics
    const stats = await orderApi.getExchangeStats();
    console.log('Exchange stats:', stats);

    // Get order book details for ETH/USDC
    const orderBook = await orderApi.getOrderBookDetails({ marketIndex: 0 });
    console.log('ETH/USDC order book:', orderBook);

    // Get all order books
    const orderBooks = await orderApi.getOrderBooks();
    console.log(`Found ${orderBooks.length} markets`);

    // Get recent trades
    const trades = await orderApi.getRecentTrades({ 
      marketIndex: 0, 
      limit: 20 
    });
    console.log(`Found ${trades.length} recent trades`);

    // Display recent trades
    trades.forEach(trade => {
      console.log(`Trade: ${trade.size} @ ${trade.price} (${trade.timestamp})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
```
