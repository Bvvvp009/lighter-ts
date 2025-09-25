import { ApiClient } from '../src/api/api-client';
import { AccountApi } from '../src/api/account-api';
import { BlockApi } from '../src/api/block-api';
import { OrderApi } from '../src/api/order-api';
import { TransactionApi } from '../src/api/transaction-api';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const L1_ADDRESS = process.env['L1_ADDRESS'] || '0x23bc4Dc9172d15Bbe02E57C0269EcD46c007EB95';
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '65', 10);

async function printApi(method: any, ...args: any[]): Promise<void> {
  try {
    const result = await method(...args);
    console.log(`${method.name}:`, result);
  } catch (error: any) {
    console.log(`${method.name}: Error -`, error.message);
  }
}

async function main(): Promise<void> {
  const client = new ApiClient({ host: BASE_URL });
  
  console.log('=== ACCOUNT APIS ===');
  const accountApi = new AccountApi(client);
  await printApi(accountApi.getAccount.bind(accountApi), 'l1_address', L1_ADDRESS);
  await printApi(accountApi.getAccount.bind(accountApi), 'index', ACCOUNT_INDEX.toString());
  await printApi(accountApi.getAccountsByL1Address.bind(accountApi), L1_ADDRESS);
  await printApi(accountApi.getApiKeys.bind(accountApi), ACCOUNT_INDEX, 1);
  await printApi(accountApi.getPublicPools.bind(accountApi), 'all', 1, 0);

  console.log('\n=== BLOCK APIS ===');
  const blockApi = new BlockApi(client);
  await printApi(blockApi.getBlock.bind(blockApi), 'height', '1');
  await printApi(blockApi.getBlocks.bind(blockApi), 0, 2, 'asc');
  await printApi(blockApi.getCurrentHeight.bind(blockApi));

  console.log('\n=== ORDER APIS ===');
  const orderApi = new OrderApi(client);
  await printApi(orderApi.getExchangeStats.bind(orderApi));
  await printApi(orderApi.getOrderBookDetails.bind(orderApi), { marketIndex: 0 });
  await printApi(orderApi.getOrderBooks.bind(orderApi));
  await printApi(orderApi.getRecentTrades.bind(orderApi), { marketIndex: 0, limit: 2 });

  console.log('\n=== TRANSACTION APIS ===');
  const transactionApi = new TransactionApi(client);
  await printApi(transactionApi.getBlockTransactions.bind(transactionApi), { by: 'block_height', value: '1' });
  await printApi(transactionApi.getNextNonce.bind(transactionApi), ACCOUNT_INDEX, 0);
  await printApi(transactionApi.getTransactions.bind(transactionApi), { limit: 2 });

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
