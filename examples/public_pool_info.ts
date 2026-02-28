/**
 * Example: Query Public Pool Information
 * 
 * This example demonstrates how to get information about public pools,
 * including share price, total value locked, and user share details.
 */

import { ApiClient, AccountApi } from '../dist/esm/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    console.log('🏦 Querying Public Pool Information...\n');

    const baseUrl = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
    const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0');

    const apiClient = new ApiClient({ host: baseUrl });
    const accountApi = new AccountApi(apiClient);

    // Get user account
    console.log(`Fetching account ${accountIndex}...`);
    const account = await accountApi.getAccount({
      by: 'index',
      value: accountIndex.toString(),
    });

    // Get public pools information
    console.log('\nFetching public pools...');
    const pools = await accountApi.getPublicPools('all', 100, 0);

    console.log(`\n📊 Public Pools (found ${pools.length}):`);
    console.log('─'.repeat(80));

    if (pools.length === 0) {
      console.log('No public pools available');
    } else {
      for (const pool of pools.slice(0, 10)) {
        // Display pool info
        console.log(`\nPool ID: ${pool.id}`);
        console.log(`  Name: ${pool.name}`);
        console.log(`  Description: ${pool.description}`);
        console.log(`  TVL: ${pool.total_value_locked}`);
        console.log(`  APY: ${pool.apy}`);

        // Display pool shares
        if (pool.shares && pool.shares.length > 0) {
          console.log(`  Shares: ${pool.shares.length} types`);
          for (const share of pool.shares) {
            console.log(`    - ${share.token}: ${share.amount} (value: ${share.value})`);
          }
        }
      }
    }

    // If user has shares in pools, show them
    if (account.assets && account.assets.length > 0) {
      console.log('\n\n👤 Your Pool Shares:');
      console.log('─'.repeat(80));

      for (const asset of account.assets) {
        if (asset.symbol && asset.symbol.includes('POOL')) {
          console.log(`\nAsset: ${asset.symbol}`);
          console.log(`  Balance: ${asset.balance}`);
          console.log(`  Locked: ${asset.locked_balance}`);
          const available = parseFloat(asset.balance) - parseFloat(asset.locked_balance);
          console.log(`  Available: ${available}`);
        }
      }
    }

    console.log('\n✅ Pool query completed successfully');
    await apiClient.close?.();

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
