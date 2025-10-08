// Close a Specific Position in a Market
// This example shows how to close a specific position or the top position in a market

import { SignerClient } from '../src/signer/wasm-signer-client';
import { AccountApi } from '../src/api/account-api';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

// Configuration - Set these values or pass as environment variables
const MARKET_INDEX = parseInt(process.env['MARKET_INDEX'] || '0', 10); // Market to close position in (0 = ETH/USDC)
const POSITION_INDEX = parseInt(process.env['POSITION_INDEX'] || '-1', 10); // -1 = close top position

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_PRIVATE_KEY environment variable is required');
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
    console.error('CheckClient error:', err);
    return;
  }

  console.log('🎯 Close Specific Position Example\n');
  console.log(`📊 Market Index: ${MARKET_INDEX}`);
  console.log(`📍 Position Index: ${POSITION_INDEX === -1 ? 'Auto (top position)' : POSITION_INDEX}\n`);

  try {
    // Get account data to retrieve positions
    const accountApi = new AccountApi(client['apiClient']);
    const accountData = await accountApi.getAccount({
      by: 'index',
      value: ACCOUNT_INDEX.toString()
    }) as any;

    // Extract account from response
    const account = accountData.accounts?.[0] || accountData;

    if (!account.positions || !Array.isArray(account.positions)) {
      console.log('ℹ️  No positions data available');
      await client.close();
      return;
    }

    // Filter positions for the specified market (position !== 0 means open position)
    const marketPositions = account.positions.filter(
      (pos: any) => pos.market_id === MARKET_INDEX && parseFloat(pos.position) !== 0
    );

    if (marketPositions.length === 0) {
      console.log(`ℹ️  No open positions found in market ${MARKET_INDEX}`);
      await client.close();
      return;
    }

    console.log(`📋 Found ${marketPositions.length} open position(s) in market ${MARKET_INDEX}:\n`);
    marketPositions.forEach((pos: any, idx: number) => {
      const side = pos.sign === 1 ? 'LONG' : 'SHORT';
      console.log(`   ${idx + 1}. ${side}: ${pos.position} units @ $${parseFloat(pos.avg_entry_price)}`);
      console.log(`      Position Value: $${pos.position_value}`);
      console.log(`      PnL: ${pos.unrealized_pnl} USDC\n`);
    });

    // Select position to close
    let positionToClose;
    if (POSITION_INDEX === -1) {
      // Close the first (top) position
      positionToClose = marketPositions[0];
      console.log(`🎯 Closing top position (auto-selected)...`);
    } else if (POSITION_INDEX < marketPositions.length) {
      positionToClose = marketPositions[POSITION_INDEX];
      console.log(`🎯 Closing position #${POSITION_INDEX + 1}...`);
    } else {
      console.error(`❌ Position index ${POSITION_INDEX} out of range (0-${marketPositions.length - 1})`);
      await client.close();
      return;
    }

    if (!positionToClose) {
      console.error('❌ No position selected');
      await client.close();
      return;
    }

    const isLong = positionToClose.sign === 1;
    const positionSize = Math.abs(parseFloat(positionToClose.position));
    const avgPrice = Math.abs(parseFloat(positionToClose.avg_entry_price));

    // Convert to base units (multiply by 1000000 for proper scaling)
    const baseAmount = Math.floor(positionSize * 1000000);
    const priceInUnits = Math.floor(avgPrice * 100000);

    console.log(`\n📝 Closing ${isLong ? 'LONG' : 'SHORT'} position: ${positionToClose.position} units`);
    console.log(`   Average Entry Price: $${avgPrice}`);
    console.log(`   Base Amount (scaled): ${baseAmount}`);

    // Create market order in opposite direction to close position
    const [tx, txHash, closeErr] = await client.createMarketOrder({
      marketIndex: MARKET_INDEX,
      clientOrderIndex: Date.now(),
      baseAmount: baseAmount,
      avgExecutionPrice: priceInUnits * 2, // Give enough room for execution
      isAsk: isLong, // If long (sign=1), sell to close; if short (sign=-1), buy to close
      reduceOnly: true // Important: This ensures we only close, not open new position
    });

    if (closeErr) {
      console.error(`❌ Failed to close position: ${closeErr}`);
      await client.close();
      return;
    }

    console.log('\n✅ Position close order submitted successfully!');
    console.log('📋 Order Details:');
    console.log(`   Market Index: ${tx.MarketIndex}`);
    console.log(`   Client Order Index: ${tx.ClientOrderIndex}`);
    console.log(`   Base Amount: ${tx.BaseAmount} units`);
    console.log(`   Is Ask: ${tx.IsAsk ? 'Yes (Sell to close LONG)' : 'No (Buy to close SHORT)'}`);
    console.log(`   Reduce Only: Yes`);
    console.log(`   Nonce: ${tx.Nonce}`);
    console.log(`   TX Hash: ${txHash}`);

    // Wait for transaction confirmation
    if (txHash) {
      console.log('\n⏳ Waiting for transaction confirmation...');
      try {
        const confirmedTx = await client.waitForTransaction(txHash, 60000, 2000);
        console.log('✅ Position close transaction confirmed!');
        console.log(`   Status: ${confirmedTx.status}`);
        console.log(`   Block Height: ${confirmedTx.block_height}`);
      } catch (waitError) {
        console.log('⚠️ Transaction confirmation timeout:', waitError instanceof Error ? waitError.message : 'Unknown error');
        console.log('   The position may still be closing - check your account positions');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

