import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Config } from '../utils/configuration';
import { ApiResponse, Configuration } from '../types';
import {
  ApiException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  TooManyRequestsException,
  ServiceException,
} from '../utils/exceptions';

export class ApiClient {
  private config: Config;
  private axiosInstance: AxiosInstance;
  private defaultHeaders: Record<string, string> = {};

  constructor(config?: Partial<Configuration>) {
    this.config = config ? Config.setDefault(config) : Config.getDefault();
    this.axiosInstance = axios.create({
      baseURL: this.config.getHost(),
      timeout: this.config.getTimeout(),
      headers: {
        'User-Agent': this.config.getUserAgent(),
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add authentication headers if available
        if (this.config.getApiKey()) {
          config.headers['X-API-Key'] = this.config.getApiKey();
        }
        if (this.config.getSecretKey()) {
          config.headers['X-Secret-Key'] = this.config.getSecretKey();
        }

        // Add custom headers
        Object.assign(config.headers, this.defaultHeaders);

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
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
      const message = data?.message || error.message || 'API Error';
      const code = data?.code;

      switch (status) {
        case 400:
          return new BadRequestException(message, code);
        case 401:
          return new UnauthorizedException(message, code);
        case 403:
          return new ForbiddenException(message, code);
        case 404:
          return new NotFoundException(message, code);
        case 429:
          return new TooManyRequestsException(message, code);
        case 500:
        case 502:
        case 503:
        case 504:
          return new ServiceException(message, code);
        default:
          return new ApiException(message, status, code);
      }
    }

    if (error.request) {
      return new ApiException('Network error: No response received', 0);
    }

    return new ApiException(error.message || 'Unknown error', 0);
  }

  public setDefaultHeader(name: string, value: string): void {
    this.defaultHeaders[name] = value;
  }

  public removeDefaultHeader(name: string): void {
    delete this.defaultHeaders[name];
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

  public async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', url, data, config);
  }

  public getConfig(): Config {
    return this.config;
  }

  public setConfig(config: Partial<Configuration>): void {
    this.config = Config.setDefault(config);
  }

  public close(): void {
    // Cleanup if needed
  }
}