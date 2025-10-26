import { ApiClient } from './api-client';
import { ApiResponse } from '../types';

export interface ResultCode {
  code: number;
  message?: string;
}

export class NotificationApi {
  private client: ApiClient;

  constructor(apiClient: ApiClient) {
    this.client = apiClient;
  }

  /**
   * Acknowledge a notification
   * @param notifId - Notification ID
   * @param accountIndex - Account index
   * @param authorization - Authorization token
   * @returns Promise<ResultCode>
   */
  public async acknowledgeNotification(
    notifId: string,
    accountIndex: number,
    authorization?: string
  ): Promise<ResultCode> {
    const params = new URLSearchParams({
      notif_id: notifId,
      account_index: accountIndex.toString()
    });

    const headers: Record<string, string> = {};
    if (authorization) {
      headers['Authorization'] = authorization;
      headers['auth'] = authorization;
    }

    const response = await this.client.post<ResultCode>(`/api/v1/notification/ack?${params}`, {}, headers);
    return response.data;
  }

  /**
   * Acknowledge notification with full response details
   * @param notifId - Notification ID
   * @param accountIndex - Account index
   * @param authorization - Authorization token
   * @returns Promise<ApiResponse<ResultCode>>
   */
  public async acknowledgeNotificationWithResponse(
    notifId: string,
    accountIndex: number,
    authorization?: string
  ): Promise<ApiResponse<ResultCode>> {
    const params = new URLSearchParams({
      notif_id: notifId,
      account_index: accountIndex.toString()
    });

    const headers: Record<string, string> = {};
    if (authorization) {
      headers['Authorization'] = authorization;
      headers['auth'] = authorization;
    }

    return await this.client.post<ResultCode>(`/api/v1/notification/ack?${params}`, {}, headers);
  }
}
