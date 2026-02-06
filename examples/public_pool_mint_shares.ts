/**
 * Example: Public Pool - Mint Shares (Deposit)
 * 
 * Demonstrates:
 * - Depositing USDC into a public pool
 * - Minting pool shares
 * - Receiving shares proportional to deposit amount
 */

import { SignerClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

// Replace with your actual pool account index
const POOL_ACCOUNT_INDEX = 281474976710651;
const SHARE_AMOUNT = 10000; // 10 USDC worth of shares

async function mintPoolShares() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '237600', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '5', 10);
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    // Check client
    const err = await signerClient.checkClient();
    if (err) {
      console.error(`❌ CheckClient error: ${err}`);
      return;
    }

    console.log('💰 Minting Pool Shares...\n');
    console.log(`Pool Account Index: ${POOL_ACCOUNT_INDEX}`);
    console.log(`Share Amount: ${SHARE_AMOUNT}\n`);

    const [txInfo, txHash, error] = await signerClient.mintShares(
      POOL_ACCOUNT_INDEX,
      SHARE_AMOUNT
    );

    if (error) {
      throw new Error(`Failed to mint shares: ${error}`);
    }

    if (!txHash) {
      throw new Error('No transaction hash returned');
    }

    console.log(`✅ Mint shares transaction sent: ${txHash.substring(0, 16)}...`);
    console.log(`   Pool: ${POOL_ACCOUNT_INDEX}`);
    console.log(`   Shares: ${SHARE_AMOUNT}\n`);

    // Wait for confirmation
    try {
      await signerClient.waitForTransaction(txHash, 60000, 3000);
      console.log('✅ Transaction confirmed!');
      console.log('💡 You now own shares in the public pool');
      console.log('💡 Shares entitle you to a portion of pool profits');
    } catch (waitError) {
      console.warn('⚠️  Transaction submitted but confirmation pending');
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    await signerClient.close();
  }
}

if (require.main === module) {
  mintPoolShares().catch(console.error);
}

export { mintPoolShares };
