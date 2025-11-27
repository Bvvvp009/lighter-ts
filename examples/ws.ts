/**
 * Example: Basic WebSocket Connection
 * Demonstrates basic WebSocket connection and subscription to order book data
 */

import { WsClient } from '../src';

async function basicWebSocketExample() {
  console.log('🚀 Basic WebSocket Connection Example...\n');

  // Initialize WebSocket client
  const wsClient = new WsClient({
    url: 'wss://mainnet.zklighter.elliot.ai/stream',
    onOpen: () => console.log('✅ WebSocket connected'),
    onMessage: (message) => {
      console.log('📡 Message received');
    },
    onClose: () => console.log('🔌 WebSocket closed'),
    onError: (error) => console.error('❌ WebSocket error:', error)
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
    
    // Subscribe to market stats for ETH
    wsClient.send({
      type: 'subscribe',
      channel: 'market_stats/0'
    });
    console.log('✅ Subscribed to market stats for market 0 (ETH)');
    
    // Subscribe to trades for ETH
    wsClient.send({
      type: 'subscribe',
      channel: 'trade/0'
    });
    console.log('✅ Subscribed to trades for market 0 (ETH)');

    // Keep connection alive for 30 seconds
    setTimeout(() => {
      wsClient.disconnect();
      console.log('\n🎉 WebSocket example completed!');
    }, 30000);

  } catch (error) {
    console.error('❌ Error:', error);
    await wsClient.disconnect();
  }
}

// Run the example
if (require.main === module) {
  basicWebSocketExample().catch(console.error);
}

export { basicWebSocketExample };
