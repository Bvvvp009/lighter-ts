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

export interface BridgesByL1AddressResponse {
  [key: string]: any;
}

export interface IsNextBridgeFastResponse {
  [key: string]: any;
}

export interface FastWithdrawResponse {
  [key: string]: any;
}

export interface FastWithdrawInfoResponse {
  [key: string]: any;
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
      return [];
    }
  }

  /**
   * Get bridges by L1 address
   */
  public async getBridgesByL1Address(l1Address: string): Promise<BridgesByL1AddressResponse> {
    const response = await this.client.get<BridgesByL1AddressResponse>('/api/v1/bridges', {
      l1_address: l1Address,
    });
    return response.data;
  }

  /**
   * Check whether the next bridge operation will be fast
   */
  public async isNextBridgeFast(l1Address: string): Promise<IsNextBridgeFastResponse> {
    const response = await this.client.get<IsNextBridgeFastResponse>('/api/v1/bridges/isNextBridgeFast', {
      l1_address: l1Address,
    });
    return response.data;
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
    const response = await this.client.get<DepositHistory>('/api/v1/deposit/history', {
      account_index: accountIndex,
      l1_address: l1Address,
      ...(cursor ? { cursor } : {}),
      ...(filter ? { filter } : {}),
      ...(authorization ? { authorization, auth: authorization } : {}),
    });
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
    const response = await this.client.get<WithdrawHistory>('/api/v1/withdraw/history', {
      account_index: accountIndex,
      l1_address: l1Address,
      ...(cursor ? { cursor } : {}),
      ...(filter ? { filter } : {}),
      ...(authorization ? { authorization, auth: authorization } : {}),
    });
    return response.data;
  }

  /**
   * Submit a fast withdrawal
   */
  public async fastWithdraw(
    txInfo: string,
    toAddress: string,
    options?: { authorization?: string; auth?: string }
  ): Promise<FastWithdrawResponse> {
    const formData = new URLSearchParams();
    formData.append('tx_info', txInfo);
    formData.append('to_address', toAddress);
    if (options?.auth) {
      formData.append('auth', options.auth);
    }

    const response = await this.client.post<FastWithdrawResponse>('/api/v1/fastwithdraw', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(options?.authorization ? { authorization: options.authorization } : {}),
      },
    });
    return response.data;
  }

  /**
   * Get fast withdrawal info for account
   */
  public async getFastWithdrawInfo(
    accountIndex: number,
    options?: { authorization?: string; auth?: string }
  ): Promise<FastWithdrawInfoResponse> {
    const response = await this.client.get<FastWithdrawInfoResponse>('/api/v1/fastwithdraw/info', {
      account_index: accountIndex,
      ...(options?.authorization ? { authorization: options.authorization } : {}),
      ...(options?.auth ? { auth: options.auth } : {}),
    });
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
