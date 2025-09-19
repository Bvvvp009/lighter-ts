# WsClient

The `WsClient` class provides real-time WebSocket connectivity for order book updates, account changes, and other live data from the Lighter Protocol.

## Constructor

```typescript
new WsClient(config: WsConfig)
```

### WsConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | `string` | Yes | WebSocket URL (e.g., `wss://mainnet.zklighter.elliot.ai/ws`) |
| `accountIndex` | `number` | Yes | Your account index |
| `apiKeyIndex` | `number` | Yes | Your API key index |
| `privateKey` | `string` | Yes | Your API key private key |
| `reconnectInterval` | `number` | No | Reconnection interval in ms (default: 5000) |
| `maxReconnectAttempts` | `number` | No | Maximum reconnection attempts (default: 10) |

## Methods

### connect()

Establishes a WebSocket connection to the Lighter server.

```typescript
await wsClient.connect();
```

### disconnect()

Closes the WebSocket connection.

```typescript
await wsClient.disconnect();
```

### subscribeOrderBook(marketIndex: number, callback: (data: OrderBookData) => void)

Subscribes to order book updates for a specific market.

**Parameters:**
- `marketIndex: number` - Market index (0 for ETH/USDC)
- `callback: (data: OrderBookData) => void` - Callback function for order book updates

**Example:**
```typescript
wsClient.subscribeOrderBook(0, (data) => {
  console.log('ETH/USDC Order Book Update:', data);
  console.log('Best Bid:', data.bestBid);
  console.log('Best Ask:', data.bestAsk);
});
```

### subscribeAccount(callback: (data: AccountData) => void)

Subscribes to account updates.

**Parameters:**
- `callback: (data: AccountData) => void` - Callback function for account updates

**Example:**
```typescript
wsClient.subscribeAccount((data) => {
  console.log('Account Update:', data);
  console.log('Balance:', data.balance);
  console.log('Positions:', data.positions);
});
```

### subscribeTrades(marketIndex: number, callback: (data: TradeData) => void)

Subscribes to trade updates for a specific market.

**Parameters:**
- `marketIndex: number` - Market index
- `callback: (data: TradeData) => void` - Callback function for trade updates

**Example:**
```typescript
wsClient.subscribeTrades(0, (data) => {
  console.log('New Trade:', data);
  console.log('Price:', data.price);
  console.log('Size:', data.size);
});
```

### sendTransaction(txType: number, txInfo: string)

Sends a transaction through the WebSocket connection.

**Parameters:**
- `txType: number` - Transaction type (use `SignerClient.TX_TYPE_*` constants)
- `txInfo: string` - Transaction information as JSON string

**Returns:** `Promise<string>` - Transaction hash

**Example:**
```typescript
const txHash = await wsClient.sendTransaction(
  SignerClient.TX_TYPE_CREATE_ORDER,
  JSON.stringify(orderData)
);
console.log('Transaction sent:', txHash);
```

## Event Handling

The WebSocket client emits events for connection status:

```typescript
wsClient.on('connected', () => {
  console.log('WebSocket connected');
});

wsClient.on('disconnected', () => {
  console.log('WebSocket disconnected');
});

wsClient.on('error', (error) => {
  console.error('WebSocket error:', error);
});

wsClient.on('reconnecting', (attempt) => {
  console.log(`Reconnecting... attempt ${attempt}`);
});
```

## Types

### OrderBookData

```typescript
interface OrderBookData {
  marketIndex: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  bestBid: string;
  bestAsk: string;
  timestamp: number;
}
```

### AccountData

```typescript
interface AccountData {
  accountIndex: number;
  balance: string;
  positions: AccountPosition[];
  orders: Order[];
  timestamp: number;
}
```

### TradeData

```typescript
interface TradeData {
  tradeId: string;
  marketIndex: number;
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: number;
}
```

### PriceLevel

```typescript
interface PriceLevel {
  price: string;
  size: string;
}
```

## Complete Example

```typescript
import { WsClient, SignerClient } from '@lighter/typescript-sdk';

async function main() {
  const wsClient = new WsClient({
    url: 'wss://mainnet.zklighter.elliot.ai/ws',
    accountIndex: 123,
    apiKeyIndex: 0,
    privateKey: 'your-api-key-private-key',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  });

  // Set up event handlers
  wsClient.on('connected', () => {
    console.log('WebSocket connected');
  });

  wsClient.on('disconnected', () => {
    console.log('WebSocket disconnected');
  });

  wsClient.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  try {
    // Connect to WebSocket
    await wsClient.connect();

    // Subscribe to order book updates
    wsClient.subscribeOrderBook(0, (data) => {
      console.log('ETH/USDC Order Book:');
      console.log(`Best Bid: ${data.bestBid}`);
      console.log(`Best Ask: ${data.bestAsk}`);
      console.log(`Bid Depth: ${data.bids.length} levels`);
      console.log(`Ask Depth: ${data.asks.length} levels`);
    });

    // Subscribe to account updates
    wsClient.subscribeAccount((data) => {
      console.log('Account Update:');
      console.log(`Balance: ${data.balance} USDC`);
      console.log(`Positions: ${data.positions.length}`);
      console.log(`Open Orders: ${data.orders.length}`);
    });

    // Subscribe to trade updates
    wsClient.subscribeTrades(0, (data) => {
      console.log(`New Trade: ${data.size} @ ${data.price} (${data.side})`);
    });

    // Keep the connection alive
    await new Promise(() => {}); // Keep running

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await wsClient.disconnect();
  }
}

main().catch(console.error);
```

## Error Handling

The WebSocket client includes automatic reconnection and error handling:

```typescript
wsClient.on('error', (error) => {
  console.error('WebSocket error:', error);
  // The client will automatically attempt to reconnect
});

wsClient.on('reconnecting', (attempt) => {
  console.log(`Reconnection attempt ${attempt}/${wsClient.maxReconnectAttempts}`);
});
```

## Best Practices

1. **Always handle connection events** - Monitor connection status
2. **Use appropriate callbacks** - Keep callback functions lightweight
3. **Handle errors gracefully** - The client will auto-reconnect, but you should handle errors
4. **Clean up resources** - Always call `disconnect()` when done
5. **Monitor performance** - WebSocket connections can generate high-frequency updates

## Limitations

- WebSocket connections are not persistent across browser refreshes
- Rate limiting may apply to high-frequency subscriptions
- Some data may be delayed during high network congestion
- Connection will be lost if the server restarts
