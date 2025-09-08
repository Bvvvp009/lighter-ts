import { ApiClient, AccountApi, OrderApi, TransactionApi, BlockApi, CandlestickApi } from '../src';

// The address provided belongs to a dummy account registered on Testnet.
const L1_ADDRESS = "0x8D7f03FdE1A626223364E592740a233b72395235";
const ACCOUNT_INDEX = 65;

async function printApi<T>(method: () => Promise<T>, methodName: string): Promise<void> {
  try {
    const result = await method();
    console.log(`${methodName}:`, result);
  } catch (error) {
    console.error(`${methodName} error:`, error);
  }
}

async function accountApis(client: ApiClient): Promise<void> {
  console.log("ACCOUNT APIS");
  const accountApi = new AccountApi(client);
  
  await printApi(
    () => accountApi.getAccount({ by: 'l1_address', value: L1_ADDRESS }),
    'account (by l1_address)'
  );
  
  await printApi(
    () => accountApi.getAccount({ by: 'index', value: ACCOUNT_INDEX.toString() }),
    'account (by index)'
  );
  
  await printApi(
    () => accountApi.getAccountsByL1Address(L1_ADDRESS),
    'accountsByL1Address'
  );
  
  await printApi(
    () => accountApi.getApiKeys(ACCOUNT_INDEX, 1),
    'apikeys'
  );
  
  await printApi(
    () => accountApi.getPublicPools('all', 1, 0),
    'publicPools'
  );
}

async function blockApis(client: ApiClient): Promise<void> {
  console.log("BLOCK APIS");
  const blockApi = new BlockApi(client);
  
  await printApi(
    () => blockApi.getBlock({ by: 'height', value: '1' }),
    'block (by height)'
  );
  
  await printApi(
    () => blockApi.getBlocks({ index: 0, limit: 2, sort: 'asc' }),
    'blocks'
  );
  
  await printApi(
    () => blockApi.getCurrentHeight(),
    'currentHeight'
  );
}

async function candlestickApis(client: ApiClient): Promise<void> {
  console.log("CANDLESTICK APIS");
  const candlestickApi = new CandlestickApi(client);
  
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 60 * 60 * 24;
  
  await printApi(
    () => candlestickApi.getCandlesticks({
      market_id: 0,
      resolution: '1h',
      start_timestamp: oneDayAgo,
      end_timestamp: now,
      count_back: 2,
    }),
    'candlesticks'
  );
  
  await printApi(
    () => candlestickApi.getFundings({
      market_id: 0,
      resolution: '1h',
      start_timestamp: oneDayAgo,
      end_timestamp: now,
      count_back: 2,
    }),
    'fundings'
  );
}

async function orderApis(client: ApiClient): Promise<void> {
  console.log("ORDER APIS");
  const orderApi = new OrderApi(client);
  
  await printApi(
    () => orderApi.getExchangeStats(),
    'exchangeStats'
  );
  
  await printApi(
    () => orderApi.getOrderBookDetails({ market_id: 0 }),
    'orderBookDetails'
  );
  
  await printApi(
    () => orderApi.getOrderBooks(),
    'orderBooks'
  );
  
  await printApi(
    () => orderApi.getRecentTrades({ market_id: 0, limit: 2 }),
    'recentTrades'
  );
}

async function transactionApis(client: ApiClient): Promise<void> {
  console.log("TRANSACTION APIS");
  const transactionApi = new TransactionApi(client);
  
  await printApi(
    () => transactionApi.getBlockTransactions({ by: 'height', value: '1' }),
    'blockTxs'
  );
  
  await printApi(
    () => transactionApi.getNextNonce(ACCOUNT_INDEX, 0),
    'nextNonce'
  );
  
  await printApi(
    () => transactionApi.getTransactions({ index: 0, limit: 2 }),
    'transactions'
  );
}

async function main(): Promise<void> {
  const client = new ApiClient({
    host: 'https://testnet.zklighter.elliot.ai'
  });
  
  try {
    await accountApis(client);
    await blockApis(client);
    await candlestickApis(client);
    await orderApis(client);
    await transactionApis(client);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}