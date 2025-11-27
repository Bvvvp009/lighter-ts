/**
 * Example: Close All Positions
 * Fetches positions and closes them with the correct direction
 */

import { SignerClient, ApiClient, AccountApi, TransactionApi } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Wait for pending transactions to clear
 * Uses account transactions and filters by status, or skips if endpoint unavailable
 */
async function waitForPendingTransactions(
  transactionApi: TransactionApi,
  accountIndex: number,
  maxWaitTime: number = 60000,
  pollInterval: number = 3000
): Promise<void> {
  const startTime = Date.now();
  
  // Try to get pending transactions - use account transactions as fallback
  let useAccountTxs = false;
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      let pendingTxs: any[] = [];
      
      // First try the dedicated pending transactions endpoint
      if (!useAccountTxs) {
        try {
          pendingTxs = await transactionApi.getAccountPendingTransactions(accountIndex, { limit: 100 });
        } catch (error) {
          // If endpoint doesn't exist (404), fall back to account transactions
          const errorMsg = error instanceof Error ? error.message : String(error);
          const is404 = errorMsg.includes('404') || 
                       errorMsg.includes('not found') ||
                       errorMsg.includes('NotFoundException') ||
                       (error as any)?.status === 404 ||
                       (error as any)?.constructor?.name === 'NotFoundException';
          
          if (is404) {
            console.log('ℹ️ Pending transactions endpoint not available, using account transactions instead');
            useAccountTxs = true;
            // Try fallback immediately
            try {
              const accountTxs = await transactionApi.getAccountTransactions(accountIndex, { limit: 50 });
              // Filter for pending/queued transactions (status 0 or 1)
              pendingTxs = accountTxs.filter(tx => {
                const status = typeof tx.status === 'number' ? tx.status : 
                              (tx.status === 'pending' ? 0 : -1);
                return status === 0 || status === 1; // PENDING or QUEUED
              });
            } catch (fallbackError) {
              // If fallback also fails, just skip the check
              console.warn(`⚠️ Could not check account transactions: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
              return; // Skip the check entirely
            }
          } else {
            // For other errors, just skip the check
            console.warn(`⚠️ Error checking pending transactions: ${errorMsg}`);
            return;
          }
        }
      } else {
        // Already using account transactions fallback
        try {
          const accountTxs = await transactionApi.getAccountTransactions(accountIndex, { limit: 50 });
          // Filter for pending/queued transactions (status 0 or 1)
          pendingTxs = accountTxs.filter(tx => {
            const status = typeof tx.status === 'number' ? tx.status : 
                          (tx.status === 'pending' ? 0 : -1);
            return status === 0 || status === 1; // PENDING or QUEUED
          });
        } catch (error) {
          // If this also fails, just skip the check
          console.warn(`⚠️ Could not check account transactions: ${error instanceof Error ? error.message : String(error)}`);
          return; // Skip the check entirely
        }
      }
      
      if (pendingTxs.length === 0) {
        if (useAccountTxs || startTime === Date.now()) {
          console.log('✅ No pending transactions found');
        }
        return;
      }
      
      console.log(`⏳ Waiting for ${pendingTxs.length} pending transaction(s) to clear...`);
      
      // Log some details about pending transactions
      if (pendingTxs.length > 0 && pendingTxs.length <= 5) {
        pendingTxs.forEach((tx, idx) => {
          const status = typeof tx.status === 'number' ? tx.status : 'unknown';
          console.log(`   ${idx + 1}. Hash: ${tx.hash?.substring(0, 16)}..., Status: ${status}, Type: ${tx.type}`);
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      // If we get repeated errors, just skip the check
      const errorMsg = error instanceof Error ? error.message : String(error);
      const is404 = errorMsg.includes('404') || 
                   errorMsg.includes('not found') ||
                   errorMsg.includes('NotFoundException') ||
                   (error as any)?.status === 404;
      
      if (is404) {
        console.log('ℹ️ Pending transaction check not available, skipping...');
        return; // Skip the check
      }
      console.warn(`⚠️ Error checking pending transactions: ${errorMsg}`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
  
  // Don't throw error, just log warning
  console.warn(`⚠️ Timeout waiting for pending transactions, continuing anyway...`);
}

async function closeAllPositions() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';
  
  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const accountApi = new AccountApi(apiClient);
  const transactionApi = new TransactionApi(apiClient);

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    console.log('🚀 Closing All Positions...\n');
    
    // Check and wait for pending transactions to clear (optional - won't fail if unavailable)
    console.log('🔍 Checking for pending transactions...');
    await waitForPendingTransactions(transactionApi, ACCOUNT_INDEX, 30000, 2000);
    console.log('');
    
    // First, get account info to fetch positions
    console.log('📊 Fetching account positions...');
    const account = await accountApi.getAccount({
      by: 'index',
      value: ACCOUNT_INDEX.toString()
    });

    // Debug: Log full account response to see structure
    if (process.env.DEBUG) {
    }

    // Check for positions - account response might be wrapped
    let actualAccount = account;
    let positions: any[] = [];
    
    // Check if response is wrapped in 'accounts' array
    if ((account as any).accounts && Array.isArray((account as any).accounts) && (account as any).accounts.length > 0) {
      actualAccount = (account as any).accounts[0];
      console.log('ℹ️ Account response wrapped in accounts array, using first account');
    }
    
    // Get positions from the actual account object
    positions = actualAccount.positions || [];
    
    // Also check if positions are nested or have different structure
    if (!positions || positions.length === 0) {
      // Try alternative field names
      positions = (actualAccount as any).position || (actualAccount as any).Position || [];
      if (Array.isArray(positions) && positions.length > 0) {
        console.log('ℹ️ Found positions in alternative field');
      }
    }

    // Check if account has a data wrapper
    if ((!positions || positions.length === 0) && (actualAccount as any).data) {
      const accountData = (actualAccount as any).data;
      positions = accountData.positions || accountData.position || [];
    }

    if (!positions || positions.length === 0) {
      console.log('ℹ️ No open positions found in account response.');
      console.log('   Account structure:', {
        hasPositions: !!actualAccount.positions,
        positionsLength: actualAccount.positions?.length || 0,
        accountKeys: Object.keys(actualAccount),
        responseKeys: Object.keys(account)
      });
      console.log('   Note: This only closes ACTIVE positions, not limit orders.');
      console.log('   Limit orders should be cancelled separately using cancelOrder().');
      return;
    }

    // Filter out positions with zero size (closed positions)
    // Note: API returns 'position' field (not 'size') and 'sign' field (not 'side')
    // sign: 1 = long, -1 = short, 0 = no position
    const activePositions = positions.filter(p => {
      // Use 'position' field (the actual position size)
      const positionStr = (p as any).position || p.size || '0';
      const positionSize = parseFloat(positionStr);
      const sign = (p as any).sign || 0; // 1 = long, -1 = short
      
      // Position is active if size > 0 and sign != 0
      const isActive = positionSize > 0 && sign !== 0;
      
      return isActive;
    });

    if (activePositions.length === 0) {
      console.log('ℹ️ No active positions found (all positions have zero size or invalid sign).');
      console.log('   Note: This only closes ACTIVE positions, not limit orders.');
      console.log('   Limit orders should be cancelled separately using cancelOrder().');
      if (positions.length > 0) {
        console.log(`   Found ${positions.length} position entry(s) but none are active.`);
      }
      return;
    }

    console.log(`📋 Found ${activePositions.length} active position(s):\n`);
    for (const position of activePositions) {
      const positionSize = (position as any).position || position.size || '0';
      const sign = (position as any).sign || 0;
      const side = sign > 0 ? 'long' : 'short';
      const entryPrice = (position as any).avg_entry_price || position.entry_price || '0';
      
      console.log(`   Market ${position.market_id}: ${side.toUpperCase()} ${positionSize} @ ${entryPrice}`);
      console.log(`   Position Value: ${(position as any).position_value || 'N/A'}`);
      console.log(`   Unrealized PnL: ${(position as any).unrealized_pnl || 'N/A'}`);
    }
    console.log('');

    // Close each active position
    for (const position of activePositions) {
      const marketIndex = position.market_id;
      // Use 'position' field (actual position size in ETH)
      const positionSizeStr = (position as any).position || position.size || '0';
      const positionSize = parseFloat(positionSizeStr);
      
      // Determine side from 'sign' field: 1 = long, -1 = short
      const sign = (position as any).sign || 0;
      const positionSide = sign > 0 ? 'long' : 'short';
      
      // Convert position size to baseAmount units (1 ETH = 1,000,000 units)
      const baseAmount = Math.floor(positionSize * 1_000_000);
      
      // Determine direction: opposite of position side
      // LONG position (sign > 0) -> need to SELL (isAsk: true) to close
      // SHORT position (sign < 0) -> need to BUY (isAsk: false) to close
      const isAsk = sign > 0; // true for long (sell to close), false for short (buy to close)
      
      console.log(`\n📋 Closing Market ${marketIndex}...`);
      console.log(`   Position: ${positionSide.toUpperCase()} ${positionSizeStr}`);
      console.log(`   Direction: ${isAsk ? 'SELL' : 'BUY'} (opposite of ${positionSide})`);
      console.log(`   Base Amount: ${baseAmount} units`);
      
      // Get current market price for better execution
      // Try mark_price, or use avg_entry_price as fallback
      const markPrice = parseFloat((position as any).mark_price || position.mark_price || '0');
      const entryPrice = parseFloat((position as any).avg_entry_price || position.entry_price || '0');
      const avgExecutionPrice = markPrice > 0 ? Math.floor(markPrice * 100) : 
                                (entryPrice > 0 ? Math.floor(entryPrice * 100) : 450000); // Convert to price units
      
      // Retry logic for "too many pending txs" error
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;
      
      while (retryCount < maxRetries && !success) {
        try {
          if (retryCount > 0) {
            const waitTime = Math.min(5000 * retryCount, 15000); // Exponential backoff, max 15s
            console.log(`   ⏳ Retry ${retryCount}/${maxRetries - 1}: Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Check pending transactions again (non-blocking)
            await waitForPendingTransactions(transactionApi, ACCOUNT_INDEX, 20000, 2000);
          }
          
          const [tx, txHash, error] = await signerClient.createMarketOrder({
            marketIndex,
            clientOrderIndex: Date.now() + retryCount, // Ensure unique client order index
            baseAmount: baseAmount,
            avgExecutionPrice: avgExecutionPrice,
            isAsk: isAsk, // CRITICAL: Opposite direction of position
            reduceOnly: true
          });

          if (error) {
            // Check if it's a "too many pending txs" error
            if (error.includes('too many pending txs') || error.includes('too many pending')) {
              retryCount++;
              if (retryCount < maxRetries) {
                console.warn(`⚠️ Market ${marketIndex}: ${error} (retry ${retryCount}/${maxRetries - 1})`);
                continue;
              } else {
                console.error(`❌ Market ${marketIndex} failed after ${maxRetries} retries: ${error}`);
                break;
              }
            } else {
              console.error(`❌ Market ${marketIndex} failed: ${error}`);
              break;
            }
          }

          if (!txHash || txHash === '') {
            console.error(`❌ No transaction hash returned for market ${marketIndex}`);
            // Log the full response for debugging
            break;
          }

          console.log(`✅ Market ${marketIndex} close request submitted: ${txHash.substring(0, 16)}...`);
          success = true;
          
          // Check if position was actually closed by waiting a bit and re-checking
          console.log(`⏳ Waiting for confirmation...`);
          try {
            await signerClient.waitForTransaction(txHash, 30000, 2000);
            console.log(`✅ Market ${marketIndex} closed successfully`);
            
            // Verify position is actually closed
            await new Promise(resolve => setTimeout(resolve, 2000));
            const updatedAccount = await accountApi.getAccount({
              by: 'index',
              value: ACCOUNT_INDEX.toString()
            });
            let updatedActualAccount = updatedAccount;
            if ((updatedAccount as any).accounts && Array.isArray((updatedAccount as any).accounts) && (updatedAccount as any).accounts.length > 0) {
              updatedActualAccount = (updatedAccount as any).accounts[0];
            }
            const updatedPositions = updatedActualAccount.positions || [];
            const updatedPosition = updatedPositions.find((p: any) => p.market_id === marketIndex);
            if (updatedPosition) {
              const updatedSize = parseFloat((updatedPosition as any).position || '0');
              if (updatedSize > 0) {
                console.log(`⚠️ Market ${marketIndex}: Position still open (size: ${updatedSize}). Transaction may have failed.`);
              }
            }
          } catch (waitError) {
            const errorMsg = waitError instanceof Error ? waitError.message : String(waitError);
            // If it's just the validation warning, the order might still be processing
            if (errorMsg.includes('invalid reduce only direction')) {
              console.log(`⚠️ Market ${marketIndex}: Validation warning (order may still be processing)`);
            } else if (errorMsg.includes('did not confirm within')) {
              // Transaction not found - might be rejected immediately
              console.error(`❌ Market ${marketIndex}: Transaction not found. It may have been rejected by the server.`);
              console.error(`   This could indicate a validation error. Check:`);
              console.error(`   - Position size: ${positionSizeStr}`);
              console.error(`   - Base amount: ${baseAmount} units`);
              console.error(`   - Direction: ${isAsk ? 'SELL' : 'BUY'}`);
              console.error(`   - Reduce only: true`);
            } else {
              console.error(`❌ Market ${marketIndex} confirmation failed: ${errorMsg}`);
            }
          }
          break; // Exit retry loop on success
        } catch (orderError) {
          const errorMsg = orderError instanceof Error ? orderError.message : String(orderError);
          
          // Check if it's a "too many pending txs" error
          if (errorMsg.includes('too many pending txs') || errorMsg.includes('too many pending')) {
            retryCount++;
            if (retryCount < maxRetries) {
              console.warn(`⚠️ Market ${marketIndex}: ${errorMsg} (retry ${retryCount}/${maxRetries - 1})`);
              continue;
            } else {
              console.error(`❌ Market ${marketIndex} order creation failed after ${maxRetries} retries: ${errorMsg}`);
            }
          } else {
            console.error(`❌ Market ${marketIndex} order creation failed: ${errorMsg}`);
            if (process.env.DEBUG) {
              console.error('   Full error:', orderError);
            }
          }
          break;
        }
      }
    }
    
    console.log('\n🎉 All position closures complete!');
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  closeAllPositions().catch(console.error);
}

export { closeAllPositions };
