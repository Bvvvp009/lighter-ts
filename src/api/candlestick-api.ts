import { ApiClient } from './api-client';
import { Candlestick, Funding } from '../types';

export interface CandlestickQuery {
  market_id: number;
  resolution: string;
  start_timestamp?: number;
  end_timestamp?: number;
  count_back?: number;
}

export interface FundingQuery {
  market_id: number;
  resolution: string;
  start_timestamp?: number;
  end_timestamp?: number;
  count_back?: number;
}

export class CandlestickApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async getCandlesticks(query: CandlestickQuery): Promise<{ candlesticks: Candlestick[] }> {
    const response = await this.client.get(`/candlesticks`, { params: query });
    return response.data;
  }

  async getFundings(query: FundingQuery): Promise<{ fundings: Funding[] }> {
    const response = await this.client.get(`/fundings`, { params: query });
    return response.data;
  }
} 