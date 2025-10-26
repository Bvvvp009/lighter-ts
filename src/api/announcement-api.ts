import { ApiClient } from './api-client';
import { ApiResponse } from '../types';

export interface Announcement {
  title: string;
  content: string;
  created_at: number;
}

export interface Announcements {
  code: number;
  message?: string;
  announcements: Announcement[];
}

export class AnnouncementApi {
  private client: ApiClient;

  constructor(apiClient: ApiClient) {
    this.client = apiClient;
  }

  /**
   * Get platform announcements
   * @returns Promise<Announcements>
   */
  public async getAnnouncements(): Promise<Announcements> {
    const response = await this.client.get<Announcements>('/api/v1/announcement');
    return response.data;
  }

  /**
   * Get announcements with full response details
   * @returns Promise<ApiResponse<Announcements>>
   */
  public async getAnnouncementsWithResponse(): Promise<ApiResponse<Announcements>> {
    return await this.client.get<Announcements>('/api/v1/announcement');
  }
}
