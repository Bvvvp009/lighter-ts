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
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '237600', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '5', 10);
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

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

  const currentPriceInUnits = market.priceToUnits(3032.82); // align with working market example

  const twapOrderParams = {
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 100, // Small order (0.001 ETH)
    price: currentPriceInUnits,
    isAsk: false,
    orderType: OrderType.TWAP,
    orderExpiry: Date.now() + (30 * 60 * 1000), // 30 minutes expiry in milliseconds
    triggerPrice: currentPriceInUnits, // TWAP needs trigger price
    stopLoss: {
      triggerPrice: market.priceToUnits(2800),
      isLimit: false
    },
    takeProfit: {
      triggerPrice: market.priceToUnits(3100),
      isLimit: false
    }
  };

  try {
    const orderExpiry = Date.now() + (30 * 60 * 1000);
    const baseClientIndex = twapOrderParams.clientOrderIndex;
    
    // TWAP order must be created alone (not in batch with SL/TP)
    // SL/TP should be added after TWAP starts executing
    const twapOrder = {
      marketIndex: 0,
      clientOrderIndex: baseClientIndex,
      baseAmount: twapOrderParams.baseAmount,
      price: twapOrderParams.price,
      isAsk: false, // Buy
      orderType: SignerClient.ORDER_TYPE_TWAP,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: SignerClient.NIL_TRIGGER_PRICE, // TWAP uses NIL_TRIGGER_PRICE
      orderExpiry: orderExpiry
    };

    console.log('📝 Creating TWAP order (without SL/TP)...');
    const [txInfo, txHash, error] = await signerClient.createOrder(twapOrder);

    if (error) {
      console.error(`❌ Order failed: ${error}`);
      return;
    }

    if (!txHash) {
      console.error(`❌ No transaction hash returned`);
      return;
    }

    console.log(`✅ TWAP order created: ${txHash.substring(0, 16)}...`);
    console.log(`   Duration: 30 minutes`);
    console.log(`   Base Amount: ${twapOrderParams.baseAmount} units`);
    
    // Wait for order confirmation
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log('✅ TWAP order confirmed');
      console.log('\n💡 Note: SL/TP orders should be added separately after TWAP starts executing');
    } catch (error) {
      console.error(`❌ TWAP order confirmation timeout: ${trimException(error as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  }
}

if (require.main === module) {
  createTWAPOrderWithSLTP().catch(console.error);
}

export { createTWAPOrderWithSLTP };
