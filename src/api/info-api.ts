import { ApiClient } from './api-client';
import { ApiResponse } from '../types';

export interface TransferFeeInfo {
  transfer_fee?: number;
  transfer_fee_percentage?: string;
  from_account_index?: number;
  to_account_index?: number;
  code?: number;
  message?: string;
  [key: string]: any;
}

export interface WithdrawalDelayInfo {
  seconds: number; // API returns 'seconds' not 'withdrawal_delay'
  withdrawal_delay?: number; // Keep for backwards compatibility
  code?: number;
  message?: string;
  [key: string]: any;
}

export interface SystemConfigInfo {
  [key: string]: any;
}

export class InfoApi {
  private client: ApiClient;

  constructor(apiClient: ApiClient) {
    this.client = apiClient;
  }

  /**
   * Get transfer fee information for an account
   * @param accountIndex - Account index (required)
   * @param toAccountIndex - Destination account index (optional)
   * @param auth - Authorization token (optional)
   * @returns Promise<TransferFeeInfo>
   */
  public async getTransferFeeInfo(
    accountIndex: number,
    toAccountIndex?: number,
    auth?: string
  ): Promise<TransferFeeInfo> {
    const params: any = {
      account_index: accountIndex,
    };
    if (toAccountIndex !== undefined) {
      params.to_account_index = toAccountIndex;
    }

    const headers: Record<string, string> = {};
    if (auth) {
      headers['Authorization'] = auth;
      headers['auth'] = auth;
    }

    const response = await this.client.get<TransferFeeInfo>('/api/v1/transferFeeInfo', params, headers);
    return response.data;
  }

  /**
   * Get withdrawal delay in seconds
   * @returns Promise<WithdrawalDelayInfo>
   */
  public async getWithdrawalDelay(): Promise<WithdrawalDelayInfo> {
    const response = await this.client.get<WithdrawalDelayInfo>('/api/v1/withdrawalDelay');
    const data = response.data;
    if (data.seconds !== undefined && data.withdrawal_delay === undefined) {
      data.withdrawal_delay = data.seconds;
    }
    return data;
  }

  /**
   * Get system configuration
   * @param auth Authorization token (optional)
   */
  public async getSystemConfig(auth?: string): Promise<SystemConfigInfo> {
    const response = await this.client.get<SystemConfigInfo>(
      '/api/v1/systemConfig',
      auth ? { auth } : undefined,
      auth ? { headers: { authorization: auth } } : undefined
    );
    return response.data;
  }
}
