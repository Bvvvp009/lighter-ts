import { ApiClient } from './api-client';
import { ApiResponse } from '../types';

export interface FundingRate {
  market_id: number;
  exchange: 'binance' | 'bybit' | 'hyperliquid' | 'lighter';
  symbol: string;
  rate: number;
}

export interface FundingRates {
  code: number;
  message?: string;
  funding_rates: FundingRate[];
}

export class FundingApi {
  private client: ApiClient;

  constructor(apiClient: ApiClient) {
    this.client = apiClient;
  }

  /**
   * Get funding rates for all markets
   * @returns Promise<FundingRates>
   */
  public async getFundingRates(): Promise<FundingRates> {
    const response = await this.client.get<FundingRates>('/api/v1/funding-rates');
    return response.data;
  }

  /**
   * Get funding rates with full response details
   * @returns Promise<ApiResponse<FundingRates>>
   */
  public async getFundingRatesWithResponse(): Promise<ApiResponse<FundingRates>> {
    return await this.client.get<FundingRates>('/api/v1/funding-rates');
  }
}
