/**
 * Example: Update Margin
 * 
 * This example demonstrates how to add or remove margin from a position.
 * Margin updates allow you to adjust your position's collateral.
 */

import { SignerClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function updateMarginExample() {
  const BASE_URL = process.env['BASE_URL'] ?? 'https://mainnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '1000', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '0', 10);

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  try {
    await client.initialize();
    await client.ensureWasmClient();

    const marketIndex = 0; // ETH/USDC market
    const usdcAmount = 100; // 100 USDC (will be scaled to 100000000 internally)

    // Add margin to a position
    console.log('📝 Adding margin to position...');
    const [addMarginInfo, addTxHash, addError] = await client.updateMargin(
      marketIndex,
      usdcAmount,  // USDC amount (in USDC units, will be scaled internally)
      0            // direction: 0 = add margin, 1 = remove margin
    );

    if (addError) {
      console.error('❌ Failed to add margin:', addError);
    } else {
      console.log('✅ Margin added successfully!');
      console.log('🔗 Transaction Hash:', addTxHash);
      
      if (addTxHash) {
        console.log('⏳ Waiting for transaction confirmation...');
        try {
          await client.waitForTransaction(addTxHash, 60000, 2000);
          console.log('✅ Transaction confirmed!');
        } catch (waitError) {
          console.error('❌ Transaction confirmation failed:', waitError);
        }
      }
    }

    // Remove margin from a position
    console.log('\n📝 Removing margin from position...');
    const [removeMarginInfo, removeTxHash, removeError] = await client.updateMargin(
      marketIndex,
      50,   // 50 USDC to remove
      1     // direction: 1 = remove margin
    );

    if (removeError) {
      console.error('❌ Failed to remove margin:', removeError);
    } else {
      console.log('✅ Margin removed successfully!');
      console.log('🔗 Transaction Hash:', removeTxHash);
      
      if (removeTxHash) {
        console.log('⏳ Waiting for transaction confirmation...');
        try {
          await client.waitForTransaction(removeTxHash, 60000, 2000);
          console.log('✅ Transaction confirmed!');
        } catch (waitError) {
          console.error('❌ Transaction confirmation failed:', waitError);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  updateMarginExample().catch(console.error);
}

export { updateMarginExample };


