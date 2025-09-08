import { ApiClient } from './api-client';
import { BlockParams, TransactionParams, PaginationParams, SendTransactionParams, SendTransactionBatchParams } from '../types';

export interface Transaction {
  hash: string;
  block_height: number;
  sequence_index: number;
  account_index: number;
  nonce: number;
  type: string;
  data: any;
  status: 'pending' | 'confirmed' | 'failed';
  created_at: string;
  updated_at: string;
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
  hash: string;
}

export interface TxHashes {
  hashes: string[];
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
    const response = await this.client.get<Transaction>('/api/v1/tx', {
      by: params.by,
      value: params.value,
    });
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
    });
    return response.data;
  }

  public async sendTx(txType: number, txInfo: string): Promise<TxHash> {
    const formData = new FormData();
    formData.append('tx_type', txType.toString());
    formData.append('tx_info', txInfo);
    
    const response = await this.client.post<TxHash>('/api/v1/sendTx', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  public async sendTransactionBatch(params: SendTransactionBatchParams): Promise<TxHashes> {
    const response = await this.client.post<TxHashes>('/api/v1/sendTxBatch', {
      account_index: params.account_index,
      api_key_index: params.api_key_index,
      transactions: params.transactions,
    });
    return response.data;
  }

  public async getTransactionFromL1TxHash(l1TxHash: string): Promise<Transaction> {
    const response = await this.client.get<Transaction>('/api/v1/txFromL1TxHash', {
      l1_tx_hash: l1TxHash,
    });
    return response.data;
  }

  public async getDepositHistory(accountIndex: number, params?: PaginationParams): Promise<any> {
    const response = await this.client.get('/api/v1/deposit/history', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }

  public async getWithdrawHistory(accountIndex: number, params?: PaginationParams): Promise<any> {
    const response = await this.client.get('/api/v1/withdraw/history', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }
}