import { ApiClient } from './api-client';
import { RootInfo } from '../types';

export class RootApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async getInfo(): Promise<RootInfo> {
    const response = await this.client.get(`/info`);
    return response.data;
  }
} 