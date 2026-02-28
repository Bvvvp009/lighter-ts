/**
 * Example: Cancel Order
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
    const auth = await getAuthToken(signerClient, 8 * 60 * 60);
    const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_INDEX, auth);
    const orders = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
    
    if (orders.length === 0) {
      console.log('⚠️ No active orders found');
      return;
    }
    
    const firstOrder = orders[0];
    const orderIndex = parseInt(firstOrder.id || firstOrder.order_id || firstOrder.order_index || '0');
    
    const [tx, txHash, error] = await signerClient.cancelOrder({
      marketIndex: MARKET_INDEX,
      orderIndex
    });

    if (error || !txHash) {
      console.error(`❌ Cancel failed: ${error || 'No transaction hash'}`);
      return;
    }

    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log(`✅ Order canceled: ${txHash}`);
    } catch (waitError) {
      console.error(`❌ Cancel failed: ${waitError instanceof Error ? waitError.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`❌ Error:`, error);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('cancel_order');
if (isMain) {
  cancelOrder().catch(console.error);
}

export { cancelOrder };
