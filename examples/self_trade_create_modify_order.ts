import * as dotenv from 'dotenv';
import { SignerClient, ApiClient, OrderApi } from '../src';

dotenv.config();

async function main() {
  const API_PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const BASE_URL = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
  const ACCOUNT_INDEX = Number(process.env.ACCOUNT_INDEX) || 0;
  const API_KEY_INDEX = Number(process.env.API_KEY_INDEX) || 0;

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  await client.initialize();
  await client.ensureWasmClient();

  console.log('Creating order with self-trade prevention (EXPIRE_MAKER)...');
  const [order, orderHash, orderErr] = await client.createOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 100,
    price: 178000,
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    selfTradeBehaviorMode: SignerClient.SELF_TRADE_BEHAVIOR_EXPIRE_MAKER,
    selfTradeEqualityMode: SignerClient.SELF_TRADE_EQUALITY_ACCOUNT_INDEX,
  });

  if (orderErr) {
    console.error('Order error:', orderErr);
  } else {
    console.log('Order created:', orderHash);

    if (orderHash) {
      try {
        await client.waitForTransaction(orderHash, 30000, 2000);
        console.log('Order confirmed on-chain');
      } catch (e) {
        console.log('Order confirmation timeout (order may still be pending)');
      }
    }

    console.log('\nModifying order with self-trade prevention (EXPIRE_TAKER)...');
    if (order) {
      const apiClient = new ApiClient({ host: BASE_URL });
      const orderApi = new OrderApi(apiClient);
      const auth = await client.createAuthTokenWithExpiry(8 * 60 * 60);

      const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, 0, auth);
      const orders = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
      const lastOrder = orders.length > 0 ? orders[orders.length - 1] : null;

      if (lastOrder) {
        const orderIndex = lastOrder.order_index || lastOrder.orderIndex || 0;
        console.log(`Found order at index ${orderIndex}, modifying...`);

        const [modOrder, modHash, modErr] = await client.modifyOrder(
          0,
          orderIndex,
          200,
          179000,
          0,
          -1,
          {
            selfTradeBehaviorMode: SignerClient.SELF_TRADE_BEHAVIOR_EXPIRE_TAKER,
            selfTradeEqualityMode: SignerClient.SELF_TRADE_EQUALITY_ACCOUNT_INDEX,
          }
        );
        if (modErr) {
          console.error('Modify error:', modErr);
        } else {
          console.log('Order modified:', modHash);
        }
      } else {
        console.log('No active orders found to modify');
      }
      await apiClient.close?.();
    }
  }

  await client.close();
}

main().catch(console.error);