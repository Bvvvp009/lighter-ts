/**
 * Example: Create Limit Order with SL/TP
 */

import { SignerClient, OrderType, ApiClient, OrderApi, MarketHelper } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createLimitOrderWithSLTP() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(apiClient);
  
  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  // Initialize market helper once
  const market = new MarketHelper(0, orderApi);
  await market.initialize();

  const otocoOrderParams = {
    mainOrder: {
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: 60,
      price: 200000,
      isAsk: false, // Buy
      orderType: OrderType.LIMIT as OrderType.LIMIT
    },
    stopLoss: {
      triggerPrice: 190000,
      isLimit: true
    },
    takeProfit: {
      triggerPrice: 210000,
      isLimit: true
    }
  };

  try {   
    const result = await signerClient.createOtocoOrder(otocoOrderParams);

    if (result.error || !result.hash) {
      console.error(`❌ OTOCO order failed: ${result.error || 'No transaction hash returned'}`);
      return;
    }

    console.log(`\n📊 OTOCO Order Creation Results:`);
    console.log(`   Success: true`);
    console.log(`   Grouped Tx Hash: ${result.hash}`);

    try {
      await signerClient.waitForTransaction(result.hash, 30000, 2000);
      console.log(`\n✅ Limit OTOCO order placed: ${result.hash}`);
    } catch (error) {
      console.error(`❌ Order failed: ${trimException(error as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('create_limit_order');
if (isMain) {
  createLimitOrderWithSLTP().catch(console.error);
}

export { createLimitOrderWithSLTP };
