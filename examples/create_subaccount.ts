/**
 * Example: Create a sub account
 * 
 * This example demonstrates how to create a sub account from a master account.
 * Sub accounts allow you to separate trading activities and manage risk.
 */

import { SignerClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function createSubAccountExample() {
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

    console.log('📝 Creating sub account...');
    
    // Create a sub account
    // The nonce will be automatically fetched if not provided
    const [subAccountInfo, txHash, error] = await client.createSubAccount();

    if (error) {
      console.error('❌ Failed to create sub account:', error);
      return;
    }

    console.log('✅ Sub account created successfully!');
    console.log('🔗 Transaction Hash:', txHash);

    // Wait for transaction confirmation
    if (txHash) {
      console.log('⏳ Waiting for transaction confirmation...');
      try {
        await client.waitForTransaction(txHash, 60000, 2000);
        console.log('✅ Transaction confirmed!');
        
        // Get updated account info to see the new sub account
        const accountApi = client['accountApi'];
        const accountData = await accountApi.getAccount({
          by: 'index',
          value: ACCOUNT_INDEX.toString()
        });
      } catch (waitError) {
        console.error('❌ Transaction confirmation failed:', waitError);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  createSubAccountExample().catch(console.error);
}

export { createSubAccountExample };


