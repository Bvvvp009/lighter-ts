import { ApiClient } from './api-client';
import { RootInfo } from '../types';

export interface SystemStatus {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  version: string;
  [key: string]: any;
}

export class RootApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async getInfo(): Promise<RootInfo> {
    const response = await this.client.get(`/info`);
    return response.data;
  }

  async getStatus(): Promise<SystemStatus> {
    const response = await this.client.get<SystemStatus>(`/status`);
    return response.data;
  }
} 