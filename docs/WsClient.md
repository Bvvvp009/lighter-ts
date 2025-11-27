# WsClient

The `WsClient` class provides real-time WebSocket connectivity for order book updates, trades, market stats, and other live data from the Lighter Protocol.

## Constructor

```typescript
new WsClient(config: WebSocketConfig)
```

### WebSocketConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | `string` | Yes | WebSocket URL (e.g., `wss://mainnet.zklighter.elliot.ai/stream`) |
| `onOpen` | `() => void` | No | Callback when connection opens |
| `onMessage` | `(message: any) => void` | No | Callback for incoming messages |
| `onClose` | `() => void` | No | Callback when connection closes |
| `onError` | `(error: Error) => void` | No | Callback for connection errors |
| `reconnectInterval` | `number` | No | Reconnection interval in ms (default: 5000) |
| `maxReconnectAttempts` | `number` | No | Maximum reconnection attempts (default: 5) |

## Methods

### connect()

Establishes a WebSocket connection to the Lighter server.

```typescript
await wsClient.connect();
```

**Returns:** `Promise<void>`

### disconnect()

Closes the WebSocket connection.

```typescript
wsClient.disconnect();
```

### send(message: any)

Sends a message through the WebSocket connection.

```typescript
wsClient.send({
  type: 'subscribe',
  channel: 'order_book/0'
});
```

**Parameters:**
- `message: any` - Message object to send (will be JSON stringified)

### subscribe(subscription: WebSocketSubscription)

Subscribes to a channel with optional parameters.

```typescript
wsClient.subscribe({
  channel: 'order_book/0',
  params: {},
  callback: (data) => {
    console.log('Order book update:', data);
  }
});
```

**Parameters:**
- `subscription: WebSocketSubscription` - Subscription configuration
  - `channel: string` - Channel name (e.g., `order_book/0`, `trade/0`, `market_stats/0`)
  - `params: Record<string, any>` - Optional channel parameters
  - `callback?: (data: any) => void` - Optional callback for this subscription

### unsubscribe(channel: string)

Unsubscribes from a channel.

```typescript
wsClient.unsubscribe('order_book/0');
```

**Parameters:**
- `channel: string` - Channel name to unsubscribe from

### isConnectedToWebSocket()

Checks if the WebSocket is currently connected.

```typescript
const connected = wsClient.isConnectedToWebSocket();
```

**Returns:** `boolean`

### getSubscriptions()

Gets all active subscriptions.

```typescript
const subscriptions = wsClient.getSubscriptions();
```

**Returns:** `WebSocketSubscription[]`

## Available Channels

### Order Book
- **Channel:** `order_book/{marketIndex}`
- **Example:** `order_book/0` (ETH/USDC market)
- **Updates:** Real-time order book changes

### Trades
- **Channel:** `trade/{marketIndex}`
- **Example:** `trade/0` (ETH/USDC market)
- **Updates:** New trades as they occur

### Market Stats
- **Channel:** `market_stats/{marketIndex}`
- **Example:** `market_stats/0` (ETH/USDC market)
- **Updates:** Market statistics (funding rate, open interest, etc.)

## Complete Example

```typescript
import { WsClient } from 'lighter-ts-sdk';

async function main() {
  const wsClient = new WsClient({
    url: 'wss://mainnet.zklighter.elliot.ai/stream',
    onOpen: () => {
      console.log('✅ WebSocket connected');
    },
    onMessage: (message) => {
      console.log('📡 Received:', message);
    },
    onClose: () => {
      console.log('🔌 WebSocket closed');
    },
    onError: (error) => {
      console.error('❌ WebSocket error:', error);
    },
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  });

  try {
    // Connect to WebSocket
    await wsClient.connect();
    
    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Subscribe to order book for ETH market (market 0)
    wsClient.send({
      type: 'subscribe',
      channel: 'order_book/0'
    });
    console.log('✅ Subscribed to order book for market 0 (ETH)');
    
    // Subscribe to market stats
    wsClient.send({
      type: 'subscribe',
      channel: 'market_stats/0'
    });
    console.log('✅ Subscribed to market stats for market 0 (ETH)');
    
    // Subscribe to trades
    wsClient.send({
      type: 'subscribe',
      channel: 'trade/0'
    });
    console.log('✅ Subscribed to trades for market 0 (ETH)');

    // Keep connection alive
    await new Promise(() => {}); // Keep running

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    wsClient.disconnect();
  }
}

main().catch(console.error);
```

## Message Format

### Subscribe Message
```typescript
{
  type: 'subscribe',
  channel: 'order_book/0'
}
```

### Unsubscribe Message
```typescript
{
  type: 'unsubscribe',
  channel: 'order_book/0'
}
```

### Ping Message (for keepalive)
```typescript
{
  type: 'ping'
}
```

## Received Message Formats

### Order Book Update
```typescript
{
  channel: 'order_book:0',
  offset: 12345,
  order_book: {
    code: 0,
    asks: [{ price: "4000.00", size: "1.5" }],
    bids: [{ price: "3999.50", size: "2.0" }],
    offset: 12345,
    nonce: 1234567890
  },
  timestamp: 1234567890123,
  type: 'update/order_book'
}
```

### Trade Update
```typescript
{
  channel: 'trade:0',
  nonce: 1234567890,
  trades: [{
    trade_id: 12345,
    tx_hash: '0x...',
    type: 'trade',
    market_id: 0,
    size: "0.5",
    price: "4000.00",
    usd_amount: "2000.00",
    // ... more fields
  }],
  type: 'update/trade'
}
```

### Market Stats Update
```typescript
{
  channel: 'market_stats:0',
  market_stats: {
    market_id: 0,
    index_price: "4000.00",
    mark_price: "4000.50",
    open_interest: "1000000.00",
    current_funding_rate: "0.0001",
    // ... more fields
  },
  type: 'update/market_stats'
}
```

## Error Handling

The WebSocket client includes automatic reconnection:

```typescript
const wsClient = new WsClient({
  url: 'wss://mainnet.zklighter.elliot.ai/stream',
  onError: (error) => {
    console.error('WebSocket error:', error);
    // The client will automatically attempt to reconnect
  },
  maxReconnectAttempts: 10,
  reconnectInterval: 5000
});
```

## Best Practices

1. **Always handle callbacks** - Set up `onOpen`, `onMessage`, `onClose`, and `onError` callbacks
2. **Wait for connection** - Wait a moment after `connect()` before subscribing
3. **Handle reconnection** - The client auto-reconnects, but monitor `onError` for issues
4. **Clean up resources** - Always call `disconnect()` when done
5. **Monitor performance** - WebSocket connections can generate high-frequency updates
6. **Use ping for keepalive** - Send periodic ping messages to keep connection alive

## Ping-Pong Keepalive Example

```typescript
const wsClient = new WsClient({
  url: 'wss://mainnet.zklighter.elliot.ai/stream',
  onMessage: (message) => {
    if (message.type === 'pong') {
      console.log('✅ Pong received - connection alive');
    }
  }
});

await wsClient.connect();

// Send ping every 30 seconds
const pingInterval = setInterval(() => {
  wsClient.send({ type: 'ping' });
}, 30000);

// Clean up on disconnect
wsClient.onClose = () => {
  clearInterval(pingInterval);
};
```

## Limitations

- WebSocket connections are not persistent across browser refreshes
- Rate limiting may apply to high-frequency subscriptions
- Some data may be delayed during high network congestion
- Connection will be lost if the server restarts (auto-reconnects)

## See Also

- `examples/ws.ts` - Basic WebSocket connection example
- `examples/ws_ping_pong.ts` - Ping-pong keepalive example
- `examples/market_data.ts` - Market data streaming example
