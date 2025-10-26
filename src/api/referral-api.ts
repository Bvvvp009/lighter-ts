import { ApiClient } from './api-client';
import { ApiResponse } from '../types';

export interface ReferralPointEntry {
  l1_address: string;
  total_points: number;
  week_points: number;
  total_reward_points: number;
  week_reward_points: number;
  reward_point_multiplier: string;
}

export interface ReferralPoints {
  referrals: ReferralPointEntry[];
  user_total_points: number;
  user_last_week_points: number;
  user_total_referral_reward_points: number;
  user_last_week_referral_reward_points: number;
  reward_point_multiplier: string;
}

export class ReferralApi {
  private client: ApiClient;

  constructor(apiClient: ApiClient) {
    this.client = apiClient;
  }

  /**
   * Get referral points for an account
   * @param accountIndex - Account index
   * @param authorization - Authorization token
   * @returns Promise<ReferralPoints>
   */
  public async getReferralPoints(
    accountIndex: number,
    authorization?: string
  ): Promise<ReferralPoints> {
    const params = new URLSearchParams({
      account_index: accountIndex.toString()
    });

    const headers: Record<string, string> = {};
    if (authorization) {
      headers['Authorization'] = authorization;
      headers['auth'] = authorization;
    }

    const response = await this.client.get<ReferralPoints>(`/api/v1/referral/points?${params}`, headers);
    return response.data;
  }

  /**
   * Get referral points with full response details
   * @param accountIndex - Account index
   * @param authorization - Authorization token
   * @returns Promise<ApiResponse<ReferralPoints>>
   */
  public async getReferralPointsWithResponse(
    accountIndex: number,
    authorization?: string
  ): Promise<ApiResponse<ReferralPoints>> {
    const params = new URLSearchParams({
      account_index: accountIndex.toString()
    });

    const headers: Record<string, string> = {};
    if (authorization) {
      headers['Authorization'] = authorization;
      headers['auth'] = authorization;
    }

    return await this.client.get<ReferralPoints>(`/api/v1/referral/points?${params}`, headers);
  }
}
