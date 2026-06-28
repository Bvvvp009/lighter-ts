import { ApiClient } from './api-client';

export interface TokenInfo {
  symbol: string;
  asset_id: number;
  decimals: number;
  address?: string;
  [key: string]: any;
}

export interface TokenList {
  tokens: TokenInfo[];
  [key: string]: any;
}

export class TokenlistApi {
  private client: ApiClient;

  constructor(apiClient: ApiClient) {
    this.client = apiClient;
  }

  public async getTokenlist(): Promise<TokenList> {
    const response = await this.client.get<TokenList>('/api/v1/tokenlist');
    return response.data;
  }
}