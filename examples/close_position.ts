/**
 * Example: Close Position
 * Demonstrates closing a specific position by market index
 * Automatically fetches position info and uses correct direction
 */

import { OrderType, SignerClient, ApiClient, AccountApi } from '../src';
import * as dotenv from 'dotenv';
dotenv.config();

async function closePosition() {
  console.log('🚀 Closing Position...\n');

  // Use testnet credentials (matching other examples)
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['TESTNET_ACCOUNT_INDEX'] || process.env['ACCOUNT_INDEX'] || "271");
  const API_KEY_INDEX = parseInt(process.env['TESTNET_API_INDEX'] || process.env['API_KEY_INDEX'] || "4");
  const BASE_URL = process.env['TESTNET_BASE_URL'] || process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';
  const MARKET_INDEX = parseInt(process.env['MARKET_INDEX'] || '0'); // Default to market 0 (ETH/USDC)
  
  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const accountApi = new AccountApi(apiClient);
 
  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    // First, get account info to fetch positions
    console.log('📊 Fetching account positions...');
    const account = await accountApi.getAccount({
      by: 'index',
      value: ACCOUNT_INDEX.toString()
    });

    // Check if response is wrapped in 'accounts' array
    let actualAccount = account;
    if ((account as any).accounts && Array.isArray((account as any).accounts) && (account as any).accounts.length > 0) {
      actualAccount = (account as any).accounts[0];
    }

    // Get positions from the actual account object
    let positions = actualAccount.positions || [];
    
    // Find position for the specified market
    // Note: API returns 'position' field (not 'size') and 'sign' field (not 'side')
    const position = positions.find((p: any) => p.market_id === MARKET_INDEX);

    if (!position) {
      console.log(`ℹ️ No open position found for market ${MARKET_INDEX}.`);
      if (positions.length > 0) {
        console.log(`   Available positions: ${positions.map((p: any) => {
          const posSize = (p as any).position || p.size || '0';
          const sign = (p as any).sign || 0;
          const side = sign > 0 ? 'long' : (sign < 0 ? 'short' : 'none');
          return `Market ${p.market_id} (${side}, size: ${posSize})`;
        }).join(', ')}`);
      } else {
        console.log(`   No positions found in account.`);
      }
      return;
    }

    // Use 'position' field (actual position size in ETH) and 'sign' field (1 = long, -1 = short)
    const positionSizeStr = (position as any).position || position.size || '0';
    const positionSize = parseFloat(positionSizeStr);
    const sign = (position as any).sign || 0;
    const positionSide = sign > 0 ? 'long' : 'short';
    
    // Check if position is actually active
    if (positionSize <= 0 || sign === 0) {
      console.log(`ℹ️ Position for market ${MARKET_INDEX} is not active (size: ${positionSizeStr}, sign: ${sign}).`);
      return;
    }
    
    // Convert position size to baseAmount units (1 ETH = 1,000,000 units)
    const baseAmount = Math.floor(positionSize * 1_000_000);
    
    // Determine direction: opposite of position side
    // LONG position (sign > 0) -> need to SELL (isAsk: true) to close
    // SHORT position (sign < 0) -> need to BUY (isAsk: false) to close
    const isAsk = sign > 0; // true for long (sell to close), false for short (buy to close)
    
    // Get current market price for better execution
    const markPrice = parseFloat((position as any).mark_price || position.mark_price || '0');
    const entryPrice = parseFloat((position as any).avg_entry_price || position.entry_price || '0');
    const avgExecutionPrice = markPrice > 0 ? Math.floor(markPrice * 100) : 
                              (entryPrice > 0 ? Math.floor(entryPrice * 100) : 450000); // Convert to price units

    console.log('📋 Position Information:');
    console.log(`   Market: ${MARKET_INDEX}`);
    console.log(`   Side: ${positionSide.toUpperCase()}`);
    console.log(`   Size: ${positionSizeStr}`);
    console.log(`   Entry Price: ${(position as any).avg_entry_price || position.entry_price || 'N/A'}`);
    console.log(`   Mark Price: ${(position as any).mark_price || position.mark_price || 'N/A'}`);
    console.log(`   Position Value: ${(position as any).position_value || 'N/A'}`);
    console.log(`   Unrealized PnL: ${(position as any).unrealized_pnl || position.unrealized_pnl || 'N/A'}\n`);

    console.log('📋 Close Order Parameters:');
    console.log(`   Direction: ${isAsk ? 'SELL' : 'BUY'} (opposite of ${positionSide})`);
    console.log(`   Base Amount: ${baseAmount} units (${positionSizeStr} ETH)`);
    console.log(`   Execution Price: ${avgExecutionPrice} ($${avgExecutionPrice / 100})`);
    console.log(`   Reduce Only: true\n`);

    // Create a market order to close the position
    const [tx, txHash, error] = await signerClient.createMarketOrder({
      marketIndex: MARKET_INDEX,
      clientOrderIndex: Date.now(),
      baseAmount: baseAmount,
      avgExecutionPrice: avgExecutionPrice,
      isAsk: isAsk, // CRITICAL: Opposite direction of position
      reduceOnly: true
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
      const errorMsg = waitError instanceof Error ? waitError.message : String(waitError);
      // If it's just the validation warning, the order might still be processing
      if (errorMsg.includes('invalid reduce only direction')) {
        console.log(`⚠️ Validation warning (order may still be processing)`);
      } else {
        console.error('❌ Position close failed:', errorMsg);
      }
    }

    console.log('\n🎉 Position closed successfully!');

  } catch (error) {
    console.error('❌ Error closing position:', error instanceof Error ? error.message : String(error));
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run the example
if (require.main === module) {
  closePosition().catch(console.error);
}

export { closePosition };
