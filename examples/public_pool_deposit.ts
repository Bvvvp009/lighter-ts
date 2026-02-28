/**
 * Example: Deposit to Public Pool
 * 
 * This example demonstrates how to mint shares (deposit USDC) into a public pool
 * to earn a percentage of the pool's trading profits.
 */

import { SignerClient } from '../dist/esm/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    console.log('💰 Depositing to Public Pool...\n');

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

    // Pool account index where we want to deposit
    // This should be a valid public pool account index
    const poolAccountIndex = parseInt(process.env.POOL_ACCOUNT_INDEX || '281474976710651');
    const shareAmount = 10000; // Amount of shares to mint

    console.log(`Depositing to pool ${poolAccountIndex}...`);
    console.log(`Minting ${shareAmount} shares...\n`);
    
    try {
      const [mintInfo, txHash, error] = await signer.mintShares(
        poolAccountIndex,
        shareAmount
      );

      if (error) {
        console.error('❌ Error minting shares:', error);
        process.exit(1);
      }

      console.log('✅ Pool deposit successful');
      console.log(`   Tx Hash: ${txHash}`);
      console.log(`   Pool Index: ${poolAccountIndex}`);
      console.log(`   Shares Minted: ${shareAmount}`);

      console.log('\n💡 Tips:');
      console.log('   - Your USDC will be locked in the pool');
      console.log('   - You earn a percentage of the pool\'s profits');
      console.log('   - You can withdraw by burning shares');
      console.log('   - Check your pool shares under account assets');

    } catch (error) {
      console.error('❌ Failed to deposit to pool:', error);
      process.exit(1);
    }

    await signer.close();
    console.log('\n✅ Pool deposit completed');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
