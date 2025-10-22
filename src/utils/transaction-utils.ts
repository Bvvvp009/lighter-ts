/**
 * Transaction Status Checking Utilities
 * Provides standalone transaction status checking functionality
 */

import { TransactionApi, Transaction } from '../api/transaction-api';
import { ApiClient } from '../api/api-client';
import { TransactionStatus } from '../signer/wasm-signer-client';

export interface TransactionResult {
  success: boolean;
  transaction?: Transaction;
  error?: string;
  errorCode?: number;
  status?: number;
}

export interface TransactionCheckOptions {
  maxWaitTime?: number;
  pollInterval?: number;
  silent?: boolean;
}

/**
 * Wait for transaction and return detailed result with proper error handling
 */
export async function waitAndCheckTransaction(
  apiClient: ApiClient,
  txHash: string,
  options: TransactionCheckOptions = {}
): Promise<TransactionResult> {
  const {
    maxWaitTime = 60000,
    pollInterval = 2000,
    silent = false
  } = options;

  const transactionApi = new TransactionApi(apiClient);
  const startTime = Date.now();

  // Helper to extract error from transaction
  const extractError = (tx: Transaction): { message: string; code?: number } | null => {
    try {
      if (tx.event_info) {
        const eventInfo = JSON.parse(tx.event_info);
        if (eventInfo.ae) {
          const errorData = JSON.parse(eventInfo.ae);
          return {
            message: errorData.message || 'Unknown error',
            code: errorData.code
          };
        }
      }
    } catch (e) {
      // Failed to parse error info
    }
    return null;
  };

  if (!silent) {
    process.stdout.write(`⏳ Confirming transaction ${txHash.substring(0, 16)}...`);
  }

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const tx = await transactionApi.getTransaction({
        by: 'hash',
        value: txHash
      });

      const status = typeof tx.status === 'number' ? tx.status : parseInt(tx.status as string, 10);

      // Check if there's an error regardless of status
      const errorInfo = extractError(tx);
      
      // If status is COMMITTED or EXECUTED, check for errors
      if ((status === TransactionStatus.COMMITTED || status === TransactionStatus.EXECUTED) && !errorInfo) {
        if (!silent) {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
        }
        return {
          success: true,
          transaction: tx,
          status
        };
      }
      // Status COMMITTED/EXECUTED but WITH error = failed validation
      else if ((status === TransactionStatus.COMMITTED || status === TransactionStatus.EXECUTED) && errorInfo) {
        if (!silent) {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
        }
        return {
          success: false,
          transaction: tx,
          error: errorInfo.message,
          ...(errorInfo.code !== undefined && { errorCode: errorInfo.code }),
          status
        };
      }
      // Status FAILED or REJECTED
      else if (status === TransactionStatus.FAILED || status === TransactionStatus.REJECTED || tx.status === 'failed') {
        const errorInfo = extractError(tx);
        if (!silent) {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
        }
        return {
          success: false,
          transaction: tx,
          error: errorInfo?.message || 'Transaction failed',
          ...(errorInfo?.code !== undefined && { errorCode: errorInfo.code }),
          status
        };
      }
      // Status PENDING, QUEUED, COMMITTED = Still processing
      else {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    } catch (error) {
      // If transaction not found yet, continue polling
      if (error instanceof Error && (
        error.message.includes('not found') ||
        error.message.includes('404') ||
        error.message.includes('No transaction found')
      )) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }
      
      // For other errors, continue trying
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout
  if (!silent) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }
  
  return {
    success: false,
    error: 'Transaction confirmation timeout',
    status: -1
  };
}

/**
 * Quick check if transaction succeeded (for simple cases)
 */
export async function isTransactionSuccessful(
  apiClient: ApiClient,
  txHash: string
): Promise<boolean> {
  const result = await waitAndCheckTransaction(apiClient, txHash, { silent: true });
  return result.success;
}

/**
 * Get transaction error details if failed
 */
export async function getTransactionError(
  apiClient: ApiClient,
  txHash: string
): Promise<{ message: string; code?: number } | null> {
  try {
    const transactionApi = new TransactionApi(apiClient);
    const tx = await transactionApi.getTransaction({
      by: 'hash',
      value: txHash
    });

    if (tx.event_info) {
      const eventInfo = JSON.parse(tx.event_info);
      if (eventInfo.ae) {
        const errorData = JSON.parse(eventInfo.ae);
        return {
          message: errorData.message || 'Unknown error',
          code: errorData.code
        };
      }
    }
  } catch (e) {
    return { message: 'Could not fetch transaction' };
  }
  
  return null;
}

/**
 * Helper to print transaction result in a consistent format
 */
export function printTransactionResult(
  operationName: string,
  txHash: string,
  result: TransactionResult
): void {
  if (result.success) {
    console.log(`✅ ${operationName} successful!`);
    console.log(`   TX Hash: ${txHash}`);
    if (result.transaction) {
      console.log(`   Block: ${result.transaction.block_height}`);
      console.log(`   Status: Executed`);
    }
  } else {
    console.log(`❌ ${operationName} failed!`);
    console.log(`   TX Hash: ${txHash}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.errorCode) {
      console.log(`   Error Code: ${result.errorCode}`);
    }
  }
}

/**
 * Batch transaction checking for multiple transactions
 */
export async function checkMultipleTransactions(
  apiClient: ApiClient,
  txHashes: string[],
  options: TransactionCheckOptions = {}
): Promise<TransactionResult[]> {
  const promises = txHashes.map(hash => 
    waitAndCheckTransaction(apiClient, hash, options)
  );
  
  return Promise.all(promises);
}

/**
 * Wait for all transactions to complete (success or failure)
 */
export async function waitForAllTransactions(
  apiClient: ApiClient,
  txHashes: string[],
  options: TransactionCheckOptions = {}
): Promise<{ allSuccessful: boolean; results: TransactionResult[] }> {
  const results = await checkMultipleTransactions(apiClient, txHashes, options);
  const allSuccessful = results.every(result => result.success);
  
  return {
    allSuccessful,
    results
  };
}
