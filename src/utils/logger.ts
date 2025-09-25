// Logger utility based on Python SDK patterns
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any> | undefined;
  error?: Error | undefined;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  public warning(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARNING, message, context);
  }

  public error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, { ...context, error });
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: context?.['error']
    };

    this.logs.push(entry);

    // Console output based on Python SDK patterns
    const contextStr = context ? ` ${JSON.stringify(context, null, 2)}` : '';
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`[DEBUG] ${message}${contextStr}`);
        break;
      case LogLevel.INFO:
        console.log(`[INFO] ${message}${contextStr}`);
        break;
      case LogLevel.WARNING:
        console.warn(`[WARNING] ${message}${contextStr}`);
        break;
      case LogLevel.ERROR:
        console.error(`[ERROR] ${message}${contextStr}`);
        if (context?.['error']) {
          console.error('Stack trace:', context['error'].stack);
        }
        break;
    }
  }


  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  // Python SDK style logging methods
  public logApiCall(method: string, url: string, params?: any): void {
    this.debug(`API Call: ${method} ${url}`, { params });
  }

  public logApiResponse(method: string, url: string, status: number, responseTime: number): void {
    this.debug(`API Response: ${method} ${url} - ${status} (${responseTime}ms)`);
  }

  public logTransaction(txType: string, txInfo: any): void {
    this.debug(`Transaction: ${txType}`, { txInfo });
  }

  public logNonce(apiKeyIndex: number, nonce: number): void {
    this.debug(`Nonce: API Key ${apiKeyIndex}, Nonce ${nonce}`);
  }

  public logSignerError(operation: string, error: Error): void {
    this.error(`Signer Error: ${operation}`, error);
  }
}

// Global logger instance
export const logger = Logger.getInstance();
