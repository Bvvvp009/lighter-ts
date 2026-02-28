/**
 * Example: Public Pool Operations
 * 
 * This example demonstrates how to:
 * 1. Create a public pool
 * 2. Update a public pool
 * 3. Mint shares in a public pool
 * 4. Burn shares in a public pool
 */

import { SignerClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function publicPoolOperationsExample() {
  // Use testnet credentials (matching other examples)
  const BASE_URL = process.env['TESTNET_BASE_URL'] || process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = Number.parseInt(process.env['TESTNET_ACCOUNT_INDEX'] || process.env['ACCOUNT_INDEX'] || '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['TESTNET_API_INDEX'] || process.env['API_KEY_INDEX'] || '4', 10);

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file or provided as default');
  }
  
  console.log(`📝 Public Pool Operations Example`);
  console.log(`   Account: ${ACCOUNT_INDEX}, API Key: ${API_KEY_INDEX}`);
  console.log(`   Base URL: ${BASE_URL}\n`);

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  try {
    await client.initialize();
    await client.ensureWasmClient();

    // 1. Create a public pool
    // Note: Creating a public pool requires sufficient USDC collateral
    // Minimum initialTotalShares is typically 1,000 USDC worth of shares
    // Each share is worth 0.001 USDC, so minimum is 1,000,000 shares = 1,000 USDC
    console.log('📝 Creating public pool...');
    console.log('   Note: This requires sufficient USDC balance in your account');
    console.log('   Minimum: ~1,000 USDC worth of shares (1,000,000 shares)\n');
    
    const [poolInfo, createTxHash, createError] = await client.createPublicPool(
      100,        // operatorFee: 1% (in basis points, 100 = 1%)
      1000000,    // initialTotalShares: 1,000,000 shares (minimum = 1,000 USDC)
      5000        // minOperatorShareRate: 50% (in basis points, 5000 = 50%)
    );

    if (createError) {
      console.error('❌ Failed to create public pool:', createError);
      if (createError.includes('not enough collateral') || createError.includes('collateral')) {
        console.error('\n💡 Tip: You need at least 1,000 USDC in your account to create a public pool.');
        console.error('   Each share is worth 0.001 USDC, so 1,000,000 shares = 1,000 USDC minimum.');
        console.error('   Make sure you have deposited sufficient USDC to your account first.\n');
      }
      return;
    }

    console.log('✅ Public pool created!');
    console.log('🔗 Transaction Hash:', createTxHash);

    // Wait for creation confirmation
    if (createTxHash) {
      await client.waitForTransaction(createTxHash, 60000, 2000);
    }

    // Extract public pool index from pool info
    const publicPoolIndex = (poolInfo as any)?.publicPoolIndex || (poolInfo as any)?.PublicPoolIndex || 0;
    
    if (!publicPoolIndex) {
      console.error('❌ Could not extract public pool index from response');
      return;
    }

    console.log(`\n📊 Public Pool Index: ${publicPoolIndex}\n`);

    // 2. Update the public pool
    console.log('📝 Updating public pool...');
    const [updateInfo, updateTxHash, updateError] = await client.updatePublicPool(
      publicPoolIndex,  // publicPoolIndex
      1,                // status: 1 = active
      150,              // operatorFee: 1.5% (updated)
      6000              // minOperatorShareRate: 60% (updated)
    );

    if (updateError) {
      console.error('❌ Failed to update public pool:', updateError);
    } else {
      console.log('✅ Public pool updated!');
      console.log('🔗 Transaction Hash:', updateTxHash);
      if (updateTxHash) {
        await client.waitForTransaction(updateTxHash, 60000, 2000);
      }
    }

    // 3. Mint shares in the public pool
    console.log('\n📝 Minting shares in public pool...');
    const [mintInfo, mintTxHash, mintError] = await client.mintShares(
      publicPoolIndex,  // publicPoolIndex
      10000             // shareAmount: 10,000 shares
    );

    if (mintError) {
      console.error('❌ Failed to mint shares:', mintError);
    } else {
      console.log('✅ Shares minted!');
      console.log('🔗 Transaction Hash:', mintTxHash);
      if (mintTxHash) {
        await client.waitForTransaction(mintTxHash, 60000, 2000);
      }
    }

    // 4. Burn shares in the public pool
    console.log('\n📝 Burning shares in public pool...');
    const [burnInfo, burnTxHash, burnError] = await client.burnShares(
      publicPoolIndex,  // publicPoolIndex
      5000              // shareAmount: 5,000 shares
    );

    if (burnError) {
      console.error('❌ Failed to burn shares:', burnError);
    } else {
      console.log('✅ Shares burned!');
      console.log('🔗 Transaction Hash:', burnTxHash);
      if (burnTxHash) {
        await client.waitForTransaction(burnTxHash, 60000, 2000);
      }
    }

    console.log('\n🎉 All public pool operations completed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('public_pool_operations');
if (isMain) {
  publicPoolOperationsExample().catch(console.error);
}

export { publicPoolOperationsExample };

