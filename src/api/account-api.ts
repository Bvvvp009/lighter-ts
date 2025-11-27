import { ApiClient } from './api-client';
import { AccountParams, PaginationParams } from '../types';

export interface SubAccount {
  index: string;
  l1_address: string;
  l2_address: string;
}

export interface Account {
  index: string;
  l1_address: string;
  l2_address: string;
  nonce: string;
  balance: string;
  margin_balance: string;
  free_margin: string;
  margin_used: string;
  margin_ratio: string;
  sub_accounts?: SubAccount[];  // List of subaccounts under this master account
  positions: AccountPosition[];
  orders: Order[];
  trades: Trade[];
}

export interface AccountPosition {
  market_id: number;
  side: 'long' | 'short';
  size: string;
  entry_price: string;
  mark_price: string;
  unrealized_pnl: string;
  realized_pnl: string;
  margin_used: string;
}

export interface Order {
  id: string;
  market_id: number;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  size: string;
  price: string;
  filled_size: string;
  remaining_size: string;
  status: 'open' | 'filled' | 'cancelled' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  market_id: number;
  side: 'buy' | 'sell';
  size: string;
  price: string;
  fee: string;
  timestamp: string;
}

export interface AccountApiKeys {
  api_keys: ApiKey[];
}

export interface ApiKey {
  index: number;
  name: string;
  permissions: string[];
  created_at: string;
  last_used_at?: string;
}

export interface PublicPool {
  id: string;
  name: string;
  description: string;
  total_value_locked: string;
  apy: string;
  shares: PublicPoolShare[];
}

export interface PublicPoolShare {
  token: string;
  amount: string;
  value: string;
}

export interface FeeBucket {
  account_index: number;
  fee_bucket: string;
  fee_bucket_tier?: string;
  [key: string]: any; // Allow for additional fields
}

export interface PnLEntry {
  account_index: number;
  market_id?: number;
  timestamp: number;
  realized_pnl: string;
  unrealized_pnl?: string;
  total_pnl?: string;
  [key: string]: any; // Allow for additional fields
}

export interface PnLResponse {
  entries?: PnLEntry[];
  total_realized_pnl?: string;
  total_unrealized_pnl?: string;
  [key: string]: any; // Allow for additional fields
}

export class AccountApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getAccount(params: AccountParams): Promise<Account> {
    const response = await this.client.get<Account>('/api/v1/account', {
      by: params.by,
      value: params.value,
    });
    return response.data;
  }

  public async getAccounts(params?: PaginationParams): Promise<Account[]> {
    const response = await this.client.get<Account[]>('/api/v1/accounts', params);
    return response.data;
  }

  public async getAccountsByL1Address(l1Address: string): Promise<Account[]> {
    const response = await this.client.get<Account[]>('/api/v1/accountsByL1Address', {
      l1_address: l1Address,
    });
    return response.data;
  }

  public async getApiKeys(accountIndex: number, apiKeyIndex: number): Promise<AccountApiKeys> {
    const response = await this.client.get<AccountApiKeys>('/api/v1/apikeys', {
      account_index: accountIndex,
      api_key_index: apiKeyIndex,
    });
    return response.data;
  }

  public async getFeeBucket(accountIndex: number): Promise<FeeBucket> {
    const response = await this.client.get<FeeBucket>('/api/v1/feeBucket', {
      account_index: accountIndex,
    });
    return response.data;
  }

  public async isWhitelisted(accountIndex: number): Promise<{ is_whitelisted: boolean }> {
    const response = await this.client.get<{ is_whitelisted: boolean }>('/api/v1/isWhitelisted', {
      account_index: accountIndex,
    });
    return response.data;
  }

  public async getPnL(accountIndex: number, params?: { start_time?: number; end_time?: number }): Promise<PnLResponse> {
    const response = await this.client.get<PnLResponse>('/api/v1/pnl', {
      account_index: accountIndex,
      ...params,
    });
    return response.data;
  }

  public async getPublicPools(filter: string = 'all', limit: number = 10, index: number = 0): Promise<PublicPool[]> {
    const response = await this.client.get<PublicPool[]>('/api/v1/publicPools', {
      filter,
      limit,
      index,
    });
    return response.data;
  }

  public async changeAccountTier(accountIndex: number, newTier: string, auth: string): Promise<any> {
    // Use form data as the API expects multipart/form-data
    const params = new URLSearchParams();
    params.append('account_index', accountIndex.toString());
    params.append('new_tier', newTier);
    params.append('auth', auth);

    const response = await this.client.post('/api/v1/changeAccountTier', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  }
}