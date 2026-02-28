import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExplorerApiClient } from '../src/api/explorer-api-client';
import { SearchApi } from '../src/api/search-api';
import { LogsApi } from '../src/api/logs-api';

describe('Explorer API wrappers', () => {
  let mockClient: { get: any };
  let searchApi: SearchApi;
  let logsApi: LogsApi;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
    };

    searchApi = new SearchApi(mockClient as unknown as ExplorerApiClient);
    logsApi = new LogsApi(mockClient as unknown as ExplorerApiClient);
  });

  describe('SearchApi', () => {
    it('maps search query to /search endpoint', async () => {
      mockClient.get.mockResolvedValue({ data: [{ type: 'log', log: { status: 'pending' } }] });

      const results = await searchApi.search({ q: '0xabc' });

      expect(mockClient.get).toHaveBeenCalledWith('/search', { q: '0xabc' });
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]?.type).toBe('log');
    });

    it('returns transaction status from log search results', async () => {
      mockClient.get.mockResolvedValue({
        data: [{ type: 'log', log: { status: 'executed', hash: '0xabc' } }],
      });

      const status = await searchApi.getTransactionStatus('0xabc');

      expect(status).toBe('executed');
    });
  });

  describe('LogsApi', () => {
    it('maps getByHash to /logs/:hash', async () => {
      mockClient.get.mockResolvedValue({ data: { hash: '0xabc', status: 'pending' } });

      const log = await logsApi.getByHash('0xabc');

      expect(mockClient.get).toHaveBeenCalledWith('/logs/0xabc');
      expect(log.hash).toBe('0xabc');
    });

    it('maps account log filters and pagination', async () => {
      mockClient.get.mockResolvedValue({ data: [{ hash: '0x1' }, { hash: '0x2' }] });

      const response = await logsApi.getByAccount('0xaccount', {
        limit: 25,
        offset: 10,
        pub_data_type: ['Trade'],
      });

      expect(mockClient.get).toHaveBeenCalledWith('/accounts/0xaccount/logs', {
        limit: 25,
        offset: 10,
        pub_data_type: ['Trade'],
      });
      expect(response.logs).toHaveLength(2);
      expect(response.limit).toBe(25);
      expect(response.offset).toBe(10);
    });
  });
});
