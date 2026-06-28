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

export interface UserReferrals {
  [key: string]: any;
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

    const response = await this.client.get<ReferralPoints>(`/api/v1/referral/points?${params}`, undefined, { headers });
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

    return await this.client.get<ReferralPoints>(`/api/v1/referral/points?${params}`, undefined, { headers });
  }

  public async getUserReferrals(params: {
    l1Address: string;
    cursor?: string;
    auth?: string;
    authorization?: string;
  }): Promise<UserReferrals> {
    const response = await this.client.get<UserReferrals>(
      '/api/v1/referral/userReferrals',
      {
        l1_address: params.l1Address,
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.auth ? { auth: params.auth } : {}),
      },
      params.authorization ? { headers: { authorization: params.authorization } } : undefined
    );
    return response.data;
  }

  public async referralCreate(params: {
    account_index: number;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    if (params.auth) {
      formData.append('auth', params.auth);
    }
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/referral/create', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async referralGet(params: {
    account_index: number;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const response = await this.client.get<{ [key: string]: any }>('/api/v1/referral/get', {
      account_index: params.account_index,
    }, params.authorization ? { headers: { authorization: params.authorization } } : undefined);
    return response.data;
  }

  public async referralKickbackUpdate(params: {
    account_index: number;
    kickback_rate: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    formData.append('kickback_rate', params.kickback_rate);
    if (params.auth) {
      formData.append('auth', params.auth);
    }
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/referral/kickbackUpdate', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async referralUpdate(params: {
    account_index: number;
    code?: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    if (params.code) {
      formData.append('code', params.code);
    }
    if (params.auth) {
      formData.append('auth', params.auth);
    }
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/referral/update', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async referralUse(params: {
    account_index: number;
    code: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    formData.append('code', params.code);
    if (params.auth) {
      formData.append('auth', params.auth);
    }
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/referral/use', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }
}
