import { ApiClient } from './api-client';
import { BlockParams, TransactionParams, PaginationParams, SendTransactionParams, SendTransactionBatchParams } from '../types';

export interface Transaction {
  hash: string;
  block_height: number;
  sequence_index: number;
  account_index: number;
  nonce: number;
  type: string | number;
  info?: string; // JSON string containing transaction info
  event_info?: string; // JSON string containing event information
  data?: any;
  status: number | 'pending' | 'confirmed' | 'failed'; // Numeric status code or string
  transaction_index?: number;
  l1_address?: string;
  expire_at?: number;
  queued_at?: number;
  committed_at?: number;
  verified_at?: number;
  executed_at?: number;
  parent_hash?: string;
  created_at?: string;
  updated_at?: string;
  code?: number; // API response code
  message?: string; // API response message
}

export interface Block {
  height: number;
  hash: string;
  parent_hash: string;
  timestamp: number;
  transactions_count: number;
  created_at: string;
}

export interface NextNonce {
  account_index: number;
  api_key_index: number;
  nonce: number;
}

export interface TxHash {
  hash?: string;
  tx_hash?: string; // API returns tx_hash with underscore
  code?: number;
  message?: string;
  predicted_execution_time_ms?: number;
}

export interface TxHashes {
  hashes?: string[];
  tx_hash?: string[]; // API returns tx_hash (with underscore)
  code?: number;
  message?: string;
  predicted_execution_time_ms?: number;
}

export interface DepositHistoryItem {
  id?: string;
  account_index: number;
  l1_address: string;
  l2_address?: string;
  amount: string;
  tx_hash?: string;
  l1_tx_hash?: string;
  status: string;
  timestamp: number;
  created_at?: string;
  [key: string]: any; // Allow for additional fields
}

export interface DepositHistory {
  entries?: DepositHistoryItem[];
  cursor?: string;
  has_more?: boolean;
  [key: string]: any; // Allow for additional fields
}

export interface WithdrawHistoryItem {
  id?: string;
  account_index: number;
  l1_address: string;
  l2_address?: string;
  amount: string;
  tx_hash?: string;
  l1_tx_hash?: string;
  status: string;
  timestamp: number;
  created_at?: string;
  [key: string]: any; // Allow for additional fields
}

export interface WithdrawHistory {
  entries?: WithdrawHistoryItem[];
  cursor?: string;
  has_more?: boolean;
  [key: string]: any; // Allow for additional fields
}

export class TransactionApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getBlock(params: BlockParams): Promise<Block> {
    const response = await this.client.get<Block>('/api/v1/block', {
      by: params.by,
      value: params.value,
    });
    return response.data;
  }

  public async getBlocks(params?: PaginationParams): Promise<Block[]> {
    const response = await this.client.get<Block[]>('/api/v1/blocks', params);
    return response.data;
  }

  public async getCurrentHeight(): Promise<{ height: number }> {
    const response = await this.client.get<{ height: number }>('/api/v1/currentHeight');
    return response.data;
  }

  public async getTransaction(params: TransactionParams): Promise<Transaction> {
    // Debug logging
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log('🔍 Querying transaction:', params.by, params.value);
    }
    
    const response = await this.client.get<Transaction>('/api/v1/tx', {
      by: params.by,
      value: params.value,
    });
    
    // Debug logging
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log('📥 Transaction query response:', {
        found: !!response.data,
        hash: response.data?.hash?.substring(0, 32),
        status: response.data?.status,
        code: response.data?.code,
        message: response.data?.message
      });
    }
    
    return response.data;
  }

  public async getTransactions(params?: PaginationParams): Promise<Transaction[]> {
    const response = await this.client.get<Transaction[]>('/api/v1/txs', params);
    return response.data;
  }

  public async getBlockTransactions(params: BlockParams & PaginationParams): Promise<Transaction[]> {
    const { by, value, ...paginationParams } = params;
    const response = await this.client.get<Transaction[]>('/api/v1/blockTxs', {
      by,
      value,
      ...paginationParams,
    });
    return response.data;
  }

  public async getAccountTransactions(accountIndex: number, params?: PaginationParams): Promise<Transaction[]> {
    const response = await this.client.get<Transaction[]>('/api/v1/accountTxs', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }

  public async getAccountPendingTransactions(accountIndex: number, params?: PaginationParams): Promise<Transaction[]> {
    const response = await this.client.get<Transaction[]>('/api/v1/accountPendingTxs', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }

  public async getPendingTransactions(params?: PaginationParams): Promise<Transaction[]> {
    const response = await this.client.get<Transaction[]>('/api/v1/pendingTxs', params);
    return response.data;
  }

  public async getNextNonce(accountIndex: number, apiKeyIndex: number): Promise<NextNonce> {
    const response = await this.client.get<NextNonce>('/api/v1/nextNonce', {
      account_index: accountIndex,
      api_key_index: apiKeyIndex,
    });
    return response.data;
  }

  public async sendTransaction(params: SendTransactionParams): Promise<TxHash> {
    const response = await this.client.post<TxHash>('/api/v1/sendTx', {
      account_index: params.account_index,
      api_key_index: params.api_key_index,
      transaction: params.transaction,
      ...(params.price_protection !== undefined ? { price_protection: params.price_protection } : {}),
    });
    return response.data;
  }

  public async sendTx(txType: number, txInfo: string, priceProtection: boolean = true): Promise<TxHash> {
    // Use x-www-form-urlencoded to match Go client behavior
    const params = new URLSearchParams();
    params.append('tx_type', txType.toString());
    params.append('tx_info', txInfo);
    params.append('price_protection', priceProtection ? 'true' : 'false');

    const response = await this.client.post<TxHash>('/api/v1/sendTx', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  }

  public async sendTxWithIndices(
    txType: number,
    txInfo: string,
    accountIndex: number,
    apiKeyIndex: number,
    priceProtection: boolean = true
  ): Promise<TxHash> {
    const params = new URLSearchParams();
    params.append('tx_type', txType.toString());
    params.append('tx_info', txInfo);
    params.append('account_index', accountIndex.toString());
    params.append('api_key_index', apiKeyIndex.toString());
    params.append('price_protection', priceProtection ? 'true' : 'false');

    // Debug logging
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      try {
        const txInfoParsed = JSON.parse(txInfo);
        console.log('🔍 Sending transaction details:');
        console.log('   TxType:', txType);
        console.log('   MarketIndex:', txInfoParsed.MarketIndex);
        console.log('   AccountIndex:', accountIndex);
        console.log('   ApiKeyIndex:', apiKeyIndex);
        console.log('   TxInfo length:', txInfo.length);
      } catch (e) {
        // Ignore parse errors
      }
    }

    const response = await this.client.post<TxHash>('/api/v1/sendTx', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    
    // Debug logging
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
    }
    
    return response.data;
  }

  // JSON variant
  public async sendTxJson(
    txType: number,
    txInfo: string,
    accountIndex: number,
    apiKeyIndex: number,
    priceProtection: boolean = true
  ): Promise<TxHash> {
    const payload = {
      tx_type: txType,
      tx_info: txInfo,
      account_index: accountIndex,
      api_key_index: apiKeyIndex,
      price_protection: priceProtection,
    } as any;
    const response = await this.client.post<TxHash>('/api/v1/sendTx', payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  }

  public async sendTransactionBatch(params: SendTransactionBatchParams): Promise<TxHashes> {
    if (params.tx_types && params.tx_infos) {

      const urlParams = new URLSearchParams();
      urlParams.append('tx_types', params.tx_types);
      urlParams.append('tx_infos', params.tx_infos);
      
      const response = await this.client.post<TxHashes>('/api/v1/sendTxBatch', urlParams, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return response.data;
    } else if (params.transactions) {
      // TypeScript style: transactions array (JSON)
      const response = await this.client.post<TxHashes>('/api/v1/sendTxBatch', {
        account_index: params.account_index,
        api_key_index: params.api_key_index,
        transactions: params.transactions,
      });
      return response.data;
    }
    
    throw new Error('Invalid batch params: must provide either (tx_types, tx_infos) or (transactions)');
  }

  public async getTransactionFromL1TxHash(l1TxHash: string): Promise<Transaction> {
    const response = await this.client.get<Transaction>('/api/v1/txFromL1TxHash', {
      l1_tx_hash: l1TxHash,
    });
    return response.data;
  }

  public async getDepositHistory(accountIndex: number, params?: PaginationParams): Promise<DepositHistory> {
    const response = await this.client.get<DepositHistory>('/api/v1/deposit/history', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }

  public async getWithdrawHistory(accountIndex: number, params?: PaginationParams): Promise<WithdrawHistory> {
    const response = await this.client.get<WithdrawHistory>('/api/v1/withdraw/history', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }
}