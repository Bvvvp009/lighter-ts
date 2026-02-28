/**
 * Example: Modify Spot Order
 * Works for ETH SPOT (2048), BTC SPOT (2049), SOL SPOT (2051)
 * MarketIndex: 2048 (ETH SPOT) - Available on mainnet
 */

import { SignerClient, ApiClient, OrderApi, AccountApi } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function getAuthToken(signerClient: SignerClient, expiryInSeconds: number = 8 * 60 * 60): Promise<string> {
  const auth = await signerClient.createAuthTokenWithExpiry(expiryInSeconds);
  return auth;
}

async function modifySpotOrder() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '271', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const MARKET_INDEX = 2048; // ETH SPOT

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  console.log(`📋 Modifying ETH SPOT Order`);
  console.log(`   Account Index: ${ACCOUNT_INDEX}`);
  console.log(`   API Key Index: ${API_KEY_INDEX}`);
  console.log(`   Market Index: ${MARKET_INDEX} (ETH SPOT)\n`);

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(apiClient);
  const accountApi = new AccountApi(apiClient);

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    // Get active orders
    const auth = await getAuthToken(signerClient, 8 * 60 * 60);
    const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_INDEX, auth);
    const orders = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
    
    if (orders.length === 0) {
      console.log(`⚠️ No active orders found for market ${MARKET_INDEX}`);
      console.log(`   Please create an order first using create_eth_spot_limit_order.ts`);
      return;
    }
    
    const firstOrder = orders[0];
    const orderIndex = parseInt(firstOrder.id || firstOrder.order_id || firstOrder.order_index || '0');
    
    console.log(`📝 Found order to modify:`);
    console.log(`   Order Index: ${orderIndex}`);
    console.log(`   Current Price: ${firstOrder.price || 'N/A'}`);
    console.log(`   Current Size: ${firstOrder.size || firstOrder.base_size || 'N/A'}\n`);

    // Modify order parameters
    const modifyParams = {
      marketIndex: MARKET_INDEX,
      orderIndex: orderIndex,
      baseAmount: 2000, // 0.002 ETH (2000 units) - new amount
      price: 285000, // $2850 (285,000 price units) - new price
      triggerPrice: 0, // No trigger price for limit orders
    };
    
    console.log(`📝 Modifying order with:`);
    console.log(`   New Base Amount: ${modifyParams.baseAmount} units (0.002 ETH)`);
    console.log(`   New Price: ${modifyParams.price} units ($2850.00)\n`);
    
    const [orderInfo, txHash, error] = await signerClient.modifyOrder(
      modifyParams.marketIndex,
      modifyParams.orderIndex,
      modifyParams.baseAmount,
      modifyParams.price,
      modifyParams.triggerPrice,
    );

    if (error) {
      console.error('❌ Failed to modify order:', error);
      return;
    }

    if (!txHash) {
      console.error('❌ No transaction hash returned');
      return;
    }

    console.log('✅ Order modification submitted!');
    console.log('📋 Order Info:', JSON.stringify(orderInfo, null, 2));
    console.log('🔗 Transaction Hash:', txHash);

    // Wait for transaction confirmation
    console.log('\n⏳ Waiting for transaction confirmation...');
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log('✅ Order modified successfully!');
      
      // Verify order was modified by checking active orders again
      const updatedOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_INDEX, auth);
      const updatedOrdersList = Array.isArray(updatedOrders) ? updatedOrders : (updatedOrders as any).orders || [];
      const modifiedOrder = updatedOrdersList.find((o: any) => 
        parseInt(o.id || o.order_id || o.order_index || '0') === orderIndex
      );
      
      if (modifiedOrder) {
        console.log(`\n✅ Verified order modification:`);
        console.log(`   New Price: ${modifiedOrder.price || 'N/A'}`);
        console.log(`   New Size: ${modifiedOrder.size || modifiedOrder.base_size || 'N/A'}`);
      }
    } catch (waitError) {
      console.error('❌ Transaction confirmation failed:', waitError instanceof Error ? waitError.message : String(waitError));
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  modifySpotOrder().catch(console.error);
}

export { modifySpotOrder };











