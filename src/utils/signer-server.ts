export interface SignerServerConfig {
  url: string;
  timeout?: number;
}

export interface SignerServerResponse<T> {
  data?: T;
  error?: string;
}

export class SignerServerClient {
  private config: SignerServerConfig;

  constructor(config: SignerServerConfig) {
    this.config = {
      timeout: 10000,
      ...config,
    };
  }

  async signTransaction(privateKey: string, transaction: any): Promise<string> {
    const response = await this.makeRequest<{ signature: string }>('/sign', {
      private_key: privateKey,
      message: transaction,
    });

    if (response.error) {
      throw new Error(`Signer server error: ${response.error}`);
    }

    return response.data?.signature || '';
  }

  async getPublicKey(privateKey: string): Promise<string> {
    const response = await this.makeRequest<{ public_key: string }>('/pubkey', {
      private_key: privateKey,
    });

    if (response.error) {
      throw new Error(`Signer server error: ${response.error}`);
    }

    return response.data?.public_key || '';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.url}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeout || 10000),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.status === 'ok';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    body: any
  ): Promise<SignerServerResponse<T>> {
    try {
      const response = await fetch(`${this.config.url}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout || 10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Factory function to create a signer server client
export function createSignerServerClient(config: SignerServerConfig): SignerServerClient {
  return new SignerServerClient(config);
} 