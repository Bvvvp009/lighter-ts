/**
 * Example: Update Margin
 * 
 * This example demonstrates how to add or remove margin from a position.
 * Margin updates allow you to adjust your position's collateral.
 * 
 * Direction values:
 * - 0 (ISOLATED_MARGIN_REMOVE_COLLATERAL): Remove margin from position
 * - 1 (ISOLATED_MARGIN_ADD_COLLATERAL): Add margin to position
 */

import { SignerClient } from '../src';
import * as dotenv from 'dotenv';
import { getAccountIndex } from './utils/account-helper';

dotenv.config();

async function updateMarginExample() {
  const BASE_URL = process.env['BASE_URL'] ?? 'https://mainnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '5', 10);
  const CHAIN_ID = process.env['CHAIN_ID'] ? Number.parseInt(process.env['CHAIN_ID'], 10) : undefined;

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  // Fetch account index dynamically
  const ACCOUNT_INDEX = await getAccountIndex(BASE_URL);
  if (!ACCOUNT_INDEX) {
    throw new Error('Account not found. Please ensure ETH_PRIVATE_KEY is set in .env or ACCOUNT_INDEX is provided.');
  }

  console.log(`📋 Using account index: ${ACCOUNT_INDEX}`);

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
    ...(CHAIN_ID !== undefined ? { chainId: CHAIN_ID } : {}),
  });

  try {
    await client.initialize();
    await client.ensureWasmClient();

    // Check for open positions and orders first
    const { AccountApi } = await import('../src');
    const apiClient = new (await import('../src')).ApiClient({ host: BASE_URL });
    const accountApi = new AccountApi(apiClient);
    
    try {
      const account = await accountApi.getAccount({ by: 'index', value: ACCOUNT_INDEX.toString() });
      const hasPositions = account.positions && account.positions.length > 0;
      const hasOrders = account.orders && account.orders.length > 0;
      
      if (hasPositions || hasOrders) {
        console.log('⚠️ Account has open positions or orders.');
        console.log(`   Positions: ${account.positions?.length || 0}`);
        console.log(`   Orders: ${account.orders?.length || 0}`);
        console.log('   Margin mode changes require no open positions or orders.');
        console.log('   Skipping margin mode change, attempting direct margin update...\n');
      } else {
        // Ensure the account is in isolated margin mode before adjusting collateral
        console.log('🔧 Setting isolated margin mode...');
        const [levInfo, levTxHash, levError] = await client.updateLeverage(
          0, // ETH/USDC market
          SignerClient.ISOLATED_MARGIN_MODE,
          10 // leverage (example: 10x)
        );

        if (levError) {
          console.error('❌ Failed to set isolated margin mode:', levError);
          console.log('   Continuing with margin update anyway...\n');
        } else {
          console.log('✅ Margin mode set to isolated. TxHash:', levTxHash);
          if (levTxHash) {
            console.log('⏳ Waiting for margin mode tx confirmation...');
            try {
              await client.waitForTransaction(levTxHash, 60000, 2000);
              console.log('✅ Margin mode transaction confirmed.\n');
            } catch (waitErr) {
              console.error('⚠️ Margin mode tx confirmation failed; continuing anyway:', waitErr);
            }
          }
        }
      }
    } catch (err) {
      console.log('⚠️ Could not check account state, proceeding anyway...\n');
    } finally {
      await apiClient.close();
    }

    const marketIndex = 0; // ETH/USDC market
    const usdcAmount = 100; // 100 USDC (will be scaled to 100000000 internally)

    // Add margin to a position
    console.log('📝 Adding margin to position...');
    const [addMarginInfo, addTxHash, addError] = await client.updateMargin(
      marketIndex,
      usdcAmount,  // USDC amount (in USDC units, will be scaled internally)
      SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL  // direction: add margin
    );

    if (addError) {
      console.error('❌ Failed to add margin:', addError);
    } else {
      console.log('✅ Margin added successfully!');
      console.log('🔗 Transaction Hash:', addTxHash);
      
      if (addTxHash) {
        console.log('⏳ Waiting for transaction confirmation...');
        try {
          await client.waitForTransaction(addTxHash, 60000, 2000);
          console.log('✅ Transaction confirmed!');
        } catch (waitError) {
          console.error('❌ Transaction confirmation failed:', waitError);
        }
      }
    }

    // Remove margin from a position
    console.log('\n📝 Removing margin from position...');
    const [removeMarginInfo, removeTxHash, removeError] = await client.updateMargin(
      marketIndex,
      50,   // 50 USDC to remove
      SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL  // direction: remove margin
    );

    if (removeError) {
      console.error('❌ Failed to remove margin:', removeError);
    } else {
      console.log('✅ Margin removed successfully!');
      console.log('🔗 Transaction Hash:', removeTxHash);
      
      if (removeTxHash) {
        console.log('⏳ Waiting for transaction confirmation...');
        try {
          await client.waitForTransaction(removeTxHash, 60000, 2000);
          console.log('✅ Transaction confirmed!');
        } catch (waitError) {
          console.error('❌ Transaction confirmation failed:', waitError);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  updateMarginExample().catch(console.error);
}

export { updateMarginExample };


