import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient, OrderApi } from '../src/index';
import { waitAndCheckTransaction } from '../src/utils/transaction-helper';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Market Order with Stop Loss and Take Profit
 * 
 * This example demonstrates how to:
 * 1. Execute a market order to open a position
 * 2. Immediately place Stop Loss (SL) order for protection
 * 3. Immediately place Take Profit (TP) order to lock in gains
 * 
 * SL and TP are placed as separate orders AFTER the market order executes.
 * They automatically close your position when triggered.
 * 
 * Prerequisites:
 * - API_PRIVATE_KEY in .env
 * - API_KEY_INDEX in .env
 * - ACCOUNT_INDEX in .env  
 * - BASE_URL in .env
 */

const BASE_URL = process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

interface MarketOrderWithSlTpConfig {
  marketIndex: number;
  baseAmount: number;
  isAsk: boolean; // true = SHORT (sell), false = LONG (buy)
  stopLossPercent: number; // e.g., 5 = 5% loss
  takeProfitPercent: number; // e.g., 5 = 5% gain
  leverage: number; // Leverage multiplier (e.g., 5 for 5x)
}

async function getCurrentMarketPrice(apiClient: ApiClient, marketIndex: number): Promise<number> {
  try {
    const orderApi = new OrderApi(apiClient);
    const details = await orderApi.getOrderBookDetails({ market_id: marketIndex, depth: 1 }) as any;
    
    if (details.order_book_details && details.order_book_details.length > 0) {
      const marketInfo = details.order_book_details[0];
      return parseFloat(marketInfo.last_trade_price);
    }
  } catch (error) {
    console.error('Error fetching market price:', error);
  }
  return 0;
}

async function executeMarketOrderWithSlTp(
  client: SignerClient,
  apiClient: ApiClient,
  config: MarketOrderWithSlTpConfig
): Promise<void> {
  console.log('\n🎯 Market Order with SL/TP Protection');
  console.log(`   Direction: ${config.isAsk ? 'SHORT' : 'LONG'} | Size: ${config.baseAmount} | SL: ${config.stopLossPercent}% | TP: ${config.takeProfitPercent}%\n`);

  // Get current market price
  const currentPrice = await getCurrentMarketPrice(apiClient, config.marketIndex);
  
  if (currentPrice === 0) {
    console.error('❌ Could not fetch market price');
    return;
  }

  const priceDecimals = 2;
  const priceMultiplier = Math.pow(10, priceDecimals);
  const priceInUnits = Math.round(currentPrice * priceMultiplier);
  
  console.log(`Current price: $${currentPrice.toFixed(6)}`);

  // Execute market order
  const slippageMultiplier = config.isAsk ? 0.95 : 1.05;
  const avgExecutionPrice = Math.max(1, Math.round(priceInUnits * slippageMultiplier));
  const clientOrderIndex = Date.now();

  const [, marketTxHash, marketErr] = await client.createMarketOrder({
    marketIndex: config.marketIndex,
    clientOrderIndex,
    baseAmount: config.baseAmount,
    avgExecutionPrice,
    isAsk: config.isAsk,
    reduceOnly: false
  });

  if (marketErr) {
    console.error(`❌ Market order failed: ${marketErr}`);
    return;
  }

  console.log(`✅ Market order: ${marketTxHash}`);

  // Wait for execution
  if (marketTxHash) {
    const result = await waitAndCheckTransaction(apiClient, marketTxHash, {
      maxWaitTime: 30000,
      pollInterval: 2000,
      silent: true
    });

    if (!result.success) {
      console.error(`❌ Execution failed: ${result.error}`);
      return;
    }
  }

  // Wait for nonce refresh
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Calculate SL/TP prices
  const priceMovementSL = config.stopLossPercent / config.leverage;
  const priceMovementTP = config.takeProfitPercent / config.leverage;
  
  const slPrice = config.isAsk
    ? Math.round(priceInUnits * (1 + priceMovementSL / 100))
    : Math.round(priceInUnits * (1 - priceMovementSL / 100));

  const tpPrice = config.isAsk
    ? Math.round(priceInUnits * (1 - priceMovementTP / 100))
    : Math.round(priceInUnits * (1 + priceMovementTP / 100));

  console.log(`SL: $${(slPrice / priceMultiplier).toFixed(6)} | TP: $${(tpPrice / priceMultiplier).toFixed(6)}`);

  // Place Stop Loss order
  const slClientOrderIndex = Date.now() + 1000;
  const [, slTxHash, slErr] = await client.createSlLimitOrder(
    config.marketIndex,
    slClientOrderIndex,
    config.baseAmount,
    slPrice,
    slPrice,
    !config.isAsk,
    true
  );

  if (slErr) {
    console.error(`❌ SL failed: ${slErr}`);
  } else {
    console.log(`✅ Stop Loss: ${slTxHash}`);
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Place Take Profit order
  const tpClientOrderIndex = Date.now() + 2000;
  const [, tpTxHash, tpErr] = await client.createTpLimitOrder(
    config.marketIndex,
    tpClientOrderIndex,
    config.baseAmount,
    tpPrice,
    tpPrice,
    !config.isAsk,
    true
  );

  if (tpErr) {
    console.error(`❌ TP failed: ${tpErr}`);
  } else {
    console.log(`✅ Take Profit: ${tpTxHash}`);
  }

  // Summary
  console.log('\n📊 Result:');
  console.log(`   Market: ${marketErr ? '❌' : '✅'} | SL: ${slErr ? '❌' : '✅'} | TP: ${tpErr ? '❌' : '✅'}`);
  
  if (!marketErr && !slErr && !tpErr) {
    console.log('   🎉 Position fully protected with SL & TP!');
  }
}

async function main() {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('❌ API_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });

  try {
    await client.initialize();
    await client.ensureWasmClient();

    // Example: LONG position with 5% SL and 5% TP at 5x leverage
    await executeMarketOrderWithSlTp(client, apiClient, {
      marketIndex: 0, // ETH/USDC or first market
      baseAmount: 1000, // 0.1 ETH (adjust based on market decimals)
      isAsk: false, // false = LONG (buy), true = SHORT (sell)
      stopLossPercent: 5, // 5% position loss
      takeProfitPercent: 5, // 5% position gain
      leverage: 5 // 5x leverage
    });

    await client.close();
    await apiClient.close();

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main().catch(console.error);

