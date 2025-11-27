/**
 * Example: Create Orders with Multiple API Keys
 */

import { SignerClient, ApiClient, OrderType, OrderApi, MarketHelper } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function createWithMultipleKeys() {
  const API_KEY_1 = process.env['API_KEY_1'] || '';
  const API_KEY_2 = process.env['API_KEY_2'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  const configurations = [
    { name: 'Account 1', privateKey: API_KEY_1, accountIndex: ACCOUNT_INDEX, apiKeyIndex: 1 },
    { name: 'Account 2', privateKey: API_KEY_2, accountIndex: ACCOUNT_INDEX, apiKeyIndex: 2 }
  ];

  console.log('🚀 Creating Orders with Multiple API Keys...\n');

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
      
      const baseAmount = market.amountToUnits(0.05);
      const price = market.priceToUnits(4400 + (config.apiKeyIndex * 10));

      console.log(`📋 Order Parameters:`);
      console.log(`   Account Index: ${config.accountIndex}`);
      console.log(`   API Key Index: ${config.apiKeyIndex}`);
      console.log(`   Base Amount: ${baseAmount} (0.05 ETH)`);
      console.log(`   Price: ${price} ($${(price / 100).toFixed(2)})\n`);

      const result = await signerClient.createUnifiedOrder({
        marketIndex: 0,
        clientOrderIndex: Date.now(),
        baseAmount,
        price,
        isAsk: false, // Buy
        orderType: OrderType.LIMIT
      });

      if (!result.success) {
        console.error(`❌ Order failed: ${result.mainOrder.error || 'Unknown error'}`);
        await signerClient.close();
        await apiClient.close();
        continue;
      }

      if (!result.mainOrder.hash || result.mainOrder.hash === '') {
        console.error('❌ No transaction hash returned');
        await signerClient.close();
        await apiClient.close();
        continue;
      }

      console.log(`✅ Order created: ${result.mainOrder.hash.substring(0, 16)}...`);
      console.log(`⏳ Waiting for confirmation...`);
      
      try {
        await signerClient.waitForTransaction(result.mainOrder.hash, 30000, 2000);
        console.log(`✅ ${config.name} order confirmed`);
      } catch (waitError) {
        console.error(`❌ ${config.name} confirmation failed:`, waitError);
      }

      await signerClient.close();
      await apiClient.close();
    }
    
    console.log(`\n🎉 All orders created successfully!\n`);
  } catch (error) {
    console.error(`❌ Error:`, error);
  }
}

if (require.main === module) {
  createWithMultipleKeys().catch(console.error);
}

export { createWithMultipleKeys };
