import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiResponse, Configuration } from '../types';
import {
  ApiException,
  BadRequestException,
  NotFoundException,
  TooManyRequestsException,
  ServiceException,
} from '../utils/exceptions';

/**
 * Configuration for ExplorerApiClient
 */
export interface ExplorerConfiguration extends Configuration {
  explorerHost?: string;
}

/**
 * ExplorerApiClient handles requests to the Lighter Explorer API
 * Base URL: https://explorer.elliot.ai/api/
 */
export class ExplorerApiClient {
  private axiosInstance: AxiosInstance;
  private explorerHost: string = 'https://explorer.elliot.ai/api';
  private defaultHeaders: Record<string, string> = {};

  static resolveExplorerHost(baseUrl?: string): string {
    if (!baseUrl) {
      return 'https://explorer.elliot.ai/api';
    }

    const normalized = baseUrl.toLowerCase();
    if (normalized.includes('testnet')) {
      return 'https://testnet.explorer.elliot.ai/api';
    }

    return 'https://explorer.elliot.ai/api';
  }

  constructor(config?: Partial<ExplorerConfiguration>) {
    if (config?.explorerHost) {
      this.explorerHost = config.explorerHost;
    }

    const axiosConfig: any = {
      baseURL: this.explorerHost,
      timeout: 10000,
      headers: {
        'User-Agent': 'lighter-ts-sdk/1.0',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    this.axiosInstance = axios.create(axiosConfig);
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: any): ApiException {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.message || error.message || 'Explorer API Error';

      if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
        console.error('❌ Explorer API Error:');
        console.error('   Status:', status);
        console.error('   Message:', message);
        console.error('   Data:', JSON.stringify(data, null, 2));
      }

      switch (status) {
        case 400:
          return new BadRequestException(message);
        case 404:
          return new NotFoundException(message);
        case 429:
          return new TooManyRequestsException(message);
        case 500:
        case 502:
        case 503:
        case 504:
          return new ServiceException(message);
        default:
          return new ApiException(message, status);
      }
    }

    if (error.request) {
      if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
        console.error('❌ Explorer Network Error: No response received');
      }
      return new ApiException('Explorer Network error: No response received', 0);
    }

    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.error('❌ Explorer Unknown Error:', error);
    }
    return new ApiException(error.message || 'Unknown error', 0);
  }

  public setDefaultHeader(name: string, value: string): void {
    this.defaultHeaders[name] = value;
    this.axiosInstance.defaults.headers[name] = value;
  }

  public removeDefaultHeader(name: string): void {
    delete this.defaultHeaders[name];
    delete this.axiosInstance.defaults.headers[name];
  }

  public async request<T = any>(
    method: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.request({
        method,
        url,
        data,
        ...config,
      });

      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      throw error;
    }
  }

  public async get<T = any>(
    url: string,
    params?: Record<string, any>,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', url, undefined, { params, ...config });
  }

  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', url, data, config);
  }

  public async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', url, data, config);
  }

  public async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', url, undefined, config);
  }

  public setExplorerHost(host: string): void {
    this.explorerHost = host;
    this.axiosInstance.defaults.baseURL = host;
  }

  public getExplorerHost(): string {
    return this.explorerHost;
  }

  public close(): void {
    // Cleanup if needed
  }
}
