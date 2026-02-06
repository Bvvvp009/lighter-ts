/**
 * Example: Cancel Order
 * 
 * This example demonstrates how to cancel an existing order.
 * You need an existing order index to cancel (can be obtained from getAccountActiveOrders)
 */

import { SignerClient, ApiClient, OrderApi } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function getAuthToken(signerClient: SignerClient, expiryInSeconds: number = 8 * 60 * 60): Promise<string> {
  const auth = await signerClient.createAuthTokenWithExpiry(expiryInSeconds);
  return auth;
}

async function cancelOrder() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "237600");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "5");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const MARKET_INDEX = parseInt(process.env['MARKET_INDEX'] || '0');
  // Optional: Provide ORDER_INDEX to cancel a specific order
  const ORDER_INDEX = process.env['ORDER_INDEX'] ? parseInt(process.env['ORDER_INDEX']) : null;

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
    let orderIndexToCancel = ORDER_INDEX;
    
    // If no ORDER_INDEX provided, fetch active orders and use the first one
    if (orderIndexToCancel === null) {
      console.log('📋 Fetching active orders...\n');
      const auth = await getAuthToken(signerClient, 8 * 60 * 60);
      
      try {
        const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_INDEX, auth);
        const orders = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
        
        if (orders.length === 0) {
          console.log('⚠️ No active orders found to cancel');
          console.log('   Usage: Set ORDER_INDEX environment variable to cancel a specific order');
          console.log('   Example: ORDER_INDEX=12345 npx ts-node examples/cancel_order');
          return;
        }
        
        const firstOrder = orders[0];
        orderIndexToCancel = parseInt(firstOrder.id || firstOrder.order_id || firstOrder.order_index || '0');
        console.log(`✅ Found active order: ${orderIndexToCancel}\n`);
      } catch (error) {
        console.error(`❌ Error fetching active orders:`, error);
        console.log('\n   You can still cancel orders by providing ORDER_INDEX:');
        console.log('   Example: ORDER_INDEX=12345 npx ts-node examples/cancel_order');
        return;
      }
    }
    
    // Cancel the order
    console.log(`🗑️ Cancelling order ${orderIndexToCancel}...\n`);
    
    const [tx, txHash, error] = await signerClient.cancelOrder({
      marketIndex: MARKET_INDEX,
      orderIndex: orderIndexToCancel
    });

    if (error || !txHash) {
      console.error(`❌ Cancel failed: ${error || 'No transaction hash'}`);
      return;
    }

    console.log(`✅ Cancel transaction sent: ${txHash.substring(0, 16)}...\n`);
    
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log(`✅ Order successfully canceled!`);
    } catch (waitError) {
      console.log(`⏳ Cancel pending: ${txHash.substring(0, 16)}...`);
      console.log(`   Check transaction status: ${BASE_URL}/tx/${txHash}`);
    }
  } catch (error) {
    console.error(`❌ Error:`, error);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  cancelOrder().catch(console.error);
}

export { cancelOrder };
