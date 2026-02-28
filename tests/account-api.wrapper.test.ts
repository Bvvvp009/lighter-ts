import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccountApi } from '../src/api/account-api';
import { ApiClient } from '../src/api/api-client';

describe('AccountApi wrapper wiring', () => {
  let mockClient: { get: jest.Mock; post: jest.Mock };
  let accountApi: AccountApi;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
    };

    accountApi = new AccountApi(mockClient as unknown as ApiClient);
  });

  it('maps getAccountLimits auth to query params', async () => {
    mockClient.get.mockResolvedValue({ data: { account_index: 12 } });

    await accountApi.getAccountLimits(12, 'auth-token');

    expect(mockClient.get).toHaveBeenCalledWith('/api/v1/accountLimits', {
      account_index: 12,
      authorization: 'auth-token',
      auth: 'auth-token',
    });
  });

  it('maps getAccountMetadata to by/value + auth header/query', async () => {
    mockClient.get.mockResolvedValue({ data: { account_index: 12 } });

    await accountApi.getAccountMetadata(12, 'auth-token');

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/accountMetadata',
      {
        by: 'index',
        value: '12',
        auth: 'auth-token',
      },
      { headers: { authorization: 'auth-token' } }
    );
  });

  it('supports metadata lookup by l1_address', async () => {
    mockClient.get.mockResolvedValue({ data: { account_index: 12 } });

    await accountApi.getAccountMetadataBy('l1_address', '0xabc', {
      authorization: 'header-auth',
      auth: 'query-auth',
    });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/accountMetadata',
      {
        by: 'l1_address',
        value: '0xabc',
        auth: 'query-auth',
      },
      { headers: { authorization: 'header-auth' } }
    );
  });

  it('maps getL1Metadata with required l1_address query', async () => {
    mockClient.get.mockResolvedValue({ data: { chain_id: 1 } });

    await accountApi.getL1Metadata('0xabc', { authorization: 'header-auth', auth: 'query-auth' });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/api/v1/l1Metadata',
      {
        l1_address: '0xabc',
        auth: 'query-auth',
      },
      { headers: { authorization: 'header-auth' } }
    );
  });
});
