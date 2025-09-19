import { WsClient } from '../src/api/ws-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

function onOrderBookUpdate(marketId: number, orderBook: any): void {
  console.log(`Order book ${marketId}:`, JSON.stringify(orderBook, null, 2));
}

function onAccountUpdate(accountId: number, account: any): void {
  console.log(`Account ${accountId}:`, JSON.stringify(account, null, 2));
}

const client = new WsClient({
  url: BASE_URL,
  orderBookIds: [0, 1],
  accountIds: [1, 2],
  onOrderBookUpdate,
  onAccountUpdate,
});

client.run();
