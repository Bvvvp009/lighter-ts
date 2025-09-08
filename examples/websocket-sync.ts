import { WsClient } from '../src';

function onOrderBookUpdate(marketId: number, orderBook: any): void {
  console.log(`Order book ${marketId}:`, JSON.stringify(orderBook, null, 2));
}

function onAccountUpdate(accountId: number, account: any): void {
  console.log(`Account ${accountId}:`, JSON.stringify(account, null, 2));
}

async function main(): Promise<void> {
  const client = new WsClient({
    url: 'wss://testnet.zklighter.elliot.ai/ws',
    onMessage: (data) => {
      // Handle different message types
      if (data.type === 'orderbook') {
        onOrderBookUpdate(data.market_id, data.data);
      } else if (data.type === 'account') {
        onAccountUpdate(data.account_id, data.data);
      } else {
        console.log('Received message:', JSON.stringify(data, null, 2));
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
    onClose: () => {
      console.log('WebSocket connection closed');
    },
    onOpen: () => {
      console.log('WebSocket connection opened');
    },
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
  });

  try {
    // Connect to WebSocket
    console.log('Connecting to WebSocket...');
    await client.connect();
    console.log('Connected successfully!');

    // Subscribe to order book updates for markets 0 and 1
    console.log('Subscribing to order book updates...');
    client.subscribe({
      channel: 'orderbook',
      params: { market_id: 0 },
    });
    client.subscribe({
      channel: 'orderbook',
      params: { market_id: 1 },
    });

    // Subscribe to account updates for accounts 1 and 2
    console.log('Subscribing to account updates...');
    client.subscribe({
      channel: 'account',
      params: { account_id: 1 },
    });
    client.subscribe({
      channel: 'account',
      params: { account_id: 2 },
    });

    // Keep the connection alive for 30 seconds
    console.log('Listening for messages for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('Error in WebSocket example:', error);
  } finally {
    // Disconnect
    console.log('Disconnecting...');
    client.disconnect();
    console.log('Disconnected');
  }
}

if (require.main === module) {
  main().catch(console.error);
} 