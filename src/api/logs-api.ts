import { ExplorerApiClient } from './explorer-api-client';
import { TransactionLog, PublicData, TradePubdata } from './search-api';

/**
 * Log query parameters for retrieving logs by account
 */
export interface LogQueryParams {
  /**
   * Array of log types to filter by (optional)
   * Examples: 'Trade', 'Order', 'Liquidation', etc.
   */
  pub_data_type?: string[];
  
  /**
   * Maximum number of results to return
   */
  limit: number;
  
  /**
   * Offset for pagination
   */
  offset: number;
}

/**
 * Account logs response with pagination
 */
export interface AccountLogsResponse {
  logs: TransactionLog[];
  total?: number;
  limit: number;
  offset: number;
}

/**
 * LogsApi provides access to transaction logs and activity history
 */
export class LogsApi {
  private client: ExplorerApiClient;

  constructor(client: ExplorerApiClient) {
    this.client = client;
  }

  /**
   * Get transaction log by transaction hash
   * 
   * This is the primary method for checking transaction status and details
   * 
   * @param hash Transaction hash
   * @returns Transaction log with execution details
   * @throws NotFoundException if transaction hash not found
   * 
   * @example
   * ```typescript
   * const logsApi = new LogsApi(explorerClient);
   * 
   * // Get transaction details
   * const txLog = await logsApi.getByHash('0x123abc...');
   * 
   * console.log('Transaction Status:', txLog.status);
   * console.log('Executed at:', txLog.time);
   * console.log('Block Number:', txLog.block_number);
   * 
   * // Check if it was a trade
   * if (txLog.pubdata_type === 'Trade') {
   *   const trade = txLog.pubdata?.trade_pubdata;
   *   console.log('Price:', trade?.price);
   *   console.log('Size:', trade?.size);
   *   console.log('Maker Fee:', trade?.maker_fee);
   *   console.log('Taker Fee:', trade?.taker_fee);
   * }
   * ```
   */
  async getByHash(hash: string): Promise<TransactionLog> {
    const response = await this.client.get(`/logs/${hash}`);
    return response.data;
  }

  /**
   * Get transaction logs for an account
   * 
   * Retrieves transaction history for an account identified by L1 address or account index
   * 
   * @param accountIdentifier L1 address or account index
   * @param params Query parameters (limit, offset, pub_data_type filter)
   * @returns Array of transaction logs for the account
   * 
   * @example
   * ```typescript
   * const logsApi = new LogsApi(explorerClient);
   * 
   * // Get latest 100 transactions for an account
   * const accountLogs = await logsApi.getByAccount('0xAccountAddress', {
   *   limit: 100,
   *   offset: 0
   * });
   * 
   * console.log(`Found ${accountLogs.logs.length} transactions`);
   * 
   * accountLogs.logs.forEach(log => {
   *   console.log(`[${log.time}] ${log.tx_type}: ${log.status}`);
   * });
   * ```
   */
  async getByAccount(
    accountIdentifier: string,
    params: LogQueryParams
  ): Promise<AccountLogsResponse> {
    const queryParams: any = {
      limit: params.limit,
      offset: params.offset,
    };

    if (params.pub_data_type && params.pub_data_type.length > 0) {
      queryParams.pub_data_type = params.pub_data_type;
    }

    const response = await this.client.get(`/accounts/${accountIdentifier}/logs`, queryParams);
    
    return {
      logs: response.data || [],
      limit: params.limit,
      offset: params.offset,
      total: response.data?.total,
    };
  }

  /**
   * Get account activity logs with optional filtering
   * Convenience method combining account retrieval with common filters
   * 
   * @param accountIdentifier L1 address or account index
   * @param limit Maximum number of results
   * @param offset Pagination offset
   * @param dataTypes Optional array of data types to filter by
   * @returns Account logs with pagination info
   */
  async getAccountActivity(
    accountIdentifier: string,
    limit: number = 100,
    offset: number = 0,
    dataTypes?: string[]
  ): Promise<AccountLogsResponse> {
    const params: LogQueryParams = {
      limit,
      offset,
    };
    if (dataTypes !== undefined) {
      params.pub_data_type = dataTypes;
    }
    return this.getByAccount(accountIdentifier, params);
  }

  /**
   * Check if a transaction was executed
   * Convenience method to quickly verify transaction execution
   * 
   * @param hash Transaction hash
   * @returns true if transaction was executed, false otherwise
   * 
   * @example
   * ```typescript
   * const logsApi = new LogsApi(explorerClient);
   * 
   * const isExecuted = await logsApi.isTransactionExecuted('0x123abc...');
   * if (isExecuted) {
   *   console.log('Transaction has been executed');
   * }
   * ```
   */
  async isTransactionExecuted(hash: string): Promise<boolean> {
    try {
      const log = await this.getByHash(hash);
      return log.status === 'executed' || log.status === 'committed';
    } catch {
      return false;
    }
  }

  /**
   * Determine if transaction is still pending
   * 
   * @param hash Transaction hash
   * @returns true if transaction is pending, false otherwise
   */
  async isTransactionPending(hash: string): Promise<boolean> {
    try {
      const log = await this.getByHash(hash);
      return log.status === 'pending';
    } catch {
      return false;
    }
  }

  /**
   * Get trade details from a transaction log
   * Extracts and returns trade-specific information
   * 
   * @param hash Transaction hash
   * @returns Trade pubdata or undefined if not a trade transaction
   * 
   * @example
   * ```typescript
   * const logsApi = new LogsApi(explorerClient);
   * 
   * const tradeData = await logsApi.getTradeData('0x123abc...');
   * if (tradeData) {
   *   console.log('Market Index:', tradeData.market_index);
   *   console.log('Price:', tradeData.price);
   *   console.log('Size:', tradeData.size);
   *   console.log('Taker Fee:', tradeData.taker_fee);
   * }
   * ```
   */
  async getTradeData(hash: string): Promise<TradePubdata | undefined> {
    try {
      const log = await this.getByHash(hash);
      if (log.pubdata_type === 'Trade') {
        return log.pubdata?.trade_pubdata;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get all logs of a specific type for an account
   * 
   * @param accountIdentifier L1 address or account index
   * @param dataType Data type to filter by (e.g., 'Trade', 'Order')
   * @param limit Maximum number of results
   * @param offset Pagination offset
   * @returns Filtered account logs
   */
  async getAccountLogsByType(
    accountIdentifier: string,
    dataType: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AccountLogsResponse> {
    return this.getByAccount(accountIdentifier, {
      limit,
      offset,
      pub_data_type: [dataType],
    });
  }

  /**
   * Get recent trades for an account
   * 
   * @param accountIdentifier L1 address or account index
   * @param limit Maximum number of results
   * @param offset Pagination offset
   * @returns Trade logs for the account
   */
  async getAccountTrades(
    accountIdentifier: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AccountLogsResponse> {
    return this.getAccountLogsByType(accountIdentifier, 'Trade', limit, offset);
  }

  /**
   * Poll for transaction confirmation
   * Continuously checks transaction status until it's executed or fails
   * 
   * @param hash Transaction hash
   * @param maxAttempts Maximum number of attempts
   * @param intervalMs Interval between attempts in milliseconds
   * @returns Final transaction log or undefined if timeout
   * 
   * @example
   * ```typescript
   * const logsApi = new LogsApi(explorerClient);
   * 
   * const result = await logsApi.waitForExecution(
   *   '0x123abc...',
   *   60,  // Check for up to 60 times
   *   1000 // Check every 1 second
   * );
   * 
   * if (result?.status === 'executed') {
   *   console.log('Transaction confirmed!');
   * } else {
   *   console.log('Timeout waiting for transaction');
   * }
   * ```
   */
  async waitForExecution(
    hash: string,
    maxAttempts: number = 60,
    intervalMs: number = 1000
  ): Promise<TransactionLog | undefined> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const log = await this.getByHash(hash);
        
        if (log.status === 'committed' || log.status === 'executed' || log.status === 'failed' || log.status === 'rejected') {
          return log;
        }
        
        // Wait before next attempt
        if (i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        // Not found yet, continue polling
        if (i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }
    
    return undefined;
  }
}
