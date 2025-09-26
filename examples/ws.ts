import { WsClient } from '../src/api/ws-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'wss://mainnet.zklighter.elliot.ai';

function onMessage(data: any): void {
  console.log('WebSocket message received:', JSON.stringify(data, null, 2));
}

function onError(error: Error): void {
  console.error('WebSocket error:', error);
}

function onOpen(): void {
  console.log('WebSocket connected');
}

function onClose(): void {
  console.log('WebSocket disconnected');
}

async function main(): Promise<void> {
  const client = new WsClient({
    url: BASE_URL.replace('https://', 'wss://'),
    onMessage,
    onError,
    onOpen,
    onClose,
  });

  try {
    await client.connect();
    
    // Subscribe to order book updates for market 0
    client.subscribe({
      channel: 'orderbook',
      params: { marketIndex: 0 }
    });

    // Subscribe to account updates for account 1
    client.subscribe({
      channel: 'account',
      params: { accountIndex: 1 }
    });

    // Keep the connection alive
    console.log('WebSocket client running. Press Ctrl+C to exit.');
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      client.disconnect();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
}

main();
