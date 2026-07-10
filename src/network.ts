/**
 * Network registry and env-driven network selection.
 *
 * Lighter runs on multiple chains that share the same core: the original
 * Lighter L2 (mainnet/testnet, hosts `*.zklighter.elliot.ai`) and
 * Lighter-on-Robinhood (`api.rh.lighter.xyz`, testnet `api.rh-testnet.lighter.xyz`). Only the API/WS hosts, contract
 * address, signing chain_id, and supported asset set differ — order books and
 * settlement are separate per instance.
 *
 * Pick a network by setting `LIGHTER_NETWORK` in `.env` (default `mainnet`):
 *   - mainnet   -> https://mainnet.zklighter.elliot.ai   (chain_id 304)
 *   - testnet   -> https://testnet.zklighter.elliot.ai   (chain_id 300)
 *   - robinhood         -> https://api.rh.lighter.xyz            (chain_id 466324)
 *   - robinhood-testnet -> https://api.rh-testnet.lighter.xyz     (chain_id 300)
 *
 * `SignerClient` consumes `resolveNetworkFromEnv()` when no explicit `url` or
 * `network` is provided, so a single `.env` line drives both the host and the
 * signing chain_id. Optional `BASE_URL` / `WS_URL` / `CHAIN_ID` env vars
 * override the registry defaults for local or custom deployments.
 */

export interface Network {
  /** Lowercase registry key, e.g. `mainnet`, `testnet`, `robinhood`, `robinhood-testnet`. */
  name: string;
  /** REST API base URL, e.g. `https://api.rh.lighter.xyz`. */
  apiUrl: string;
  /** WebSocket stream URL, e.g. `wss://api.rh.lighter.xyz/stream`. */
  wsUrl: string;
  /** Signing chain id — the first element of every L2 tx hash; must match the network. */
  chainId: number;
  /** Optional block explorer API URL. */
  explorerUrl?: string;
}

/** Known networks keyed by their lowercase name. */
export const NETWORKS: Record<string, Network> = {
  mainnet: {
    name: 'mainnet',
    apiUrl: 'https://mainnet.zklighter.elliot.ai',
    wsUrl: 'wss://mainnet.zklighter.elliot.ai/stream',
    chainId: 304,
    explorerUrl: 'https://explorer.elliot.ai/api',
  },
  testnet: {
    name: 'testnet',
    apiUrl: 'https://testnet.zklighter.elliot.ai',
    wsUrl: 'wss://testnet.zklighter.elliot.ai/stream',
    chainId: 300,
    explorerUrl: 'https://testnet.explorer.elliot.ai/api',
  },
  robinhood: {
    name: 'robinhood',
    apiUrl: 'https://api.rh.lighter.xyz',
    wsUrl: 'wss://api.rh.lighter.xyz/stream',
    // Source: team's `lighter-python` `endpoint_profiles.py` (2026-07-07).
    // Not the L1 chainId (4663) nor the status `network_id` (1).
    chainId: 466324,
  },
  'robinhood-testnet': {
    name: 'robinhood-testnet',
    apiUrl: 'https://api.rh-testnet.lighter.xyz',
    wsUrl: 'wss://api.rh-testnet.lighter.xyz/stream',
    // Source: team's `lighter-python` `endpoint_profiles.py` (ROBINHOOD_TESTNET).
    // Shares L2 chain_id 300 (and L1 chainId 123456) with the original Lighter
    // testnet, but is a separate Robinhood-hosted instance: different host
    // (api.rh-testnet.lighter.xyz) and contract (0x047dF90f783E98745f9b53F1a974c8e9Ac1fE56b).
    // The host - not the chain_id - disambiguates the two testnets.
    chainId: 300,
  },
};

export type NetworkName = keyof typeof NETWORKS;

/**
 * Look up a network by name (case-insensitive). Throws on unknown names.
 */
export function getNetwork(name: string): Network {
  const key = (name ?? '').trim().toLowerCase();
  const network = NETWORKS[key];
  if (!network) {
    const known = Object.keys(NETWORKS).join(', ');
    throw new Error(`Unknown Lighter network "${name}". Known networks: ${known}.`);
  }
  return network;
}

/**
 * Derive a WS stream URL from an API URL
 * (`https://host[/path]` -> `wss://host/path/stream`).
 */
export function deriveWsUrl(apiUrl: string): string {
  let host = apiUrl.trim().replace(/\/+$/, '');
  if (host.startsWith('https://')) {
    host = 'wss://' + host.slice('https://'.length);
  } else if (host.startsWith('http://')) {
    host = 'ws://' + host.slice('http://'.length);
  } else if (!host.startsWith('wss://') && !host.startsWith('ws://')) {
    host = 'wss://' + host;
  }
  return host + '/stream';
}

/**
 * Resolve the active network from environment variables.
 *
 * `LIGHTER_NETWORK` (default `mainnet`) selects a complete known profile — its
 * host, WS URL, and signing chain_id move together. This is the recommended
 * switch: set `LIGHTER_NETWORK=robinhood` and the SDK targets Robinhood with
 * chain_id 466324, regardless of any leftover `BASE_URL` from another instance.
 *
 * When `LIGHTER_NETWORK` is **unset**, the default mainnet profile is used but
 * these optional overrides apply (for local / custom / proxied deployments):
 *   - `BASE_URL`   overrides the REST host (apiUrl); WS URL is derived from it
 *                  when `WS_URL` is also unset.
 *   - `WS_URL`     overrides the WebSocket host (wsUrl).
 *   - `CHAIN_ID`   overrides the signing chain id (also honored when
 *                  `LIGHTER_NETWORK` is set, for the rare case of overriding
 *                  only the signing id while keeping a known profile's host).
 */
export function resolveNetworkFromEnv(env: NodeJS.ProcessEnv = process.env): Network {
  const explicitName =
    env['LIGHTER_NETWORK'] !== undefined
      ? (env['LIGHTER_NETWORK'] as string).trim().toLowerCase()
      : undefined;
  const base = getNetwork(explicitName ?? 'mainnet');

  const chainIdOverride =
    env['CHAIN_ID'] != null ? Number.parseInt(env['CHAIN_ID'], 10) : NaN;
  const chainId = Number.isFinite(chainIdOverride) ? chainIdOverride : base.chainId;

  // An explicit LIGHTER_NETWORK is authoritative for host + ws: a leftover
  // BASE_URL from a different instance must not decouple the host from the
  // signing chain_id. CHAIN_ID may still override (rare, deliberate).
  if (explicitName !== undefined) {
    return chainId === base.chainId ? base : { ...base, chainId };
  }

  // LIGHTER_NETWORK unset -> default mainnet profile, with optional
  // BASE_URL / WS_URL / CHAIN_ID overrides for custom deployments.
  const apiUrl = env['BASE_URL'] ?? base.apiUrl;
  let wsUrl = base.wsUrl;
  if (env['WS_URL']) {
    wsUrl = env['WS_URL'];
  } else if (env['BASE_URL']) {
    wsUrl = deriveWsUrl(apiUrl);
  }

  if (apiUrl === base.apiUrl && wsUrl === base.wsUrl && chainId === base.chainId) {
    return base;
  }
  return { ...base, apiUrl, wsUrl, chainId };
}

/**
 * Resolve the WS URL for a network, appending `?readonly=true` when requested.
 * The read-only stream is for restricted regions (used by the Robinhood instance).
 */
export function resolveWsUrl(network: Network, opts?: { readonly?: boolean }): string {
  const base = network.wsUrl;
  if (opts?.readonly) {
    return base + (base.includes('?') ? '&' : '?') + 'readonly=true';
  }
  return base;
}