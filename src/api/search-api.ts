import { ExplorerApiClient } from './explorer-api-client';

/**
 * Search result types
 */
export type SearchResultType = 'log' | 'transaction' | 'batch' | 'block' | 'account';

/**
 * Transaction/Log search result
 */
export interface TransactionLogResult {
  type: 'log';
  log: TransactionLog;
}

/**
 * Transaction Log details
 */
export interface TransactionLog {
  tx_type: string;
  hash: string;
  time: string;
  pubdata?: PublicData;
  pubdata_type: string;
  block_number: number;
  batch_number: number;
  status: 'pending' | 'committed' | 'executed' | 'failed' | 'rejected';
  [key: string]: any;
}

/**
 * Public data from transaction
 */
export interface PublicData {
  trade_pubdata?: TradePubdata;
  order_pubdata?: OrderPubdata;
  [key: string]: any;
}

/**
 * Trade public data
 */
export interface TradePubdata {
  trade_type: number;
  market_index: number;
  is_taker_ask: number;
  maker_fee: number;
  taker_fee: number;
  taker_account_index: string;
  maker_account_index: string;
  fee_account_index: string;
  price: string;
  size: string;
  [key: string]: any;
}

/**
 * Order public data
 */
export interface OrderPubdata {
  market_index: number;
  account_index: string;
  [key: string]: any;
}

/**
 * Batch search result
 */
export interface BatchResult {
  type: 'batch';
  batch: BatchInfo;
}

/**
 * Batch information
 */
export interface BatchInfo {
  batch_number: number;
  block_number: number;
  [key: string]: any;
}

/**
 * Block search result
 */
export interface BlockResult {
  type: 'block';
  block: BlockInfo;
}

/**
 * Block information
 */
export interface BlockInfo {
  number: number;
  hash: string;
  timestamp: string;
  [key: string]: any;
}

/**
 * Account search result
 */
export interface AccountResult {
  type: 'account';
  account: AccountInfo;
}

/**
 * Account information
 */
export interface AccountInfo {
  account_index: number;
  l1_address: string;
  [key: string]: any;
}

/**
 * Union type for all possible search results
 */
export type SearchResult = TransactionLogResult | BatchResult | BlockResult | AccountResult;

/**
 * Search query parameters
 */
export interface SearchParams {
  /**
   * Search query - can be:
   * - Transaction hash
   * - Block number
   * - Batch number
   * - Account L1 address
   * - Account index
   */
  q: string;
}

/**
 * SearchApi provides universal search functionality across the Lighter Explorer
 */
export class SearchApi {
  private client: ExplorerApiClient;

  constructor(client: ExplorerApiClient) {
    this.client = client;
  }

  /**
   * Search for blocks, batches, transactions, or accounts
   * 
   * @param params Search parameters with query string
   * @returns Array of search results
   * 
   * @example
   * ```typescript
   * const searchApi = new SearchApi(explorerClient);
   * 
   * // Search by transaction hash
   * const results = await searchApi.search({ 
   *   q: '0000000dbdf446460000019c56e3c841000000000000000000000000000000000000000000000000' 
   * });
   * 
   * // Results could include transaction logs, blocks, batches
   * results.forEach(result => {
   *   if (result.type === 'log') {
   *     console.log('Transaction status:', result.log.status);
   *     console.log('Tx Type:', result.log.tx_type);
   *   }
   * });
   * ```
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.client.get('/search', { q: params.q });
    return response.data || [];
  }

  /**
   * Search for a transaction by hash
   * 
   * @param txHash Transaction hash
   * @returns Transaction log result if found
   * 
   * @example
   * ```typescript
   * const searchApi = new SearchApi(explorerClient);
   * const result = await searchApi.searchTransaction('0x123abc...');
   * 
   * if (result?.type === 'log') {
   *   console.log('Tx Status:', result.log.status);
   * }
   * ```
   */
  async searchTransaction(txHash: string): Promise<TransactionLogResult | undefined> {
    const results = await this.search({ q: txHash });
    return results.find(r => r.type === 'log') as TransactionLogResult | undefined;
  }

  /**
   * Search for a batch by batch number
   * 
   * @param batchNumber Batch number
   * @returns Batch result if found
   */
  async searchBatch(batchNumber: number | string): Promise<BatchResult | undefined> {
    const results = await this.search({ q: String(batchNumber) });
    return results.find(r => r.type === 'batch') as BatchResult | undefined;
  }

  /**
   * Search for a block by block number or hash
   * 
   * @param blockIdentifier Block number or hash
   * @returns Block result if found
   */
  async searchBlock(blockIdentifier: number | string): Promise<BlockResult | undefined> {
    const results = await this.search({ q: String(blockIdentifier) });
    return results.find(r => r.type === 'block') as BlockResult | undefined;
  }

  /**
   * Search for an account by L1 address or account index
   * 
   * @param accountIdentifier L1 address or account index
   * @returns Account result if found
   */
  async searchAccount(accountIdentifier: string | number): Promise<AccountResult | undefined> {
    const results = await this.search({ q: String(accountIdentifier) });
    return results.find(r => r.type === 'account') as AccountResult | undefined;
  }

  /**
   * Get transaction status from search
   * Convenience method to quickly check if a transaction was executed
   * 
   * @param txHash Transaction hash
   * @returns Transaction status or undefined if not found
   * 
   * @example
   * ```typescript
   * const status = await searchApi.getTransactionStatus('0x123abc...');
   * if (status === 'executed') {
   *   console.log('Transaction was successfully executed');
   * } else if (status === 'pending') {
   *   console.log('Transaction is still pending');
   * }
   * ```
   */
  async getTransactionStatus(txHash: string): Promise<'pending' | 'committed' | 'executed' | 'failed' | 'rejected' | undefined> {
    const result = await this.searchTransaction(txHash);
    return result?.log.status;
  }
}
