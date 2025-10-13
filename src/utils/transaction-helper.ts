/**
 * Transaction Helper Utilities
 * Reusable functions for transaction confirmation and error handling
 */

import { TransactionApi, Transaction } from '../api/transaction-api';
import { ApiClient } from '../api/api-client';

export interface TransactionResult {
  success: boolean;
  transaction?: Transaction;
  error?: string;
  errorCode?: number;
  status?: number;
}

/**
 * Wait for transaction and return detailed result with proper error handling
 */
export async function waitAndCheckTransaction(
  apiClient: ApiClient,
  txHash: string,
  options: {
    maxWaitTime?: number;
    pollInterval?: number;
    silent?: boolean;
  } = {}
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
      
      // If status is 2 (COMMITTED) or 3 (EXECUTED), check for errors
      // Status 2 with no error = success (e.g., triggered orders waiting for trigger)
      // Status 3 = fully executed
      if ((status === 2 || status === 3) && !errorInfo) {
        if (!silent) {
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
        }
        return {
          success: true,
          transaction: tx,
          status
        };
      }
      // Status 2/3 but WITH error = failed validation
      else if ((status === 2 || status === 3) && errorInfo) {
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
      // Status 4 = FAILED, Status 5 = REJECTED
      else if (status === 4 || status === 5 || tx.status === 'failed') {
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
      // Status 0,1,2 = Still processing (PENDING, QUEUED, COMMITTED)
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

