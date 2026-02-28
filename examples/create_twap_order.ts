/**
 * Example: Create TWAP Order with SL/TP
 */

import { SignerClient, OrderType, ApiClient, OrderApi, MarketHelper } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createTWAPOrderWithSLTP() {
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

  const currentPrice = market.lastPrice || market.priceToUnits(3961.79);
  const currentPriceInUnits = market.unitsToPrice(currentPrice);

  const twapOrderParams = {
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: market.amountToUnits(0.01),
    price: currentPriceInUnits,
    isAsk: false,
    orderType: OrderType.TWAP,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    orderExpiry: Date.now() + (30 * 60 * 1000)
  };

  try {
    const [tx, hash, error] = await signerClient.createOrder(twapOrderParams);

    if (error || !hash) {
      console.error(`❌ TWAP order failed: ${error || 'No hash returned'}`);
      return;
    }

    console.log(`✓ TWAP order created: ${hash}`);
    console.log(`  Duration: 30 minutes`);
    
    // Wait for order confirmation
    try {
      await signerClient.waitForTransaction(hash, 30000, 2000);
      console.log('✓ TWAP order placed and executing');
      console.log('  Note: Create SL/TP orders separately after TWAP starts executing');
    } catch (error) {
      console.error(`❌ TWAP order failed: ${trimException(error as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('create_twap_order');
if (isMain) {
  createTWAPOrderWithSLTP().catch(console.error);
}

export { createTWAPOrderWithSLTP };
