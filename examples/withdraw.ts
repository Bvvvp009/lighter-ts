// Secure Withdraw - withdraw from Lighter L2 to Ethereum L1 (takes ~2 hours)
// This example shows how to withdraw USDC from Lighter L2 to Ethereum L1

import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

// Amount to withdraw (in USDC)
const AMOUNT_USDC = 5.0; // Change this to the amount you want to withdraw

async function main(): Promise<void> {
  console.log('🏦 Lighter L2 → Ethereum L1 Withdrawal');
  console.log('='.repeat(60));

  // Validate required environment variables
  if (!API_KEY_PRIVATE_KEY) {
    console.error('❌ API_PRIVATE_KEY not found in .env file');
    return;
  }
  if (ACCOUNT_INDEX === 0) {
    console.error('❌ ACCOUNT_INDEX not found in .env file');
    return;
  }
  if (API_KEY_INDEX === 0) {
    console.error('❌ API_KEY_INDEX not found in .env file');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const err = client.checkClient();
  if (err) {
    console.error(`❌ CheckClient error: ${err}`);
    return;
  }

  try {
    console.log(`💰 Withdrawal Amount: ${AMOUNT_USDC} USDC`);
    console.log(`📤 From Account Index: ${ACCOUNT_INDEX}`);
    console.log(`⏰ Estimated Time: ~2 hours to Ethereum L1`);
    console.log();
    console.log('🚀 Attempting withdrawal transaction...');
    console.log();

    const [withdrawInfo, txHash, withdrawErr] = await client.withdraw(AMOUNT_USDC);

    if (withdrawErr) {
      console.error(`❌ Withdrawal failed: ${withdrawErr}`);
      return;
    }

    console.log();
    console.log('📋 Response:');
    console.log(`  - TX Hash: ${txHash || 'N/A'}`);
    console.log(`  - Status: ${txHash ? 'Success' : 'Unknown'}`);

    if (withdrawInfo) {
      console.log();
      console.log('✅ Secure withdraw submitted successfully!');
      console.log(`   💵 Amount: ${AMOUNT_USDC} USDC`);
      console.log(`   🔗 Transaction: ${txHash || 'N/A'}`);
      console.log(`   📝 Nonce: ${withdrawInfo.Nonce}`);
      console.log();
      console.log('⏰ Timeline:');
      console.log('   1. Transaction confirmed on L2 (immediate)');
      console.log('   2. ZK proof generated and submitted to L1');
      console.log('   3. Funds available on Ethereum L1 (~2 hours)');
      console.log();
      console.log('📌 Next Steps:');
      console.log('   - Monitor transaction on Ethereum L1');
      console.log('   - Check your Ethereum wallet after ~2 hours');
      console.log('   - Funds will appear in your L1 address');

      // Wait for transaction confirmation if hash is available
      if (txHash) {
        console.log();
        console.log('⏳ Waiting for L2 transaction confirmation...');
        try {
          const confirmedTx = await client.waitForTransaction(txHash, 30000, 1000);
          console.log('✅ L2 transaction confirmed!');
          console.log(`   Hash: ${confirmedTx.hash}`);
          console.log(`   Status: ${confirmedTx.status}`);
          console.log(`   Block Height: ${confirmedTx.block_height}`);
        } catch (waitError) {
          console.log('⚠️ L2 transaction confirmation timeout:', waitError instanceof Error ? waitError.message : 'Unknown error');
        }
      }
    }
  } catch (error) {
    console.error('❌ Exception occurred:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

