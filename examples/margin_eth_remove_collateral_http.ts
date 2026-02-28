/**
 * Example: Remove Collateral from Isolated Margin Position
 * 
 * This example demonstrates how to remove collateral (USDC) from an
 * isolated margin position to free up capital.
 */

import { SignerClient } from '../dist/esm/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    console.log('💸 Removing Collateral from Isolated Margin Position...\n');

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

    // Remove 5.0 USDC collateral from isolated margin position
    const usdcAmount = 5.0; // USDC amount to remove
    console.log(`Removing ${usdcAmount} USDC collateral from ETH market isolated position...`);
    
    try {
      const [marginInfo, txHash, error] = await signer.updateMargin(
        0, // marketIndex: ETH market
        usdcAmount,
        SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL
      );

      if (error) {
        console.error('❌ Error removing collateral:', error);
        process.exit(1);
      }

      console.log('✅ Collateral removed successfully');
      console.log(`   Tx Hash: ${txHash}`);
      console.log(`   Market: ETH (index 0)`);
      console.log(`   Amount Removed: ${usdcAmount} USDC`);
      console.log(`   Direction: Remove Collateral`);

      console.log('\n💡 Tip: This decreases the margin tied to this isolated position');
      console.log('   Only remove collateral if you have sufficient margin for your open positions');
      console.log('   ⚠️  Ensure this doesn\'t trigger liquidation');

    } catch (error) {
      console.error('❌ Failed to remove collateral:', error);
      process.exit(1);
    }

    await signer.close();
    console.log('\n✅ Collateral removal completed');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
