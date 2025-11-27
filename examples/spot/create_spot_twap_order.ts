/**
 * Example: Create ETH SPOT TWAP Order
 * MarketIndex: 2048
 * NOTE: Spot markets are currently testnet-only
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
  // Spot markets are testnet-only for now
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

  // Initialize market helper for ETH SPOT (MarketIndex 2048)
  const market = new MarketHelper(2048, orderApi);
  await market.initialize();

  console.log(`📊 ETH SPOT Market: ${market.marketName}`);
  console.log(`   Last Price: ${market.formatPrice(market.lastPrice)}`);

  const currentPrice = market.lastPrice || market.priceToUnits(3000);
  const currentPriceInUnits = market.unitsToPrice(currentPrice);

  const twapOrderParams = {
    marketIndex: 2048, // ETH SPOT
    clientOrderIndex: Date.now(),
    baseAmount: market.amountToUnits(0.01), // Adjust amount as needed
    price: currentPriceInUnits,
    isAsk: false, // Buy order
    orderType: OrderType.TWAP,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    orderExpiry: Date.now() + (30 * 60 * 1000), // 30 minutes
  };

  try {
    const result = await signerClient.createUnifiedOrder(twapOrderParams);

    if (result.success) {
      console.log(`✓ ETH SPOT TWAP order created: ${result.mainOrder.hash.substring(0, 16)}...`);
      console.log(`  Duration: 30 minutes`);
      
      // Wait for main order
      try {
        await signerClient.waitForTransaction(result.mainOrder.hash, 30000, 2000);
        console.log('✓ ETH SPOT TWAP order placed');
      } catch (error) {
        console.error(`❌ TWAP order failed: ${trimException(error as Error)}`);
      }
      
      // Wait for SL/TP orders if any
      if (result.batchResult.hashes.length > 0) {
        console.log(`✓ ${result.batchResult.hashes.length} SL/TP order(s) pending`);
        for (const hash of result.batchResult.hashes) {
          if (hash) {
            try {
              await signerClient.waitForTransaction(hash, 30000, 2000);
            } catch (error) {
              console.log(`⚠️ SL/TP: ${trimException(error as Error)}`);
            }
          }
        }
      }
    } else {
      console.error(`❌ Order failed: ${result.mainOrder.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  createEthSpotTWAPOrder().catch(console.error);
}

export { createEthSpotTWAPOrder };

