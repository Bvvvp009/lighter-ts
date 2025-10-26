/**
 * Example: Cancel Order
 */

import { SignerClient, ApiClient, OrderApi } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function getAuthToken(signerClient: SignerClient, expiryInSeconds: number = 3600): Promise<string> {
  const auth = await signerClient.createAuthTokenWithExpiry(expiryInSeconds);
  return auth;
}

async function cancelOrder() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "4");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const MARKET_INDEX = parseInt(process.env['MARKET_INDEX'] || '0');

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  const apiClient = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(apiClient);

  try {
    console.log('🚀 Canceling Order...\n');
    
    console.log(`📋 Fetching active orders for market ${MARKET_INDEX}...`);
    
    // Get auth token
    const auth = await getAuthToken(signerClient, 3600);
    
    // Fetch active orders
    const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_INDEX, auth);
    
    const orders = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
    
    if (orders.length === 0) {
      console.log('⚠️ No active orders found in this market');
      await apiClient.close();
      return;
    }
    
    // Get the first order
    const firstOrder = orders[0];
    const orderIndex = parseInt(firstOrder.id || firstOrder.order_id || firstOrder.order_index || '0');
    
    console.log(`📋 Cancel Parameters:`);
    console.log(`   Market Index: ${MARKET_INDEX}`);
    console.log(`   Order ID: ${firstOrder.id}`);
    console.log(`   Order Index: ${orderIndex}`);
    console.log(`   Side: ${firstOrder.side}`);
    console.log(`   Type: ${firstOrder.type}`);
    console.log(`   Size: ${firstOrder.size || firstOrder.base_amount}`);
    console.log(`   Price: ${firstOrder.price}\n`);
    
    const [tx, txHash, error] = await signerClient.cancelOrder({
      marketIndex: MARKET_INDEX,
      orderIndex
    });

    if (error) {
      console.error(`❌ Cancel order failed: ${error}`);
      await apiClient.close();
      return;
    }

    if (!txHash || txHash === '') {
      console.error('❌ No transaction hash returned');
      await apiClient.close();
      return;
    }

    console.log(`✅ Cancel request submitted: ${txHash.substring(0, 16)}...`);
    
    console.log(`⏳ Waiting for confirmation...`);
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log('✅ Order canceled successfully');
    } catch (waitError) {
      console.error(`❌ Cancel confirmation failed:`, waitError);
    }

    console.log('\n🎉 Order cancelation complete!');
    await apiClient.close();
  } catch (error) {
    console.error(`❌ Error:`, error);
    await apiClient.close();
  }
}

if (require.main === module) {
  cancelOrder().catch(console.error);
}

export { cancelOrder };
