/**
 * Example: Create ETH SPOT TWAP Order
 * MarketIndex: 2048
 * MarketIndex: 2048 (ETH SPOT) - Available on mainnet
 * NOTE: Market indices: 2048 (ETH SPOT), 2049 (Prove SPOT), 2050 (Zk SPOT)
 */

import { SignerClient, OrderType, ApiClient, OrderApi, MarketHelper } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createEthSpotTWAPOrder() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "1");
  // Use BASE_URL from env or default to mainnet
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

  // For ETH SPOT: 1 ETH = 1,000,000 units, $1 = 100 price units
  // Try to use MarketHelper, but fallback to manual values if not available
  let baseAmount = 10000; // 0.01 ETH (10000 units)
  let price = 300000; // $3000 (300,000 price units)
  
  try {
    const market = new MarketHelper(2048, orderApi);
    await market.initialize();
    console.log(`📊 ETH SPOT Market: ${market.marketName}`);
    console.log(`   Last Price: ${market.formatPrice(market.lastPrice)}`);
    const currentPrice = market.lastPrice || market.priceToUnits(3000);
    price = market.unitsToPrice(currentPrice);
    baseAmount = market.amountToUnits(0.01);
  } catch (error) {
    console.log(`⚠️ MarketHelper not available for spot market, using manual values`);
    console.log(`   Using price: $${price / 100} (${price} units)`);
    console.log(`   Using amount: 0.01 ETH (${baseAmount} units)`);
  }

  const twapOrderParams = {
    marketIndex: 2048, // ETH SPOT
    clientOrderIndex: Date.now(),
    baseAmount: baseAmount,
    price: price,
    isAsk: false, // Buy order
    orderType: OrderType.TWAP,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    orderExpiry: Date.now() + (30 * 60 * 1000), // 30 minutes
  };

  try {
    // Note: Use createOrder for spot markets
    // For spot markets, use createOrder directly
    const [orderInfo, txHash, error] = await signerClient.createOrder({
      marketIndex: twapOrderParams.marketIndex,
      clientOrderIndex: twapOrderParams.clientOrderIndex,
      baseAmount: twapOrderParams.baseAmount,
      price: twapOrderParams.price,
      isAsk: twapOrderParams.isAsk,
      orderType: twapOrderParams.orderType,
      orderExpiry: twapOrderParams.orderExpiry,
      timeInForce: twapOrderParams.timeInForce,
      reduceOnly: false,
      triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
    });

    if (error || !txHash) {
      console.error(`❌ TWAP order failed: ${error || 'No transaction hash'}`);
      return;
    }

    console.log(`✓ ETH SPOT TWAP order created: ${txHash}`);
    console.log(`  Duration: 30 minutes`);
    
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log('✓ ETH SPOT TWAP order placed');
    } catch (waitError) {
      console.error(`❌ TWAP order failed: ${trimException(waitError as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createEthSpotTWAPOrder().catch(console.error);
}

export { createEthSpotTWAPOrder };

