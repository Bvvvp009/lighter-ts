/**
 * Example: Transfer between Spot and Perp Accounts
 * Demonstrates transferring USDC between spot and perp accounts on the same account index
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
  const TRANSFER_AMOUNT = parseFloat(process.env['TRANSFER_AMOUNT'] || '1.234567');

  // Route constants
  const ROUTE_SPOT = 1; // Spot account
  const ROUTE_PERP = 0; // Perp account

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
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

    console.log('💸 Executing transfer from Perp to Spot...');
    console.log('   Using WASM signer directly for cross-route transfer\n');
    
    // Get next nonce
    const nextNonce = await (signerClient as any).transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
    const scaledAmount = Math.floor(TRANSFER_AMOUNT * 1_000_000); // Scale USDC amount
    
    // Use WASM module directly for cross-route transfer
    // Perp (route 0) -> Spot (route 1)
    const wasmSigner = (signerClient as any).wallet;
    const wasmModule = (wasmSigner as any).wasmModule;
    
    // Call WASM signTransfer directly with separate route types
    // Signature: toAccountIndex, assetIndex, fromRouteType, toRouteType, amount, usdcFee, memo, nonce, apiKeyIndex, accountIndex
    const result = wasmModule.signTransfer(
      ACCOUNT_INDEX, // toAccountIndex
      3, // assetIndex (USDC)
      ROUTE_PERP, // fromRouteType (0 = Perp)
      ROUTE_SPOT, // toRouteType (1 = Spot)
      scaledAmount, // amount
      0, // usdcFee
      memo, // memo
      nextNonce.nonce, // nonce
      API_KEY_INDEX, // apiKeyIndex
      ACCOUNT_INDEX // accountIndex
    );

    if (result.error) {
      throw new Error(`Transfer failed: ${result.error}`);
    }

    // Handle L1 signature if needed
    let txInfo = result.txInfo;
    
    // Send transaction using TransactionApi
    const transactionApi = (signerClient as any).transactionApi;
    const txHashResponse = await transactionApi.sendTxWithIndices(
      12, // TRANSFER transaction type
      txInfo,
      ACCOUNT_INDEX,
      API_KEY_INDEX
    );

    if (txHashResponse.code && txHashResponse.code !== 200) {
      throw new Error(`Transfer failed: ${txHashResponse.message || 'Transaction failed'}`);
    }

    const txHash = txHashResponse.tx_hash || txHashResponse.hash || result.txHash || '';
    const transferInfo = JSON.parse(txInfo);
    const error = null;

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

    // Optional: Update leverage after transfer
    console.log('📊 Optional: Updating leverage (example)...');
    const [levInfo, levTxHash, levError] = await signerClient.updateLeverage(
      3, // Market index 3
      SignerClient.CROSS_MARGIN_MODE, // Margin mode
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
// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('transfer_spot_perp');
if (isMain) {
  transferSpotPerp().catch(console.error);
}

export { transferSpotPerp };

