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
    const response = await this.client.get('/api/v1/candlesticks', { params: query });
    return response.data;
  }

  async getCandles(query: CandlestickQuery): Promise<{ candlesticks: Candlestick[] }> {
    return this.getCandlesticks(query);
  }

  async getFundings(query: FundingQuery): Promise<{ fundings: Funding[] }> {
    const response = await this.client.get('/api/v1/fundings', { params: query });
    return response.data;
  }
} 