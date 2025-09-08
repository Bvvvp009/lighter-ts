import { ApiClient } from './api-client';
import { Block } from '../types';

export interface BlockQuery {
  by: 'height' | 'hash';
  value: string;
}

export interface BlocksQuery {
  index?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

export interface CurrentHeightResponse {
  height: number;
}

export class BlockApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async getBlock(query: BlockQuery): Promise<Block> {
    const response = await this.client.get(`/block`, { params: query });
    return response.data;
  }

  async getBlocks(query: BlocksQuery = {}): Promise<{ blocks: Block[] }> {
    const response = await this.client.get(`/blocks`, { params: query });
    return response.data;
  }

  async getCurrentHeight(): Promise<CurrentHeightResponse> {
    const response = await this.client.get(`/block/current-height`);
    return response.data;
  }
} 