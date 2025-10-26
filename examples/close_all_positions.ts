/**
 * Example: Close All Positions
 */

import { SignerClient } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function closeAllPositions() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "4");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    console.log('🚀 Closing All Positions...\n');
    
    const marketsToClose = [0, 1, 2];
    
    for (const marketIndex of marketsToClose) {
      console.log(`\n📋 Closing Market ${marketIndex}...`);
      
      const [tx, txHash, error] = await signerClient.createMarketOrder({
        marketIndex,
        clientOrderIndex: Date.now(),
        baseAmount: 1000,
        avgExecutionPrice: 450000, // $4500 in price units (scaled by 100)
        isAsk: false,
        reduceOnly: true
      });

      if (error) {
        console.error(`❌ Market ${marketIndex} failed: ${error}`);
        continue;
      }

      if (!txHash || txHash === '') {
        console.error(`❌ No transaction hash returned for market ${marketIndex}`);
        continue;
      }

      console.log(`✅ Market ${marketIndex} close request submitted: ${txHash.substring(0, 16)}...`);
      
      console.log(`⏳ Waiting for confirmation...`);
      try {
        await signerClient.waitForTransaction(txHash, 30000, 2000);
        console.log(`✓ Market ${marketIndex} closed successfully`);
      } catch (waitError) {
        console.error(`❌ Market ${marketIndex} confirmation failed: ${waitError instanceof Error ? waitError.message : String(waitError)}`);
      }
    }
    
    console.log('\n🎉 All position closures complete!');
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (require.main === module) {
  closeAllPositions().catch(console.error);
}

export { closeAllPositions };
