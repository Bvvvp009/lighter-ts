import { ApiClient } from './api-client';
import { ApiResponse } from '../types';
import { DepositHistory, WithdrawHistory, L1DepositParams, L1DepositResult, L1BridgeConfig } from '../types/api';
import { L1BridgeClient } from '../bridge/l1-bridge-client';

export interface FastBridgeInfo {
  code: number;
  message?: string;
  fast_bridge_limit: string;
}

export interface BridgeSupportedNetwork {
  name: string;
  chain_id: string;
  explorer: string;
}

export class BridgeApi {
  private client: ApiClient;
  private l1BridgeClient?: L1BridgeClient;

  constructor(apiClient: ApiClient, l1BridgeConfig?: L1BridgeConfig) {
    this.client = apiClient;
    if (l1BridgeConfig) {
      this.l1BridgeClient = new L1BridgeClient(l1BridgeConfig);
    }
  }

  /**
   * Get fast bridge information including limits
   * @returns Promise<FastBridgeInfo>
   */
  public async getFastBridgeInfo(): Promise<FastBridgeInfo> {
    const response = await this.client.get<FastBridgeInfo>('/api/v1/fastbridge/info');
    return response.data;
  }

  /**
   * Get fast bridge information with full response details
   * @returns Promise<ApiResponse<FastBridgeInfo>>
   */
  public async getFastBridgeInfoWithResponse(): Promise<ApiResponse<FastBridgeInfo>> {
    return await this.client.get<FastBridgeInfo>('/api/v1/fastbridge/info');
  }

  /**
   * Get supported bridge networks
   * @returns Promise<BridgeSupportedNetwork[]>
   */
  public async getSupportedNetworks(): Promise<BridgeSupportedNetwork[]> {
    // This endpoint might not exist yet, but we'll prepare for it
    try {
      const response = await this.client.get<BridgeSupportedNetwork[]>('/api/v1/bridge/networks');
      return response.data;
    } catch (error) {
      // Fallback to empty array if endpoint doesn't exist
      console.warn('Bridge networks endpoint not available:', error);
      return [];
    }
  }

  /**
   * Get deposit history for an account
   * @param accountIndex - Account index
   * @param l1Address - L1 address
   * @param authorization - Authorization token
   * @param cursor - Pagination cursor
   * @param filter - Filter criteria
   * @returns Promise<DepositHistory>
   */
  public async getDepositHistory(
    accountIndex: number,
    l1Address: string,
    authorization?: string,
    cursor?: string,
    filter?: string
  ): Promise<DepositHistory> {
    const params = new URLSearchParams({
      account_index: accountIndex.toString(),
      l1_address: l1Address,
      ...(cursor && { cursor }),
      ...(filter && { filter })
    });

    const headers: Record<string, string> = {};
    if (authorization) {
      headers['Authorization'] = authorization;
      headers['auth'] = authorization;
    }

    const response = await this.client.get<DepositHistory>(`/api/v1/deposit/history?${params}`, headers);
    return response.data;
  }

  /**
   * Get withdraw history for an account
   * @param accountIndex - Account index
   * @param l1Address - L1 address
   * @param authorization - Authorization token
   * @param cursor - Pagination cursor
   * @param filter - Filter criteria
   * @returns Promise<WithdrawHistory>
   */
  public async getWithdrawHistory(
    accountIndex: number,
    l1Address: string,
    authorization?: string,
    cursor?: string,
    filter?: string
  ): Promise<WithdrawHistory> {
    const params = new URLSearchParams({
      account_index: accountIndex.toString(),
      l1_address: l1Address,
      ...(cursor && { cursor }),
      ...(filter && { filter })
    });

    const headers: Record<string, string> = {};
    if (authorization) {
      headers['Authorization'] = authorization;
      headers['auth'] = authorization;
    }

    const response = await this.client.get<WithdrawHistory>(`/api/v1/withdraw/history?${params}`, headers);
    return response.data;
  }

  /**
   * Deposit USDC from L1 to L2
   * @param params - L1 deposit parameters
   * @returns Promise<L1DepositResult>
   */
  public async depositFromL1(params: L1DepositParams): Promise<L1DepositResult> {
    if (!this.l1BridgeClient) {
      throw new Error('L1 bridge client not configured. Please provide L1BridgeConfig in constructor.');
    }
    
    return await this.l1BridgeClient.depositToL2(params);
  }

  /**
   * Get USDC balance on L1
   * @param address - Ethereum address
   * @returns Promise<string> - Balance in USDC units
   */
  public async getL1USDCBalance(address: string): Promise<string> {
    if (!this.l1BridgeClient) {
      throw new Error('L1 bridge client not configured. Please provide L1BridgeConfig in constructor.');
    }
    
    return await this.l1BridgeClient.getUSDCBalance(address);
  }

  /**
   * Get USDC allowance for bridge contract
   * @param address - Ethereum address
   * @returns Promise<string> - Allowance in USDC units
   */
  public async getL1USDCAllowance(address: string): Promise<string> {
    if (!this.l1BridgeClient) {
      throw new Error('L1 bridge client not configured. Please provide L1BridgeConfig in constructor.');
    }
    
    return await this.l1BridgeClient.getUSDCAllowance(address);
  }

  /**
   * Get L1 transaction status
   * @param txHash - Transaction hash
   * @returns Promise<L1DepositResult>
   */
  public async getL1TransactionStatus(txHash: string): Promise<L1DepositResult> {
    if (!this.l1BridgeClient) {
      throw new Error('L1 bridge client not configured. Please provide L1BridgeConfig in constructor.');
    }
    
    return await this.l1BridgeClient.getTransactionStatus(txHash);
  }
}
