/**
 * Example: List Existing Subaccounts and Deposit to Them
 * 
 * This example demonstrates how to:
 * 1. Query existing subaccounts under your master account
 * 2. Transfer/deposit USDC to those subaccounts
 * 
 * No need to create subaccounts if they already exist!
 */

import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

  // Initialize signer (standalone WASM) to create an auth token
  const signer = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY!,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signer.initialize();
  await (signer as any).ensureWasmClient();
  try {
    // Check account type first
    const accountType = signer.checkAccountType();
    console.log('\n🔍 Account Type Check:');
    console.log('   Account Index:', ACCOUNT_INDEX);
    console.log('   Is Master Account:', accountType.isMaster);
    if (!accountType.isMaster) {
      console.log('   ⚠️  This appears to be a SUBACCOUNT, not a master account!');
      console.log('   Estimated Master Index:', accountType.estimatedMasterIndex);
      console.log('   💡 Subaccounts cannot have their own subaccounts.');
      console.log('   💡 Try using the master account index instead.');
      return;
    }
    
    // Step 1: Get all existing subaccounts
    console.log('\n📋 Fetching existing subaccounts...');
    const subAccounts = await signer.getSubAccounts();
    
    if (subAccounts.length === 0) {
      console.log('❌ No subaccounts found for account index:', ACCOUNT_INDEX);
      console.log('💡 Possible reasons:');
      console.log('   1. You haven\'t created any subaccounts yet');
      console.log('   2. The API doesn\'t return subaccounts in this response');
      console.log('   3. Subaccounts might need to be queried differently');
      return;
    }

    console.log(`✅ Found ${subAccounts.length} subaccount(s):`);
    subAccounts.forEach((subIndex, i) => {
      console.log(`   ${i + 1}. Subaccount Index: ${subIndex}`);
    });

    // Step 2: Deposit to first subaccount
    const targetSubAccount = subAccounts[0];
    if (!targetSubAccount) {
      console.log('❌ No valid subaccount found');
      return;
    }
    const depositAmount = 10; // 10 USDC
    
    console.log(`\n💸 Depositing ${depositAmount} USDC to subaccount ${targetSubAccount}...`);
    console.log('   Using only API private key (L2 signature) - no L1 signature required\n');
    
    const [transferInfo, txHash, error] = await signer.transfer({
      toAccountIndex: targetSubAccount,  // Destination subaccount
      usdcAmount: depositAmount,         // Amount in USDC
      fee: 0,                            // Fee
      memo: '0x' + '00'.repeat(32),      // 32-byte memo (64 hex chars with 0x prefix)
      // ethPrivateKey is not provided - using only L2 signature from API key
      nonce: -1                          // Auto-fetch nonce
    });

    if (error) {
      console.error('❌ Transfer failed:', error);
      return;
    }

    console.log('✅ Transfer successful!');
    console.log('   Transaction Hash:', txHash);
    console.log('   From Account:', transferInfo.FromAccountIndex);
    console.log('   To Account:', transferInfo.ToAccountIndex);
    console.log('   Amount:', transferInfo.USDCAmount / 1e6, 'USDC');

    // Step 3: Wait for transaction confirmation with proper error handling
    console.log('');
    const apiClient = new ApiClient({ host: BASE_URL });
    const result = await (apiClient as any).transactionApi.waitAndCheckTransaction(txHash);
    
    await apiClient.close();
    
    if (result.success) {
      console.log('\n🎉 Funds successfully deposited to subaccount!');
    } else if (result.error) {
      console.log(`\n❌ Deposit failed: ${result.error}`);
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  } finally {
    await signer.close();
  }
}

// Example: Check if a specific account is a subaccount
export async function checkIfSubAccount() {
  const config = {
    url: process.env['API_URL'] || 'https://testnet.zklighter.elliot.ai',
    privateKey: process.env['PRIVATE_KEY'] || '',
    accountIndex: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
    apiKeyIndex: parseInt(process.env['API_KEY_INDEX'] || '0')
  };

  const signer = new SignerClient(config);
  await signer.initialize();
  await signer.ensureWasmClient();

  const accountToCheck = 12345; // Replace with account index to check
  const isSubAccount = await signer.isSubAccount(accountToCheck);
  
  if (isSubAccount) {
    console.log(`✅ Account ${accountToCheck} is a subaccount of ${config.accountIndex}`);
  } else {
    console.log(`❌ Account ${accountToCheck} is NOT a subaccount of ${config.accountIndex}`);
  }

  await signer.close();
}

// Run the main example
main().catch(console.error);