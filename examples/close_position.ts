/**
 * Example: Close Position
 * Demonstrates closing a specific position by market index
 */

import { OrderType, SignerClient } from '../src';
import dotenv from 'dotenv';
dotenv.config();

async function closePosition() {
  console.log('🚀 Closing Position...\n');

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

  // Close position parameters
  const closePositionParams = {
    marketIndex: 0, // ETH/USD market
    reduceOnly: true // Ensure this is a position-closing order
  };

  try {
    console.log('📋 Close Position Parameters:');
    console.log(`   Market: ETH/USD (${closePositionParams.marketIndex})`);
    console.log(`   Reduce Only: ${closePositionParams.reduceOnly}\n`);

    // Create a market order to close the position
    // NOTE: Using createMarketOrder directly (not unified) for position closing
    const [tx, txHash, error] = await signerClient.createMarketOrder({
      marketIndex: closePositionParams.marketIndex,
      clientOrderIndex: Date.now(),
      baseAmount: 1000, // Adjust based on your position size
      avgExecutionPrice: 450000, // $4500 in price units (scaled by 100)
      isAsk: false, // Adjust based on your position side (opposite of position)
      reduceOnly: closePositionParams.reduceOnly
    });

    if (error) {
      console.error('❌ Failed to close position:', error);
      return;
    } 

    if (!txHash || txHash === '') {
      console.error('❌ No transaction hash returned');
      return;
    }

    console.log('✅ Position Close Request Submitted!');
    console.log(`   Transaction Hash: ${txHash}`);
    
    // Wait for transaction confirmation
    console.log('\n⏳ Waiting for position closure confirmation...');
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log('✅ Position closed successfully!');
    } catch (waitError) {
      console.error('❌ Position close failed:', waitError instanceof Error ? waitError.message : String(waitError));
    }

    console.log('\n🎉 Position closed successfully!');

  } catch (error) {
    console.error('❌ Error closing position:', error instanceof Error ? error.message : String(error));
  }
}

// Run the example
if (require.main === module) {
  closePosition().catch(console.error);
}

export { closePosition };
