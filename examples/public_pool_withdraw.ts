/**
 * Example: Withdraw from Public Pool
 * 
 * This example demonstrates how to burn shares (withdraw USDC) from a public pool.
 */

import { SignerClient } from '../dist/esm/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    console.log('🏦 Withdrawing from Public Pool...\n');

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

    // Pool account index from which to withdraw
    const poolAccountIndex = parseInt(process.env.POOL_ACCOUNT_INDEX || '281474976710651');
    const shareAmount = 5000; // Amount of shares to burn

    console.log(`Withdrawing from pool ${poolAccountIndex}...`);
    console.log(`Burning ${shareAmount} shares...\n`);
    
    try {
      const [burnInfo, txHash, error] = await signer.burnShares(
        poolAccountIndex,
        shareAmount
      );

      if (error) {
        console.error('❌ Error burning shares:', error);
        process.exit(1);
      }

      console.log('✅ Pool withdrawal successful');
      console.log(`   Tx Hash: ${txHash}`);
      console.log(`   Pool Index: ${poolAccountIndex}`);
      console.log(`   Shares Burned: ${shareAmount}`);

      console.log('\n💡 Tips:');
      console.log('   - Your USDC will be returned based on current share price');
      console.log('   - Include any realized profits or losses');
      console.log('   - Withdrawal may take time to process');
      console.log('   - Check transaction status for confirmation');

    } catch (error) {
      console.error('❌ Failed to withdraw from pool:', error);
      process.exit(1);
    }

    await signer.close();
    console.log('\n✅ Pool withdrawal completed');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
