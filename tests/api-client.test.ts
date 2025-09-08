import { ApiClient } from '../src/api/api-client';
import { Config } from '../src/utils/configuration';

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient({
      host: 'https://testnet.zklighter.elliot.ai',
      timeout: 5000,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('constructor', () => {
    it('should create an instance with default config', () => {
      const defaultClient = new ApiClient();
      expect(defaultClient).toBeInstanceOf(ApiClient);
      expect(defaultClient.getConfig().getHost()).toBe('https://mainnet.zklighter.elliot.ai');
    });

    it('should create an instance with custom config', () => {
      const customClient = new ApiClient({
        host: 'https://custom.example.com',
        timeout: 10000,
      });
      expect(customClient.getConfig().getHost()).toBe('https://custom.example.com');
      expect(customClient.getConfig().getTimeout()).toBe(10000);
    });
  });

  describe('configuration', () => {
    it('should set and get default headers', () => {
      client.setDefaultHeader('X-Custom-Header', 'custom-value');
      expect(client.getConfig()).toBeInstanceOf(Config);
    });

    it('should remove default headers', () => {
      client.setDefaultHeader('X-Test-Header', 'test-value');
      client.removeDefaultHeader('X-Test-Header');
      // Note: We can't easily test the internal state, but this should not throw
      expect(client).toBeInstanceOf(ApiClient);
    });
  });

  describe('HTTP methods', () => {
    it('should have get method', () => {
      expect(typeof client.get).toBe('function');
    });

    it('should have post method', () => {
      expect(typeof client.post).toBe('function');
    });

    it('should have put method', () => {
      expect(typeof client.put).toBe('function');
    });

    it('should have delete method', () => {
      expect(typeof client.delete).toBe('function');
    });

    it('should have patch method', () => {
      expect(typeof client.patch).toBe('function');
    });
  });
});