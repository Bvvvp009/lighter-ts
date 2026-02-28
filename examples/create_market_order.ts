/**
 * Example: Create Market Order with Error Handling and Status Checking
 */

import { SignerClient, ApiClient, OrderType } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createMarketOrderExample() {
  // Use testnet credentials (matching create_limit_order.ts - hardcoded for consistency)
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';
  const TX_CONFIRM_TIMEOUT_MS = Number.parseInt(process.env['TX_CONFIRM_TIMEOUT_MS'] ?? '120000', 10);
  const TX_POLL_INTERVAL_MS = Number.parseInt(process.env['TX_POLL_INTERVAL_MS'] ?? '2000', 10);
  const MARKET_ID = 0; // ETH/USDC perps
  const CLIENT_ORDER_INDEX = Date.now();

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  const apiClient = new ApiClient({ host: BASE_URL });

  // Get current market price for better pricing
  const { OrderApi, MarketHelper } = await import('../src');
  const orderApi = new OrderApi(apiClient);
  const market = new MarketHelper(0, orderApi);
  await market.initialize();
  const currentPrice = (market as any).lastPrice || market.priceToUnits(2800) || 280000;
  
  const otocoOrderParams = {
    mainOrder: {
      marketIndex: MARKET_ID,
      clientOrderIndex: CLIENT_ORDER_INDEX,
      baseAmount: 60,
      idealPrice: 208000,
      maxSlippage: 0.001,
      isAsk: false,
      orderType: OrderType.MARKET as OrderType.MARKET
    },
    stopLoss: {
      triggerPrice: 190000,
      price: 190000,
      isLimit: false
    },
    takeProfit: {
      triggerPrice: 210000,
      price: 210000,
      isLimit: false
    }
  }
  
  console.log(`📝 Creating MARKET order with SL/TP (using OTOCO)`);
  console.log(`   Market Index: ${MARKET_ID}`);
  console.log(`   Base Amount: ${otocoOrderParams.mainOrder.baseAmount} units`);
  console.log(`   Ideal Price: ${otocoOrderParams.mainOrder.idealPrice} ($${otocoOrderParams.mainOrder.idealPrice! / 100})`);
  console.log(`   SL Trigger: ${otocoOrderParams.stopLoss.triggerPrice} ($${otocoOrderParams.stopLoss.triggerPrice / 100})`);
  console.log(`   TP Trigger: ${otocoOrderParams.takeProfit.triggerPrice} ($${otocoOrderParams.takeProfit.triggerPrice / 100})\n`);
  try {
    const result = await signerClient.createOtocoOrder(otocoOrderParams);

    if (result.error || !result.hash) {
      console.error(`❌ OTOCO order failed: ${result.error || 'No transaction hash returned'}`);
      return;
    }

    const txHash = result.hash;
    console.log(`\n📊 OTOCO Order Creation Results:`);
    console.log(`   Success: true`);
    console.log(`   Grouped Tx Hash: ${txHash}`);
    console.log(`   Confirm Timeout: ${TX_CONFIRM_TIMEOUT_MS}ms`);

    try {
      await signerClient.waitForTransaction(txHash, TX_CONFIRM_TIMEOUT_MS, TX_POLL_INTERVAL_MS);
      console.log(`✅ Market order placed: ${txHash}`);
    } catch (error) {
      const waitError = trimException(error as Error);
      try {
        const txApi = new (await import('../src')).TransactionApi(apiClient);
        const tx = await txApi.getTransaction({ by: 'hash', value: txHash });
        const status = typeof tx.status === 'number' ? tx.status : Number.parseInt(String(tx.status), 10);
        if (status >= SignerClient.TX_STATUS_COMMITTED) {
          console.log(`⚠️ Confirmation timeout, but tx is on-chain with status ${status}: ${txHash}`);
          return;
        }
      } catch {
        console.log(`⚠️ Confirmation timeout; tx may still be pending/submitted: ${txHash}`);
        return;
      }

      console.error(`❌ Order failed: ${waitError}`);
      return;
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('create_market_order');
if (isMain) {
  createMarketOrderExample().catch(console.error);
}

export { createMarketOrderExample };
