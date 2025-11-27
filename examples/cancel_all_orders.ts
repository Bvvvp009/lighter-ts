/**
 * Example: Cancel All Orders
 */

import { SignerClient, ApiClient, OrderApi } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function getAuthToken(signerClient: SignerClient, expiryInSeconds: number = 8 * 60 * 60): Promise<string> {
  const auth = await signerClient.createAuthTokenWithExpiry(expiryInSeconds);
  return auth;
}

async function cancelAllOrders() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "4");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

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
    console.log('🚀 Canceling All Orders...\n');
    
    // Get auth token
    const auth = await getAuthToken(signerClient, 8 * 60 * 60);
    
    // Fetch all active orders across all markets
    console.log(`📋 Fetching all active orders...`);
    
    // Try to fetch orders for market 0 (ETH/USD) first
    // In production, you would iterate through all known markets
    const marketsToCheck = [0, 1, 2, 3, 4, 5]; // Common market indices
    
    let allOrders: any[] = [];
    
    for (const marketId of marketsToCheck) {
      try {
        const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, marketId, auth);
        const orders = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
        allOrders = allOrders.concat(orders);
      } catch (error) {
        // Skip markets that fail or don't have orders
        continue;
      }
    }
    
    if (allOrders.length === 0) {
      console.log('⚠️ No active orders found');
      await apiClient.close();
      return;
    }
    
    console.log(`\n📋 Found ${allOrders.length} active order(s) to cancel:`);
    allOrders.forEach((order: any, index: number) => {
      console.log(`   ${index + 1}. Market ${order.market_id || order.marketId}: ${order.side} ${order.type} - Size: ${order.size || order.base_amount} - Price: ${order.price}`);
    });
    console.log();
    
    console.log(`📋 Cancel All Parameters:`);
    console.log(`   Time In Force: 0 (IMMEDIATE)`);
    console.log(`   Time: 0\n`);
    
    const [tx, txHash, error] = await signerClient.cancelAllOrders(0, 0);

    if (error) {
      console.error(`❌ Cancel all orders failed: ${error}`);
      await apiClient.close();
      return;
    }

    if (!txHash || txHash === '') {
      console.error('❌ No transaction hash returned');
      await apiClient.close();
      return;
    }

    console.log(`✅ Cancel all request submitted: ${txHash.substring(0, 16)}...`);
    
    console.log(`⏳ Waiting for confirmation...`);
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log('✅ All orders canceled successfully');
    } catch (waitError) {
      console.error(`❌ Cancel all confirmation failed:`, waitError);
    }

    console.log('\n🎉 All orders cancelation complete!');
    await apiClient.close();
  } catch (error) {
    console.error(`❌ Error:`, error);
    await apiClient.close();
  }
}

if (require.main === module) {
  cancelAllOrders().catch(console.error);
}

export { cancelAllOrders };
