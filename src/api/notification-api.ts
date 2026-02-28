import { ApiClient } from './api-client';
import { ApiResponse } from '../types';

export interface ResultCode {
  code: number;
  message?: string;
}

export interface PushNotifSettingsResponse {
  [key: string]: any;
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

  public async getPushNotifSettings(
    accountIndex: number,
    expoToken: string,
    options?: { authorization?: string; auth?: string }
  ): Promise<PushNotifSettingsResponse> {
    const response = await this.client.get<PushNotifSettingsResponse>(
      '/api/v1/pushnotif/settings',
      {
        account_index: accountIndex,
        expo_token: expoToken,
        ...(options?.auth ? { auth: options.auth } : {}),
        ...(options?.authorization ? { authorization: options.authorization } : {}),
      },
      options?.authorization ? { headers: { authorization: options.authorization } } : undefined
    );
    return response.data;
  }

  public async updatePushNotifSettings(params: {
    accountIndex: number;
    expoToken: string;
    enabled: boolean;
    auth?: string;
    authorization?: string;
  }): Promise<ResultCode> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.accountIndex.toString());
    formData.append('expo_token', params.expoToken);
    formData.append('enabled', params.enabled ? 'true' : 'false');
    if (params.auth) {
      formData.append('auth', params.auth);
    }

    const response = await this.client.post<ResultCode>('/api/v1/pushnotif/settings', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async registerPushNotif(params: {
    accountIndex: number;
    expoToken: string;
    platform: string;
    appVersion?: string;
    auth?: string;
    authorization?: string;
  }): Promise<ResultCode> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.accountIndex.toString());
    formData.append('expo_token', params.expoToken);
    formData.append('platform', params.platform);
    if (params.appVersion) {
      formData.append('app_version', params.appVersion);
    }
    if (params.auth) {
      formData.append('auth', params.auth);
    }

    const response = await this.client.post<ResultCode>('/api/v1/pushnotif/register', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async unregisterPushNotif(params: {
    accountIndex: number;
    expoToken: string;
    auth?: string;
    authorization?: string;
  }): Promise<ResultCode> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.accountIndex.toString());
    formData.append('expo_token', params.expoToken);
    if (params.auth) {
      formData.append('auth', params.auth);
    }

    const response = await this.client.post<ResultCode>('/api/v1/pushnotif/unregister', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }
}
