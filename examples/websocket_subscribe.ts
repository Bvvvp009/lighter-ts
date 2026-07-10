import * as dotenv from 'dotenv';
import { WsClient, resolveNetworkFromEnv, resolveWsUrl } from '../src';

dotenv.config();

async function main() {
  // Network is driven by LIGHTER_NETWORK in .env (mainnet | testnet | robinhood).
  // WS_READONLY=true appends ?readonly=true for restricted regions (Robinhood).
  const network = resolveNetworkFromEnv();
  const wsUrl = resolveWsUrl(network, {
    readonly: process.env['WS_READONLY']?.toLowerCase() === 'true',
  });
  const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0');

  console.log(`Using Lighter network: ${network.name} (chain_id ${network.chainId})`);
  console.log('Connecting to WebSocket for real-time data...');
  console.log(`WebSocket URL: ${wsUrl}`);

  const wsClient = new WsClient({
    url: wsUrl,
    onOpen: () => {
      console.log('Connected! Listening for messages...');
      console.log('Press Ctrl+C to disconnect.');

      // Subscribe to order book for market 0 (ETH/USDC)
      wsClient.send({ type: 'subscribe', channel: 'order_book/0' });
      console.log('Subscribed to order_book/0');

      // Subscribe to trades for market 0
      wsClient.send({ type: 'subscribe', channel: 'trade/0' });
      console.log('Subscribed to trade/0');
    },
    onMessage: (message: any) => {
      console.log('Message:', JSON.stringify(message).substring(0, 300));
    },
    onError: (error: Error) => {
      console.error('WebSocket error:', error.message);
    },
    onClose: () => {
      console.log('WebSocket disconnected.');
    },
  });

  try {
    await wsClient.connect();

    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        console.log('\nDisconnecting...');
        wsClient.disconnect();
        resolve();
      });
    });
  } catch (error) {
    console.error('WebSocket error:', error instanceof Error ? error.message : error);
    wsClient.disconnect();
  }
}

main().catch(console.error);