/**
 * Example: Create Orders with Multiple API Keys
 */

import { SignerClient, ApiClient, OrderType, OrderApi, MarketHelper } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function createWithMultipleKeys() {
  const API_KEY_1 = process.env['API_KEY_1'] || process.env['API_PRIVATE_KEY'] || '';
  const API_KEY_2 = process.env['API_KEY_2'] || process.env['API_PRIVATE_KEY_2'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const DEFAULT_API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "4");
  const SECONDARY_API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX_2'] || String(DEFAULT_API_KEY_INDEX));
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  const configurations = [
    { name: 'Account 1', privateKey: API_KEY_1, accountIndex: ACCOUNT_INDEX, apiKeyIndex: DEFAULT_API_KEY_INDEX },
    ...(API_KEY_2 ? [{ name: 'Account 2', privateKey: API_KEY_2, accountIndex: ACCOUNT_INDEX, apiKeyIndex: SECONDARY_API_KEY_INDEX }] : [])
  ];

  if (!API_KEY_1) {
    throw new Error('Missing API key. Set API_KEY_1 or API_PRIVATE_KEY in .env');
  }

  if (!API_KEY_2) {
    console.log('ℹ️ API_KEY_2/API_PRIVATE_KEY_2 not set; running single-key flow with Account 1 only.\n');
  }

  console.log('🚀 Creating Orders with Multiple API Keys...\n');
  let successfulOrders = 0;
  let failedOrders = 0;

  try {
    for (const config of configurations) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 ${config.name}`);
      console.log(`${'='.repeat(60)}`);
      
      const apiClient = new ApiClient({ host: BASE_URL });
      const signerClient = new SignerClient({
        url: BASE_URL,
        privateKey: config.privateKey,
        accountIndex: config.accountIndex,
        apiKeyIndex: config.apiKeyIndex
      });

      await signerClient.initialize();
      await signerClient.ensureWasmClient();

      // Initialize market helper once per account
      const orderApi = new OrderApi(apiClient);
      const market = new MarketHelper(0, orderApi);
      await market.initialize();
      const marketDetails = await orderApi.getOrderBookDetails({ market_id: 0 });
      
      const lastPriceUnits = market.priceToUnits(market.lastPrice || 2800);
      const price = Math.max(1, Math.floor(lastPriceUnits * 0.99)); // Conservative BUY limit below market
      const minBaseAmount = Math.ceil(Number(marketDetails.min_base_amount || 0));
      const minQuoteAmount = Math.ceil(Number(marketDetails.min_quote_amount || 0));
      const baseFromQuoteFloor = price > 0 ? Math.ceil((minQuoteAmount * 2) / price) : 0;
      const baseAmount = Math.max(market.amountToUnits(0.05), minBaseAmount * 2, baseFromQuoteFloor);

      console.log(`📋 Order Parameters:`);
      console.log(`   Account Index: ${config.accountIndex}`);
      console.log(`   API Key Index: ${config.apiKeyIndex}`);
      console.log(`   Base Amount: ${baseAmount} (0.05 ETH)`);
      console.log(`   Price: ${price} ($${(price / 100).toFixed(2)})\n`);

      const [tx, hash, error] = await signerClient.createOrder({
        marketIndex: 0,
        clientOrderIndex: Date.now(),
        baseAmount,
        price,
        isAsk: false, // Buy
        orderType: OrderType.LIMIT
      });

      if (error || !hash) {
        console.error(`❌ Order failed: ${error || 'No hash returned'}`);
        failedOrders++;
        await signerClient.close();
        await apiClient.close();
        continue;
      }

      console.log(`✅ Order created: ${hash}`);
      console.log(`⏳ Waiting for confirmation...`);
      
      try {
        await signerClient.waitForTransaction(hash, 30000, 2000);
        console.log(`✅ ${config.name} order confirmed`);
        successfulOrders++;
      } catch (waitError) {
        console.error(`❌ ${config.name} confirmation failed:`, waitError);
        failedOrders++;
      }

      await signerClient.close();
      await apiClient.close();
    }
    
    console.log(`\n📊 Summary: ${successfulOrders} succeeded, ${failedOrders} failed\n`);
  } catch (error) {
    console.error(`❌ Error:`, error);
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('create_with_multiple_keys');
if (isMain) {
  createWithMultipleKeys().catch(console.error);
}

export { createWithMultipleKeys };
