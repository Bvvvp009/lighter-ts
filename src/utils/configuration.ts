import { Configuration } from '../types';

export class Config {
  private static instance: Config;
  private config: Configuration;

  constructor(config: Partial<Configuration>) {
    this.config = {
      host: 'https://mainnet.zklighter.elliot.ai',
      timeout: 30000,
      userAgent: 'Lighter-TypeScript-SDK/1.0.0',
      ...config,
    };
  }

  public static getDefault(): Config {
    if (!Config.instance) {
      Config.instance = new Config({});
    }
    return Config.instance;
  }

  public static setDefault(config: Partial<Configuration>): Config {
    Config.instance = new Config(config);
    return Config.instance;
  }

  public getHost(): string {
    return this.config.host;
  }

  public getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  public getSecretKey(): string | undefined {
    return this.config.secretKey;
  }

  public getTimeout(): number {
    return this.config.timeout || 30000;
  }

  public getUserAgent(): string {
    return this.config.userAgent || 'Lighter-TypeScript-SDK/1.0.0';
  }

  public setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  public setSecretKey(secretKey: string): void {
    this.config.secretKey = secretKey;
  }

  public setHost(host: string): void {
    this.config.host = host;
  }

  public setTimeout(timeout: number): void {
    this.config.timeout = timeout;
  }

  public toJSON(): Configuration {
    return { ...this.config };
  }
}