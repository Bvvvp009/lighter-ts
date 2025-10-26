/**
 * Example: Async WebSocket Operations
 * Demonstrates async WebSocket operations with proper error handling and reconnection
 */

import { WsClient } from '../src';

async function asyncWebSocketExample() {
  console.log('🚀 Async WebSocket Operations Example...\n');

  let messageCount = 0;
  let lastOrderBookUpdate: any = null;

  // Initialize WebSocket client with reconnection settings
  const wsClient = new WsClient({
    url: 'wss://mainnet.zklighter.elliot.ai/stream',
    reconnectInterval: 5000,
    maxReconnectAttempts: 3,
    onOpen: () => {
      console.log('✅ WebSocket connected');
      messageCount = 0;
    },
    onMessage: (message) => {
      messageCount++;
      
      // Handle different message types
      if (message.type === 'update/order_book') {
        lastOrderBookUpdate = message;
        console.log(`📊 Order Book Update #${messageCount}:`);
        console.log(`   Channel: ${message.channel}`);
        console.log(`   Offset: ${message.offset}`);
        if (message.order_book?.bids?.length > 0) {
          console.log(`   Best Bid: ${message.order_book.bids[0].price} (${message.order_book.bids[0].size})`);
        }
        if (message.order_book?.asks?.length > 0) {
          console.log(`   Best Ask: ${message.order_book.asks[0].price} (${message.order_book.asks[0].size})`);
        }
      } else if (message.type === 'update/market_stats') {
        console.log(`📈 Market Stats Update #${messageCount}:`);
        console.log(`   Market ID: ${message.market_stats?.market_id}`);
        console.log(`   Last Price: ${message.market_stats?.last_trade_price}`);
        console.log(`   Volume 24h: ${message.market_stats?.daily_quote_token_volume}`);
      } else if (message.type === 'update/trade') {
        console.log(`💱 Trade Update #${messageCount}:`);
        if (message.trades?.length > 0) {
          const trade = message.trades[0];
          console.log(`   Trade ID: ${trade.trade_id}`);
          console.log(`   Price: ${trade.price}`);
          console.log(`   Size: ${trade.size}`);
          console.log(`   Type: ${trade.type}`);
        }
      } else if (message.type === 'connected') {
        console.log(`🔗 Connection established with session: ${message.session_id}`);
      } else {
        console.log(`📡 Message #${messageCount}: ${message.type}`);
      }
    },
    onClose: () => console.log('🔌 WebSocket closed'),
    onError: (error) => console.error('❌ WebSocket error:', error)
  });

  try {
    // Connect to WebSocket
    await wsClient.connect();
    
    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Subscribe to multiple channels
    const subscriptions = [
      { type: 'subscribe', channel: 'order_book/0' },      // ETH order book
      { type: 'subscribe', channel: 'order_book/1' },      // BTC order book
      { type: 'subscribe', channel: 'market_stats/0' },    // ETH market stats
      { type: 'subscribe', channel: 'market_stats/1' },    // BTC market stats
      { type: 'subscribe', channel: 'trade/0' },           // ETH trades
      { type: 'subscribe', channel: 'trade/1' }            // BTC trades
    ];

    // Send subscriptions with delays to avoid overwhelming the server
    for (let i = 0; i < subscriptions.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      wsClient.send(subscriptions[i]);
      console.log(`✅ Subscribed to ${subscriptions[i].channel}`);
    }

    // Keep connection alive for 60 seconds
    setTimeout(async () => {
      console.log(`\n📊 Summary:`);
      console.log(`   Total messages received: ${messageCount}`);
      console.log(`   Last order book update: ${lastOrderBookUpdate ? 'Yes' : 'No'}`);
      
      await wsClient.disconnect();
      console.log('🎉 Async WebSocket example completed!');
    }, 60000);

  } catch (error) {
    console.error('❌ Error:', error);
    await wsClient.disconnect();
  }
}

// Run the example
if (require.main === module) {
  asyncWebSocketExample().catch(console.error);
}

export { asyncWebSocketExample };
