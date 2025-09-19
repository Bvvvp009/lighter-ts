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
import { ApiClient, OrderApi } from '@lighter/typescript-sdk';

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
