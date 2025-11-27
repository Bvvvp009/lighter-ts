/**
 * Example: Create ETH SPOT Limit Order
 * MarketIndex: 2048
 * NOTE: Spot markets are currently testnet-only
 */

import { SignerClient, OrderType, ApiClient, AccountApi } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createEthSpotLimitOrder() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  // Spot markets are testnet-only for now
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const accountApi = new AccountApi(apiClient);
  
  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  await checkPositions(accountApi, ACCOUNT_INDEX, 2048);

  // Note: Spot markets may not be available via Order API yet, so we use manual values
  // For ETH SPOT: 1 ETH = 1,000,000 units, $1 = 100 price units
  // 0.001 ETH = 1,000 units
  // $3000 = 300,000 price units
    // Market indices: 2048 (ETH SPOT), 2049 (Prove SPOT), 2050 (Zk SPOT)

  const limitOrderParams = {
    marketIndex: 2048, // ETH SPOT
    clientOrderIndex: Date.now(),
    baseAmount: 1000, // 0.001 ETH (1000 units)
    price: 280000, // $3000 (300,000 price units)
    isAsk: false, // Buy order (0 = buy, 1 = sell)
    orderType: OrderType.LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    orderExpiry: Date.now() + (60 * 60 * 1000), // 1 hour expiry
    reduceOnly: false,
    triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
  };


  try {
    const [orderInfo, txHash, error] = await signerClient.createOrder(limitOrderParams);

    if (error) {
      console.error(`❌ Order failed: ${error}`);
      return;
    }

    if (!txHash) {
      console.error(`❌ Order failed: No transaction hash returned`);
      return;
    }

    console.log(`✅ Order created: ${txHash.substring(0, 16)}...`);

    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log(`✅ Order confirmed: ${txHash.substring(0, 16)}...`);
      await checkPositions(accountApi, ACCOUNT_INDEX, 2048);
    } catch (error) {
      console.error(`❌ Transaction failed: ${trimException(error as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
    if (error instanceof Error && (error as any).response) {
      const apiError = (error as any).response.data;
    }
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Helper function to check positions
async function checkPositions(accountApi: any, accountIndex: number, marketIndex: number) {
  try {
    const account = await accountApi.getAccount({
      by: 'index',
      value: accountIndex.toString()
    });
    
    const positions = (account as any).positions || [];
    const spotPosition = positions.find((p: any) => p.market_id === marketIndex);
    
    if (spotPosition) {
      console.log(`📊 Position: ${spotPosition.side} ${spotPosition.size} @ $${parseInt(spotPosition.entry_price) / 100}`);
      return spotPosition;
    }
    return null;
  } catch (error) {
    console.warn(`⚠️ Could not check positions: ${error}`);
    return null;
  }
}

if (require.main === module) {
  createEthSpotLimitOrder().catch(console.error);
}

export { createEthSpotLimitOrder };

