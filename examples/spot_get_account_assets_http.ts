/**
 * Example: Get Spot Account Assets
 * 
 * This example demonstrates how to query spot account assets,
 * showing both perp and spot asset balances with locked amounts.
 */

import { ApiClient, AccountApi, resolveNetworkFromEnv } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    console.log('📊 Getting Spot Account Assets...\n');

    const baseUrl = resolveNetworkFromEnv().apiUrl;
    const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0');

    const apiClient = new ApiClient({ host: baseUrl });
    const accountApi = new AccountApi(apiClient);

    // Get account details
    console.log(`Fetching account ${accountIndex}...`);
    const account = await accountApi.getAccount({
      by: 'index',
      value: accountIndex.toString(),
    });

    console.log('\n📈 Perpetual Assets:');
    console.log('─'.repeat(50));
    
    if (account.total_asset_value) {
      console.log(`Total Asset Value: ${account.total_asset_value}`);
      console.log(`Available Balance: ${account.available_balance}`);
      console.log(`Cross Initial Margin Requirement: ${account.cross_initial_margin_requirement}`);
    }

    // Display spot assets if available
    if (account.assets && account.assets.length > 0) {
      console.log('\n💰 Spot Assets:');
      console.log('─'.repeat(50));
      
      for (const asset of account.assets) {
        const available = parseFloat(asset.balance) - parseFloat(asset.locked_balance);
        const lockedPercent = parseFloat(asset.locked_balance) > 0 
          ? ((parseFloat(asset.locked_balance) / parseFloat(asset.balance)) * 100).toFixed(2)
          : '0.00';
        
        console.log(`\n${asset.symbol}:`);
        console.log(`  Total:    ${asset.balance}`);
        console.log(`  Locked:   ${asset.locked_balance} (${lockedPercent}%)`);
        console.log(`  Available: ${available}`);
      }
    } else {
      console.log('\n💰 Spot Assets: None available');
    }

    // Display open positions if available
    if (account.positions && account.positions.length > 0) {
      console.log('\n📍 Open Positions:');
      console.log('─'.repeat(50));
      
      for (const position of account.positions) {
        const pnlColor = parseFloat(position.unrealized_pnl) >= 0 ? '✅' : '❌';
        // `sign` carries the direction (1 long / -1 short) and `position` the
        // size; the API model has no `side`/`size`/`mark_price` field.
        const side = position.sign > 0 ? 'LONG' : position.sign < 0 ? 'SHORT' : 'FLAT';
        const size = Math.abs(parseFloat(position.position) || 0);
        const value = Math.abs(parseFloat(position.position_value) || 0);
        const mark = size > 0 && value > 0 ? `~${(value / size).toFixed(4)} (derived)` : 'n/a';
        console.log(`\nMarket ${position.market_id} ${position.symbol} (${side}):`);
        console.log(`  Size: ${position.position}`);
        console.log(`  Entry Price: ${position.avg_entry_price}`);
        console.log(`  Position Value: ${position.position_value}`);
        console.log(`  Mark Price: ${mark}`);
        console.log(`  Unrealized PnL: ${pnlColor} ${position.unrealized_pnl}`);
        console.log(`  Realized PnL: ${position.realized_pnl}`);
      }
    } else {
      console.log('\n📍 Open Positions: None');
    }

    console.log('\n✅ Asset query completed successfully');
    await apiClient.close?.();

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
