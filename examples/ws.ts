/**
 * Example: Basic WebSocket Connection
 * Demonstrates basic WebSocket connection and subscription to order book data
 */

import { WsClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function basicWebSocketExample() {
  console.log('🚀 WebSocket Example');

  const baseUrl = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const wsUrl = process.env['WS_URL'] || baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';

  const wsClient = new WsClient({
    url: wsUrl,
    onOpen: () => console.log('✅ Connected'),
    onMessage: () => {}, // Silent - too verbose
    onClose: () => console.log('🔌 Closed'),
    onError: (error) => console.error('❌ Error:', error.message)
  });

  try {
    await wsClient.connect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    wsClient.send({ type: 'subscribe', channel: 'order_book/0' });
    wsClient.send({ type: 'subscribe', channel: 'market_stats/0' });
    wsClient.send({ type: 'subscribe', channel: 'trade/0' });
    console.log('✅ Subscribed to market 0');

    setTimeout(() => {
      wsClient.disconnect();
      console.log('✅ Completed');
    }, 10000);

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
