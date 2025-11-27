/**
 * Example: Deposit to Subaccount
 * If no subaccount is specified, deposits to the first available subaccount
 */

import { SignerClient, ApiClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function depositToSubaccount() {
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

  const apiClient = new ApiClient({ host: BASE_URL });

  const specifiedSubAccountIndex = parseInt(process.env['SUB_ACCOUNT_INDEX'] || '0');
  const amount = parseFloat(process.env['DEPOSIT_AMOUNT'] || '1'); 

  try {
    console.log('🚀 Depositing to Subaccount...\n');
    
    // Get subaccounts
    console.log(`📋 Fetching subaccounts...`);
    const subAccounts = await signerClient.getSubAccounts();
    
    let targetSubAccountIndex: number;
    
    if (subAccounts.length === 0) {
      console.error('❌ No subaccounts found');
      await apiClient.close();
      return;
    }
    
    // Use specified subaccount index if provided and valid, otherwise use first subaccount
    if (specifiedSubAccountIndex !== 0 && subAccounts.includes(specifiedSubAccountIndex)) {
      targetSubAccountIndex = specifiedSubAccountIndex;
      console.log(`✅ Using specified subaccount: ${targetSubAccountIndex}`);
    } else {
      targetSubAccountIndex = subAccounts[0];
      console.log(`✅ No subaccount specified or invalid, using first subaccount: ${targetSubAccountIndex}`);
    }
    
    console.log(`\n📋 Deposit Parameters:`);
    console.log(`   To Account Index: ${targetSubAccountIndex}`);
    console.log(`   Amount: ${amount} USDC`);
    console.log(`   From Account Index: ${ACCOUNT_INDEX}\n`);
    
    const [transferInfo, txHash, error] = await signerClient.transfer({
      toAccountIndex: targetSubAccountIndex,
      usdcAmount: amount,
      fee: 0,
      memo: 'a'.repeat(32),
      ethPrivateKey: API_PRIVATE_KEY,
      nonce: -1
    });

    if (error) {
      console.error(`❌ Transfer failed: ${error}`);
      await apiClient.close();
      return;
    }

    if (!txHash || txHash === '') {
      console.error('❌ No transaction hash returned');
      await apiClient.close();
      return;
    }

    console.log(`✅ Deposit request submitted: ${txHash.substring(0, 16)}...`);
    
    console.log(`⏳ Waiting for confirmation...`);
    try {
      await signerClient.waitForTransaction(txHash, 60000, 3000);
      console.log('✅ Deposit successful');
    } catch (waitError) {
      console.error(`❌ Deposit confirmation failed:`, waitError);
    }

    console.log('\n🎉 Deposit complete!');
    await apiClient.close();
  } catch (error) {
    console.error(`❌ Error:`, error);
    await apiClient.close();
  }
}

if (require.main === module) {
  depositToSubaccount().catch(console.error);
}

export { depositToSubaccount };
