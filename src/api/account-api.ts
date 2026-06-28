import { ApiClient } from './api-client';
import { AccountParams, PaginationParams } from '../types';

export interface SubAccount {
  index: string;
  l1_address: string;
  l2_address: string;
}

export interface AccountAsset {
  symbol: string;
  asset_id: number;
  balance: string;
  locked_balance: string;
}

export interface Account {
  index: number;
  account_index: number;
  l1_address: string;
  status: number;
  account_trading_mode: number;
  available_balance: string;
  collateral: string;
  total_asset_value: string;
  cross_asset_value: string;
  cross_initial_margin_requirement: string;
  cross_maintenance_margin_requirement: string;
  total_order_count?: number;
  total_isolated_order_count?: number;
  pending_order_count?: number;
  transaction_time?: number;
  sub_accounts?: SubAccount[];  // List of subaccounts under this master account
  positions: AccountPosition[];
  assets?: AccountAsset[]; // Assets array with balance and locked_balance
  shares?: any[];
}

export interface AccountPosition {
  market_id: number;
  symbol: string;
  sign: number; // 1 = long, -1 = short
  position: string; // position size (base units)
  avg_entry_price: string;
  position_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  liquidation_price: string;
  total_funding_paid_out?: string;
  margin_mode: number;
  allocated_margin: string;
  initial_margin_fraction?: string;
  open_order_count?: number;
  pending_order_count?: number;
  position_tied_order_count?: number;
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

export interface AccountLimits {
  account_index: number;
  max_open_orders: number;
  max_position_size: string;
  max_leverage: number;
  [key: string]: any;
}

export interface AccountMetadata {
  account_index: number;
  name?: string;
  description?: string;
  created_at: string;
  last_updated: string;
  [key: string]: any;
}

export interface Liquidation {
  id: string;
  account_index: number;
  market_id: number;
  side: 'long' | 'short';
  size: string;
  price: string;
  timestamp: string;
  [key: string]: any;
}

export interface LiquidationResponse {
  liquidations: Liquidation[];
  total: number;
  limit: number;
  cursor?: string;
}

export interface PositionFunding {
  account_index: number;
  market_id: number;
  side: 'long' | 'short';
  funding_rate: string;
  funding_amount: string;
  timestamp: string;
  [key: string]: any;
}

export interface PositionFundingResponse {
  fundings: PositionFunding[];
  total: number;
  limit: number;
  cursor?: string;
}

export interface L1Metadata {
  [key: string]: any;
}

export interface PublicPoolsMetadataResponse {
  [key: string]: any;
}

export interface ApiTokensResponse {
  [key: string]: any;
}

export interface CreateApiTokenParams {
  name: string;
  accountIndex: number;
  expiry: number;
  subAccountAccess: boolean;
  scopes?: string;
  authorization?: string;
}

export interface CreateApiTokenResponse {
  [key: string]: any;
}

export interface RevokeApiTokenResponse {
  [key: string]: any;
}

export class AccountApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getAccount(params: AccountParams, auth?: string): Promise<Account> {
    const response = await this.client.get<Account & { accounts?: Account[] }>('/api/v1/account', {
      by: params.by,
      value: params.value,
    }, auth ? { headers: { 'X-Auth-Token': auth } } : undefined);
    const data = response.data;
    return Array.isArray(data.accounts) ? data.accounts[0] : data;
  }

  public async getAccounts(params?: PaginationParams): Promise<Account[]> {
    const response = await this.client.get<Account[]>('/api/v1/accounts', params);
    return response.data;
  }

  public async getAccountsByL1Address(l1Address: string): Promise<Account[]> {
    const response = await this.client.get<{ sub_accounts?: Account[] } | Account[]>('/api/v1/accountsByL1Address', {
      l1_address: l1Address,
    });
    const data = response.data;
    return Array.isArray(data) ? data : (data.sub_accounts || []);
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

  public async getAccountLimits(accountIndex: number, auth?: string): Promise<AccountLimits> {
    const response = await this.client.get<AccountLimits>('/api/v1/accountLimits', {
      account_index: accountIndex,
      ...(auth ? { authorization: auth, auth } : {}),
    });
    return response.data;
  }

  public async getAccountMetadata(accountIndex: number, auth?: string): Promise<AccountMetadata> {
    const response = await this.client.get<AccountMetadata>('/api/v1/accountMetadata', {
      by: 'index',
      value: accountIndex.toString(),
      ...(auth ? { auth } : {}),
    }, auth ? { headers: { authorization: auth } } : undefined);
    return response.data;
  }

  public async getAccountMetadataBy(
    by: 'index' | 'l1_address',
    value: string,
    options?: { authorization?: string; auth?: string }
  ): Promise<AccountMetadata> {
    const response = await this.client.get<AccountMetadata>('/api/v1/accountMetadata', {
      by,
      value,
      ...(options?.auth ? { auth: options.auth } : {}),
    }, options?.authorization ? { headers: { authorization: options.authorization } } : undefined);
    return response.data;
  }

  public async faucet(accountIndex: number): Promise<{ tx_hash: string; status: string }> {
    const response = await this.client.post<{ tx_hash: string; status: string }>('/api/v1/faucet', {
      account_index: accountIndex,
    });
    return response.data;
  }

  public async getLiquidations(
    accountIndex: number,
    params?: { limit?: number; cursor?: string; market_id?: number },
    auth?: string
  ): Promise<LiquidationResponse> {
    const response = await this.client.get<LiquidationResponse>('/api/v1/liquidations', {
      account_index: accountIndex,
      ...params,
      ...(auth ? { authorization: auth, auth } : {}),
    });
    return response.data;
  }

  public async getPositionFundings(
    accountIndex: number,
    params?: { limit?: number; cursor?: string; market_id?: number; side?: 'long' | 'short' },
    auth?: string
  ): Promise<PositionFundingResponse> {
    const response = await this.client.get<PositionFundingResponse>('/api/v1/positionFundings', {
      account_index: accountIndex,
      ...params,
      ...(auth ? { authorization: auth, auth } : {}),
    });
    return response.data;
  }

  public async getL1Metadata(
    l1Address: string,
    options?: { authorization?: string; auth?: string }
  ): Promise<L1Metadata> {
    const response = await this.client.get<L1Metadata>(
      '/api/v1/l1Metadata',
      {
        l1_address: l1Address,
        ...(options?.auth ? { auth: options.auth } : {}),
      },
      options?.authorization ? { headers: { authorization: options.authorization } } : undefined
    );
    return response.data;
  }

  public async getPublicPoolsMetadata(
    index: number,
    limit: number,
    params?: { filter?: string; account_index?: number; authorization?: string; auth?: string }
  ): Promise<PublicPoolsMetadataResponse> {
    const response = await this.client.get<PublicPoolsMetadataResponse>('/api/v1/publicPoolsMetadata', {
      index,
      limit,
      ...(params?.filter !== undefined ? { filter: params.filter } : {}),
      ...(params?.account_index !== undefined ? { account_index: params.account_index } : {}),
      ...(params?.authorization !== undefined ? { authorization: params.authorization } : {}),
      ...(params?.auth !== undefined ? { auth: params.auth } : {}),
    });
    return response.data;
  }

  public async getApiTokens(accountIndex: number, authorization?: string): Promise<ApiTokensResponse> {
    const response = await this.client.get<ApiTokensResponse>(
      '/api/v1/tokens',
      { account_index: accountIndex },
      authorization ? { headers: { authorization } } : undefined
    );
    return response.data;
  }

  public async createApiToken(params: CreateApiTokenParams): Promise<CreateApiTokenResponse> {
    const formData = new URLSearchParams();
    formData.append('name', params.name);
    formData.append('account_index', params.accountIndex.toString());
    formData.append('expiry', params.expiry.toString());
    formData.append('sub_account_access', params.subAccountAccess ? 'true' : 'false');
    if (params.scopes !== undefined) {
      formData.append('scopes', params.scopes);
    }

    const response = await this.client.post<CreateApiTokenResponse>('/api/v1/tokens/create', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async revokeApiToken(
    tokenId: number,
    accountIndex: number,
    authorization?: string
  ): Promise<RevokeApiTokenResponse> {
    const formData = new URLSearchParams();
    formData.append('token_id', tokenId.toString());
    formData.append('account_index', accountIndex.toString());

    const response = await this.client.post<RevokeApiTokenResponse>('/api/v1/tokens/revoke', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(authorization ? { authorization } : {}),
      },
    });
    return response.data;
  }

  public async getLeaseOptions(params?: {
    account_index?: number;
    market_id?: number;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const response = await this.client.get<{ [key: string]: any }>('/api/v1/leaseOptions', {
      ...(params?.account_index !== undefined ? { account_index: params.account_index } : {}),
      ...(params?.market_id !== undefined ? { market_id: params.market_id } : {}),
      ...(params?.auth !== undefined ? { auth: params.auth } : {}),
      ...(params?.authorization !== undefined ? { authorization: params.authorization } : {}),
    }, params?.authorization ? { headers: { authorization: params.authorization } } : undefined);
    return response.data;
  }

  public async getLeases(params?: {
    account_index?: number;
    market_id?: number;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const response = await this.client.get<{ [key: string]: any }>('/api/v1/leases', {
      ...(params?.account_index !== undefined ? { account_index: params.account_index } : {}),
      ...(params?.market_id !== undefined ? { market_id: params.market_id } : {}),
      ...(params?.auth !== undefined ? { auth: params.auth } : {}),
      ...(params?.authorization !== undefined ? { authorization: params.authorization } : {}),
    }, params?.authorization ? { headers: { authorization: params.authorization } } : undefined);
    return response.data;
  }

  public async litLease(params: {
    lease_id: number;
    account_index?: number;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('lease_id', params.lease_id.toString());
    if (params.account_index !== undefined) {
      formData.append('account_index', params.account_index.toString());
    }
    if (params.auth !== undefined) {
      formData.append('auth', params.auth);
    }

    const response = await this.client.post<{ [key: string]: any }>('/api/v1/litLease', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async getPartnerStats(accountIndex: number, auth?: string): Promise<{ [key: string]: any }> {
    const response = await this.client.get<{ [key: string]: any }>('/api/v1/partnerStats', {
      account_index: accountIndex,
    }, auth ? { headers: { authorization: auth } } : undefined);
    return response.data;
  }

  public async getMakerOnlyApiKeys(accountIndex: number, auth?: string): Promise<{ [key: string]: any }> {
    const response = await this.client.get<{ [key: string]: any }>('/api/v1/makerOnlyApiKeys', {
      account_index: accountIndex,
    }, auth ? { headers: { authorization: auth } } : undefined);
    return response.data;
  }

  public async setMakerOnlyApiKeys(params: {
    account_index: number;
    api_key_indices: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    formData.append('api_key_indices', params.api_key_indices);
    if (params.auth) {
      formData.append('auth', params.auth);
    }
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/setMakerOnlyApiKeys', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async rfqCreate(params: {
    account_index: number;
    market_id: number;
    side: string;
    size: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (params.authorization) {
      headers['authorization'] = params.authorization;
    } else if (params.auth) {
      headers['authorization'] = params.auth;
    }
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    formData.append('market_id', params.market_id.toString());
    formData.append('side', params.side);
    formData.append('size', params.size);
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/rfq/create', formData, {
      headers,
    });
    return response.data;
  }

  public async rfqGet(params: {
    account_index: number;
    rfq_id: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const response = await this.client.get<{ [key: string]: any }>('/api/v1/rfq/get', {
      account_index: params.account_index,
      rfq_id: params.rfq_id,
    }, params.authorization ? { headers: { authorization: params.authorization } } : undefined);
    return response.data;
  }

  public async rfqList(params: {
    account_index: number;
    limit?: number;
    cursor?: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const headers: Record<string, string> = {};
    if (params.authorization) {
      headers['authorization'] = params.authorization;
    } else if (params.auth) {
      headers['authorization'] = params.auth;
    }
    const response = await this.client.get<{ [key: string]: any }>('/api/v1/rfq/list', {
      account_index: params.account_index,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
    }, Object.keys(headers).length > 0 ? { headers } : undefined);
    return response.data;
  }

  public async rfqRespond(params: {
    account_index: number;
    rfq_id: string;
    price: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    formData.append('rfq_id', params.rfq_id);
    formData.append('price', params.price);
    if (params.auth) {
      formData.append('auth', params.auth);
    }
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/rfq/respond', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }

  public async rfqUpdate(params: {
    account_index: number;
    rfq_id: string;
    status?: string;
    auth?: string;
    authorization?: string;
  }): Promise<{ [key: string]: any }> {
    const formData = new URLSearchParams();
    formData.append('account_index', params.account_index.toString());
    formData.append('rfq_id', params.rfq_id);
    if (params.status) {
      formData.append('status', params.status);
    }
    if (params.auth) {
      formData.append('auth', params.auth);
    }
    const response = await this.client.post<{ [key: string]: any }>('/api/v1/rfq/update', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(params.authorization ? { authorization: params.authorization } : {}),
      },
    });
    return response.data;
  }
}