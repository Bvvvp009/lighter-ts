/**
 * Example: Add Collateral to Isolated Margin Position
 * 
 * This example demonstrates how to add additional collateral (USDC) to an
 * isolated margin position to prevent liquidation or increase buying power.
 */

import { SignerClient } from '../dist/esm/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    console.log('💰 Adding Collateral to Isolated Margin Position...\n');

    const baseUrl = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
    const privateKey = process.env.API_PRIVATE_KEY;
    const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0');
    const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0');

    if (!privateKey) {
      throw new Error('Missing API_PRIVATE_KEY in .env');
    }

    const signer = new SignerClient({
      url: baseUrl,
      privateKey,
      accountIndex,
      apiKeyIndex,
    });

    await signer.initialize();
    await signer.ensureWasmClient();

    // Add 10.5 USDC collateral to isolated margin position
    const usdcAmount = 10.5; // USDC amount to add
    console.log(`Adding ${usdcAmount} USDC collateral to ETH market isolated position...`);
    
    try {
      const [marginInfo, txHash, error] = await signer.updateMargin(
        0, // marketIndex: ETH market
        usdcAmount,
        SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL
      );

      if (error) {
        console.error('❌ Error adding collateral:', error);
        process.exit(1);
      }

      console.log('✅ Collateral added successfully');
      console.log(`   Tx Hash: ${txHash}`);
      console.log(`   Market: ETH (index 0)`);
      console.log(`   Amount Added: ${usdcAmount} USDC`);
      console.log(`   Direction: Add Collateral`);

      console.log('\n💡 Tip: This increases the margin available for this isolated position');
      console.log('   Reduces liquidation risk and increases position size capacity');

    } catch (error) {
      console.error('❌ Failed to add collateral:', error);
      process.exit(1);
    }

    await signer.close();
    console.log('\n✅ Collateral addition completed');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
