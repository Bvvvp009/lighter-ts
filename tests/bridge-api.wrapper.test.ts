import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BridgeApi } from '../src/api/bridge-api';
import { ApiClient } from '../src/api/api-client';

describe('BridgeApi wrapper wiring', () => {
  let mockClient: { get: jest.Mock; post: jest.Mock };
  let bridgeApi: BridgeApi;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
    };

    bridgeApi = new BridgeApi(mockClient as unknown as ApiClient);
  });

  it('maps getDepositHistory params correctly', async () => {
    mockClient.get.mockResolvedValue({ data: { deposits: [] } });

    await bridgeApi.getDepositHistory(42, '0xabc', 'auth-token', 'cursor-1', 'pending');

    expect(mockClient.get).toHaveBeenCalledWith('/api/v1/deposit/history', {
      account_index: 42,
      l1_address: '0xabc',
      cursor: 'cursor-1',
      filter: 'pending',
      authorization: 'auth-token',
      auth: 'auth-token',
    });
  });

  it('maps getWithdrawHistory params correctly', async () => {
    mockClient.get.mockResolvedValue({ data: { withdraws: [] } });

    await bridgeApi.getWithdrawHistory(42, '0xabc', 'auth-token', 'cursor-2', 'claimable');

    expect(mockClient.get).toHaveBeenCalledWith('/api/v1/withdraw/history', {
      account_index: 42,
      l1_address: '0xabc',
      cursor: 'cursor-2',
      filter: 'claimable',
      authorization: 'auth-token',
      auth: 'auth-token',
    });
  });

  it('maps fastWithdraw request body and headers', async () => {
    mockClient.post.mockResolvedValue({ data: { code: 200 } });

    await bridgeApi.fastWithdraw('signedTxInfo', '0xrecipient', {
      authorization: 'header-auth',
      auth: 'query-auth',
    });

    const call = mockClient.post.mock.calls[0];
    expect(call[0]).toBe('/api/v1/fastwithdraw');
    expect(call[1]).toBeInstanceOf(URLSearchParams);
    expect(call[1].get('tx_info')).toBe('signedTxInfo');
    expect(call[1].get('to_address')).toBe('0xrecipient');
    expect(call[1].get('auth')).toBe('query-auth');
    expect(call[2]).toEqual({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        authorization: 'header-auth',
      },
    });
  });
});
