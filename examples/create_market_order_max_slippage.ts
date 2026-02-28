/**
 * Example: Create Market Order with Max Slippage Protection
 * 
 * This example demonstrates how to create market orders with maximum slippage protection.
 * The order will only execute if the slippage is within the specified limit.
 * 
 * Two methods are available:
 * 1. createMarketOrder_maxSlippage() - Creates order with max slippage limit
 * 2. createMarketOrder_ifSlippage() - Only creates order if slippage is acceptable
 */

import { SignerClient, MarketHelper, OrderApi, ApiClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function createMarketOrderMaxSlippageExample() {
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '1000', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  console.log('🚀 Market Order with Max Slippage Example');

  const apiClient = new ApiClient({ host: BASE_URL });
  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    // Initialize market helper
    const orderApi = new OrderApi(apiClient);
    const market = new MarketHelper(0, orderApi);
    await market.initialize();

    const baseAmount = market.amountToUnits(0.1); // 0.1 ETH
    const currentPrice = market.priceToUnits(4400); // $4400 (ideal price)

    // ============================================================================
    // Example 1: Market Order with Max Slippage (Always Creates Order)
    // ============================================================================
    console.log('\n📋 Example 1: Market Order with Max Slippage (1%)');

    const [orderInfo1, txHash1, error1] = await signerClient.createMarketOrder_maxSlippage({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: baseAmount,
      maxSlippage: 0.01, // 1% max slippage
      isAsk: false, // BUY order
      idealPrice: currentPrice, // $4400
    });

    if (error1) {
      console.error('❌ Failed:', error1);
    } else {
      console.log('✅ Order created:', txHash1);
      if (txHash1) await signerClient.waitForTransaction(txHash1, 60000, 2000);
    }

    console.log('\n📋 Example 2: Market Order If Slippage Acceptable (0.5%)');

    const [orderInfo2, txHash2, error2] = await signerClient.createMarketOrder_ifSlippage({
      marketIndex: 0,
      clientOrderIndex: Date.now() + 1,
      baseAmount: baseAmount,
      maxSlippage: 0.005, // 0.5% max slippage (stricter)
      isAsk: true, // SELL order
      idealPrice: currentPrice, // $4400
    });

    if (error2) {
      console.error('❌ Failed:', error2);
    } else {
      console.log('✅ Order created:', txHash2);
      if (txHash2) await signerClient.waitForTransaction(txHash2, 60000, 2000);
    }

    console.log('\n📋 Example 3: Sell Order with Tight Slippage (0.1%)');

    const [orderInfo3, txHash3, error3] = await signerClient.createMarketOrder_maxSlippage({
      marketIndex: 0,
      clientOrderIndex: Date.now() + 2,
      baseAmount: baseAmount,
      maxSlippage: 0.001, // 0.1% max slippage (very tight)
      isAsk: true, // SELL order
      idealPrice: currentPrice,
    });

    if (error3) {
      console.error('❌ Failed:', error3);
    } else {
      console.log('✅ Order created:', txHash3);
      if (txHash3) await signerClient.waitForTransaction(txHash3, 60000, 2000);
    }
    console.log('\n✅ Examples completed');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('create_market_order_max_slippage');
if (isMain) {
  createMarketOrderMaxSlippageExample().catch(console.error);
}

export { createMarketOrderMaxSlippageExample };


