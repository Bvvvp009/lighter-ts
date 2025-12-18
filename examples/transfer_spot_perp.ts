/**
 * Example: Transfer between Spot and Perp Accounts
 * Demonstrates transferring USDC between spot and perp accounts on the same account index
 * Based on: https://github.com/elliottech/lighter-python/blob/aecdec059f92a25510cad341a257b992d95ba7c2/examples/spot_self_transfer_spot_perp.py
 */

import { SignerClient, ApiClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function transferSpotPerp() {
  console.log('🚀 Spot <-> Perp Transfer Example\n');

  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0');
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0');
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const ETH_PRIVATE_KEY = process.env['ETH_PRIVATE_KEY'] || process.env['ACCOUNT_PRIVATE_KEY'] || API_PRIVATE_KEY;
  const TRANSFER_AMOUNT = parseFloat(process.env['TRANSFER_AMOUNT'] || '1.234567');

  // Route constants
  const ROUTE_SPOT = 1; // Spot account
  const ROUTE_PERP = 0; // Perp account
  const ASSET_ID_USDC = 0; // USDC asset ID

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  if (!ETH_PRIVATE_KEY) {
    throw new Error('ETH_PRIVATE_KEY or ACCOUNT_PRIVATE_KEY environment variable is required');
  }

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({
    host: BASE_URL
  });

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    console.log('✅ Clients initialized\n');

    // Check client is ready
    const checkError = await (signerClient as any).checkClient();
    if (checkError) {
      throw new Error(`CheckClient error: ${checkError}`);
    }
    console.log('✅ Client check passed\n');

    // Example: Transfer from Spot to Perp (self-transfer to same account index)
    console.log('📋 Transfer Parameters:');
    console.log(`   From: Spot Account (Route ${ROUTE_SPOT})`);
    console.log(`   To: Perp Account (Route ${ROUTE_PERP})`);
    console.log(`   Amount: ${TRANSFER_AMOUNT} USDC`);
    console.log(`   To Account Index: ${ACCOUNT_INDEX} (same account)\n`);

    // Build memo (32-byte zero memo for internal transfers)
    const memo = '0x' + '00'.repeat(32);

    console.log('💸 Executing transfer from Spot to Perp...');
    console.log('   Note: Current SDK transfer() uses is_spot_account for route type');
    console.log('   For true cross-route transfers (spot->perp), SDK enhancements may be needed\n');
    
    // Use the SDK's transfer method
    // Note: The current SDK implementation uses is_spot_account to set both fromRouteType and toRouteType
    // For actual spot->perp transfers, you may need to use the WASM signer directly or wait for SDK enhancements
    // This example demonstrates the transfer pattern from the Python SDK
    const [transferInfo, txHash, error] = await signerClient.transfer({
      toAccountIndex: ACCOUNT_INDEX, // Self-transfer to same account index
      usdcAmount: TRANSFER_AMOUNT, // SDK handles scaling (multiplies by 1e6 for USDC)
      asset_id: ASSET_ID_USDC,
      is_spot_account: true, // From spot account route (currently sets both from and to route to spot)
      fee: 0, // No fee for self-transfers
      memo: memo,
      ethPrivateKey: ETH_PRIVATE_KEY,
      nonce: -1 // Auto-fetch nonce
    });

    if (error) {
      throw new Error(`Transfer failed: ${error}`);
    }

    if (!txHash) {
      throw new Error('No transaction hash returned');
    }

    console.log('✅✅✅ Transfer successful! ✅✅✅\n');
    console.log(`Transaction Hash: ${txHash}`);
    console.log(`Transfer Info:`, JSON.stringify(transferInfo, null, 2));

    // Wait for transaction confirmation
    console.log('\n⏳ Waiting for transaction confirmation...');
    try {
      await signerClient.waitForTransaction(txHash, 60000, 3000);
      console.log('✅ Transaction confirmed!\n');
    } catch (waitError) {
      console.warn('⚠️  Transaction submitted but confirmation pending:', waitError instanceof Error ? waitError.message : waitError);
    }

    // Optional: Update leverage after transfer (example from Python code)
    console.log('📊 Optional: Updating leverage (example)...');
    const [levInfo, levTxHash, levError] = await signerClient.updateLeverage(
      3, // Market index 3
      signerClient.CROSS_MARGIN_MODE, // Margin mode
      4 // Leverage 4x
    );

    if (levError) {
      console.warn(`⚠️  Leverage update failed: ${levError}`);
    } else {
      console.log(`✅ Leverage update submitted: ${levTxHash}`);
    }

    console.log('\n🎉 Transfer example completed!');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run the example
if (require.main === module) {
  transferSpotPerp().catch(console.error);
}

export { transferSpotPerp };

