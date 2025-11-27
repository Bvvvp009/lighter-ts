/**
 * Example: Withdraw to L1
 * Demonstrates withdrawing funds from L2 to L1 (Ethereum mainnet)
 */

import { SignerClient, WithdrawParams } from '../src';
import * as dotenv from 'dotenv';
dotenv.config();

async function withdrawToL1() {
  console.log('🚀 Withdrawing to L1...\n');

  // Initialize clients explicitly
  const signerClient = new SignerClient({
    url: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai',
    privateKey: process.env['API_PRIVATE_KEY'] || '',
    accountIndex: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
    apiKeyIndex: parseInt(process.env['API_KEY_INDEX'] || '0')
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  // Withdraw parameters
  const withdrawParams: WithdrawParams = {
    usdcAmount: parseFloat(process.env['WITHDRAW_AMOUNT'] || '20'), // USDC amount
    nonce: -1 // Auto-fetch nonce
  };

  try {
    console.log('📋 Withdraw Parameters:');
    console.log(`   Amount: ${withdrawParams.usdcAmount} USDC`);
    console.log(`   L1 Address: ${process.env['L1_ADDRESS']}\n`);

    // Create withdraw transaction
    const [tx, txHash, error] = await signerClient.withdraw(withdrawParams);

    if (error) {
      console.error('❌ Failed to withdraw to L1:', error);
      return;
    }

    console.log('✅ Withdraw Request Submitted!');
    console.log(`   Transaction Hash: ${txHash}`);
    
    // Wait for transaction confirmation
    console.log('\n⏳ Waiting for withdraw confirmation...');
    try {
      await signerClient.waitForTransaction(txHash, 120000, 5000);
      console.log('✅ Withdrawal to L1 successful!');
    } catch (error) {
      console.error('❌ Withdrawal failed:', error instanceof Error ? error.message : String(error));
    }

    console.log('\n🎉 Withdraw to L1 successful!');
    console.log('⚠️  Note: L1 withdrawal may take additional time to process on Ethereum mainnet');

  } catch (error) {
    console.error('❌ Error withdrawing to L1:', error);
  }
}

// Run the example
if (require.main === module) {
  withdrawToL1().catch(console.error);
}

export { withdrawToL1 };
