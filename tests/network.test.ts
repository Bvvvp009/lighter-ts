import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  NETWORKS,
  getNetwork,
  resolveNetworkFromEnv,
  resolveWsUrl,
  deriveWsUrl,
  SignerClient,
  type Network,
} from '../src';

const ENV_KEYS = ['LIGHTER_NETWORK', 'BASE_URL', 'WS_URL', 'CHAIN_ID'] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe('Network registry', () => {
  it('defines mainnet/testnet/robinhood with correct hosts and chain ids', () => {
    expect(NETWORKS.mainnet.chainId).toBe(304);
    expect(NETWORKS.mainnet.apiUrl).toBe('https://mainnet.zklighter.elliot.ai');

    expect(NETWORKS.testnet.chainId).toBe(300);
    expect(NETWORKS.testnet.apiUrl).toBe('https://testnet.zklighter.elliot.ai');

    expect(NETWORKS.robinhood.chainId).toBe(466324);
    expect(NETWORKS.robinhood.apiUrl).toBe('https://api.rh.lighter.xyz');
    expect(NETWORKS.robinhood.wsUrl).toBe('wss://api.rh.lighter.xyz/stream');

    // robinhood-testnet: separate Robinhood-hosted instance; shares chain_id 300
    // with the original testnet but has a different host + contract.
    expect(NETWORKS['robinhood-testnet'].chainId).toBe(300);
    expect(NETWORKS['robinhood-testnet'].apiUrl).toBe('https://api.rh-testnet.lighter.xyz');
    expect(NETWORKS['robinhood-testnet'].wsUrl).toBe('wss://api.rh-testnet.lighter.xyz/stream');
  });

  it('looks up networks case-insensitively and throws on unknown names', () => {
    expect(getNetwork('Robinhood').chainId).toBe(466324);
    expect(getNetwork('Robinhood-Testnet').chainId).toBe(300);
    expect(getNetwork(' MAINNET ').chainId).toBe(304);
    expect(() => getNetwork('solana')).toThrow(/Unknown Lighter network/);
  });
});

describe('resolveNetworkFromEnv', () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = saveEnv();
  });
  afterEach(() => {
    restoreEnv(saved);
  });

  it('defaults to mainnet', () => {
    const n = resolveNetworkFromEnv();
    expect(n.name).toBe('mainnet');
    expect(n.chainId).toBe(304);
  });

  it('honors LIGHTER_NETWORK=testnet|robinhood|robinhood-testnet', () => {
    process.env.LIGHTER_NETWORK = 'testnet';
    expect(resolveNetworkFromEnv().chainId).toBe(300);

    process.env.LIGHTER_NETWORK = 'robinhood';
    const n = resolveNetworkFromEnv();
    expect(n.chainId).toBe(466324);
    expect(n.apiUrl).toBe('https://api.rh.lighter.xyz');

    process.env.LIGHTER_NETWORK = 'robinhood-testnet';
    const tn = resolveNetworkFromEnv();
    expect(tn.chainId).toBe(300);
    expect(tn.apiUrl).toBe('https://api.rh-testnet.lighter.xyz');
    expect(tn.wsUrl).toBe('wss://api.rh-testnet.lighter.xyz/stream');
    expect(tn.name).toBe('robinhood-testnet');
  });

  it('LIGHTER_NETWORK is authoritative: a leftover BASE_URL from another instance is ignored', () => {
    process.env.LIGHTER_NETWORK = 'robinhood';
    process.env.BASE_URL = 'https://mainnet.zklighter.elliot.ai';
    const n = resolveNetworkFromEnv();
    expect(n.apiUrl).toBe('https://api.rh.lighter.xyz');
    expect(n.wsUrl).toBe('wss://api.rh.lighter.xyz/stream');
    expect(n.chainId).toBe(466324);
  });

  it('returns the registry entry by reference when nothing overrides', () => {
    expect(resolveNetworkFromEnv()).toBe(NETWORKS.mainnet);
  });

  it('BASE_URL overrides the host and derives wsUrl when WS_URL is unset', () => {
    process.env.BASE_URL = 'https://custom.example.com';
    const n = resolveNetworkFromEnv();
    expect(n.apiUrl).toBe('https://custom.example.com');
    expect(n.wsUrl).toBe('wss://custom.example.com/stream');
    // chainId stays the default network's (mainnet 304) unless CHAIN_ID is set
    expect(n.chainId).toBe(304);
  });

  it('WS_URL overrides the ws host without affecting apiUrl', () => {
    process.env.WS_URL = 'wss://custom.example.com/stream';
    const n = resolveNetworkFromEnv();
    expect(n.apiUrl).toBe('https://mainnet.zklighter.elliot.ai');
    expect(n.wsUrl).toBe('wss://custom.example.com/stream');
  });

  it('CHAIN_ID overrides the signing chain id', () => {
    process.env.LIGHTER_NETWORK = 'robinhood';
    process.env.CHAIN_ID = '999';
    expect(resolveNetworkFromEnv().chainId).toBe(999);
  });

  it('ignores a non-numeric CHAIN_ID', () => {
    process.env.CHAIN_ID = 'not-a-number';
    expect(resolveNetworkFromEnv().chainId).toBe(304);
  });
});

describe('resolveWsUrl', () => {
  it('returns the network wsUrl by default', () => {
    expect(resolveWsUrl(NETWORKS.robinhood)).toBe('wss://api.rh.lighter.xyz/stream');
  });

  it('appends ?readonly=true for restricted regions', () => {
    expect(resolveWsUrl(NETWORKS.robinhood, { readonly: true })).toBe(
      'wss://api.rh.lighter.xyz/stream?readonly=true'
    );
  });

  it('uses & when a query string already exists', () => {
    const n: Network = { ...NETWORKS.robinhood, wsUrl: 'wss://x/y?z=1' };
    expect(resolveWsUrl(n, { readonly: true })).toBe('wss://x/y?z=1&readonly=true');
  });
});

describe('deriveWsUrl', () => {
  it('https -> wss and appends /stream', () => {
    expect(deriveWsUrl('https://api.rh.lighter.xyz')).toBe('wss://api.rh.lighter.xyz/stream');
  });

  it('http -> ws', () => {
    expect(deriveWsUrl('http://localhost:8080')).toBe('ws://localhost:8080/stream');
  });
});

describe('SignerClient network wiring', () => {
  const PK = '0x' + 'a'.repeat(80);
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv();
  });
  afterEach(() => {
    restoreEnv(saved);
  });

  it('uses the robinhood host + chain_id when network is "robinhood"', () => {
    const c = new SignerClient({ network: 'robinhood', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((c as any).apiUrl).toBe('https://api.rh.lighter.xyz');
    expect((c as any).config.chainId).toBe(466324);
    expect((c as any).resolvedNetwork.name).toBe('robinhood');
  });

  it('accepts a Network object for network', () => {
    const c = new SignerClient({ network: NETWORKS.testnet, privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((c as any).apiUrl).toBe('https://testnet.zklighter.elliot.ai');
    expect((c as any).config.chainId).toBe(300);
  });

  it('matches an explicit robinhood URL to the robinhood chain_id', () => {
    const c = new SignerClient({ url: 'https://api.rh.lighter.xyz', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((c as any).apiUrl).toBe('https://api.rh.lighter.xyz');
    expect((c as any).config.chainId).toBe(466324);
  });

  it('uses the robinhood-testnet host + chain_id when network is "robinhood-testnet"', () => {
    const c = new SignerClient({ network: 'robinhood-testnet', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((c as any).apiUrl).toBe('https://api.rh-testnet.lighter.xyz');
    expect((c as any).config.chainId).toBe(300);
    expect((c as any).resolvedNetwork.name).toBe('robinhood-testnet');
  });

  it('matches a robinhood-testnet URL to chain_id 300 (distinct from robinhood mainnet)', () => {
    const c = new SignerClient({ url: 'https://api.rh-testnet.lighter.xyz', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((c as any).apiUrl).toBe('https://api.rh-testnet.lighter.xyz');
    expect((c as any).config.chainId).toBe(300);
    expect((c as any).resolvedNetwork.name).toBe('robinhood-testnet');
  });

  it('keeps mainnet/testnet chain_id for their hosts (no regression)', () => {
    const mainnet = new SignerClient({ url: 'https://mainnet.zklighter.elliot.ai', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((mainnet as any).config.chainId).toBe(304);

    const testnet = new SignerClient({ url: 'https://testnet.zklighter.elliot.ai', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((testnet as any).config.chainId).toBe(300);
  });

  it('lets an explicit chainId override the network chain_id', () => {
    const c = new SignerClient({ network: 'robinhood', chainId: 12345, privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((c as any).config.chainId).toBe(12345);
  });

  it('reads LIGHTER_NETWORK when url and network are omitted', () => {
    process.env.LIGHTER_NETWORK = 'robinhood';
    const c = new SignerClient({ privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    expect((c as any).apiUrl).toBe('https://api.rh.lighter.xyz');
    expect((c as any).config.chainId).toBe(466324);
  });

  it('passes the explicit chain_id to the WASM createClient', async () => {
    const c = new SignerClient({ network: 'robinhood', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    const createClient = jest.fn().mockResolvedValue(undefined);
    (c as any).wallet = { createClient };

    await c.ensureWasmClient();

    expect(createClient).toHaveBeenCalledTimes(1);
    const arg = createClient.mock.calls[0][0];
    expect(arg.chainId).toBe(466324);
    expect(arg.url).toBe('https://api.rh.lighter.xyz');
    expect(arg.apiKeyIndex).toBe(0);
    expect(arg.accountIndex).toBe(0);
  });

  it('falls back to the URL heuristic for an unknown host with no chainId', async () => {
    // Unknown host, no network/chainId -> legacy heuristic (no "testnet" -> 304),
    // and ensureWasmClient must NOT use the (un-mocked) WASM; it will probe the
    // API, so stub the apiClient.get to return a chain_id of 466324 via /info.
    const c = new SignerClient({ url: 'https://unknown.example.com', privateKey: PK, accountIndex: 0, apiKeyIndex: 0 });
    const createClient = jest.fn().mockResolvedValue(undefined);
    (c as any).wallet = { createClient };
    // Stub the API probe so no real network call is made: /api/v1/layer2BasicInfo -> chain_id 466324.
    (c as any).apiClient.get = jest.fn().mockResolvedValue({ data: { chain_id: 466324 } });

    await c.ensureWasmClient();

    const arg = createClient.mock.calls[0][0];
    expect(arg.chainId).toBe(466324);
    expect(arg.url).toBe('https://unknown.example.com');
  });
});