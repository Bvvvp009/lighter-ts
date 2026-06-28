import * as dotenv from 'dotenv';
import { SignerClient, ApiClient, OrderApi } from '../src';

dotenv.config();

async function findOrderIndexByClientOrderIndex(
  orderApi: OrderApi,
  accountIndex: number,
  marketIndex: number,
  clientOrderIndex: number,
  auth: string,
  retries = 5
): Promise<number | undefined> {
  for (let i = 0; i < retries; i++) {
    const orders = await orderApi.getAccountActiveOrders(accountIndex, marketIndex, auth);
    const match = orders.find((o) => o.client_order_index === clientOrderIndex);
    if (match?.order_index !== undefined) return match.order_index;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return undefined;
}

async function main() {
  const API_PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number(process.env.ACCOUNT_INDEX) || 0;
  const BASE_URL = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: Number(process.env.API_KEY_INDEX) || 0,
  });

  await client.initialize();
  await client.ensureWasmClient();

  const apiClient = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(apiClient);

  const integratorIndex = Number(process.env.INTEGRATOR_INDEX) || 1;
  const marketIndex = 0;
  const auth = await client.createAuthToken();

  // Market 0 (ETH perp): size_decimals=4, price_decimals=2, min_base_amount=0.0050.
  // Use a minimal-size limit order well above market price so it rests without filling.
  const clientOrderIndex = Date.now();
  console.log(`Creating order with integrator fees (taker: 100, maker: 50)...`);
  const [, orderHash, orderErr] = await client.createOrder({
    marketIndex,
    clientOrderIndex,
    baseAmount: 100, // 0.0100 ETH
    price: 200000, // $2,000.00
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    integratorAccountIndex: integratorIndex,
    integratorTakerFee: 100,
    integratorMakerFee: 50,
  });

  if (orderErr) {
    console.error('Order error:', orderErr);
    await client.close();
    await apiClient.close();
    return;
  }
  console.log('Order created:', orderHash);

  // createOrder's txInfo only contains ClientOrderIndex (engine-assigned order_index
  // doesn't exist until the order is matched/booked), so look it up via active orders.
  const orderIndex = await findOrderIndexByClientOrderIndex(orderApi, ACCOUNT_INDEX, marketIndex, clientOrderIndex, auth);
  if (orderIndex === undefined) {
    console.error('Could not locate booked order_index for the created order');
    await client.close();
    await apiClient.close();
    return;
  }

  console.log('Modifying order with reduced integrator fees (taker: 50, maker: 25)...');
  const [, modHash, modErr] = await client.modifyOrder(
    marketIndex,
    orderIndex,
    150, // 0.0150 ETH
    201000, // $2,010.00
    0,
    -1,
    {
      integratorAccountIndex: integratorIndex,
      integratorTakerFee: 50,
      integratorMakerFee: 25,
    }
  );

  if (modErr) {
    console.error('Modify error:', modErr);
  } else {
    console.log('Order modified:', modHash);
  }

  const [, cancelHash, cancelErr] = await client.cancelOrder({
    marketIndex,
    orderIndex,
  });

  if (cancelErr) {
    console.error('Cancel error:', cancelErr);
  } else {
    console.log('Order canceled:', cancelHash);
  }

  await client.close();
  await apiClient.close();
}

main().catch(console.error);