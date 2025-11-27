/**
 * Example: Cancel Spot Order
 * Works for ETH SPOT (2048), BTC SPOT (2049), SOL SPOT (2051)
 * Uses the same cancel method as perpetual orders (tx_type=15)
 * NOTE: Spot markets are currently testnet-only
 */

import { SignerClient, ApiClient, OrderApi } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function getAuthToken(signerClient: SignerClient, expiryInSeconds: number = 8 * 60 * 60): Promise<string> {
  const auth = await signerClient.createAuthTokenWithExpiry(expiryInSeconds);
  return auth;
}

async function cancelSpotOrder() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  // Spot markets are testnet-only for now
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';
  
  // Market indices: 2048 (ETH SPOT), 2049 (Prove SPOT), 2050 (Zk SPOT)
  const MARKET_INDEX = 2048; // ETH SPOT

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
    console.log(activeOrders);
    const orders = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
    
    if (orders.length === 0) {
      console.log(`⚠️ No active orders found for market ${MARKET_INDEX}`);
      return;
    }
    
    const firstOrder = orders[0];
    const orderIndex = parseInt(firstOrder.id || firstOrder.client_order_id || firstOrder.client_order_index || '0');
    
    console.log(`📋 Canceling order ${orderIndex} on market ${MARKET_INDEX}...`);
    
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
      console.log(`✅ Spot order canceled: ${txHash.substring(0, 16)}...`);
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

if (require.main === module) {
  cancelSpotOrder().catch(console.error);
}

export { cancelSpotOrder };

