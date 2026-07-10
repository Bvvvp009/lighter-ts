# SignerConfig

Configuration object for the `SignerClient` class.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `network` | `Network \| 'mainnet' \| 'testnet' \| 'robinhood'` | No | Network selection. When set, its `apiUrl` (if `url` is omitted) and `chainId` (if `chainId` is omitted) are used. Recommended for Robinhood, whose signing chain_id (466324) cannot be auto-detected from the URL. |
| `url` | `string` | No | The Lighter API URL. Optional — if omitted, the host is resolved from `network`, or from `LIGHTER_NETWORK` in the environment (default `mainnet`). |
| `chainId` | `number` | No | Explicit signing chain id. The first element of every L2 tx hash; must match the target network. When unset, the `network`'s `chainId` is used; failing that, the legacy URL heuristic / API probe runs (mainnet 304, testnet 300). |
| `privateKey` | `string` | Yes | Your API key private key |
| `accountIndex` | `number` | Yes | Your account index |
| `apiKeyIndex` | `number` | Yes | Your API key index |
| ~~`signerServerUrl`~~ | ~~`string`~~ | ~~No~~ | ~~URL of the signer server (deprecated - use WASM signer)~~ |
| `wasmConfig` | `WasmSignerConfig` | No | Configuration for WASM signer (optional - auto-resolves paths) |

## Example

```typescript
import { SignerClient, resolveNetworkFromEnv } from 'lighter-ts-sdk';

// Env-driven: set LIGHTER_NETWORK=mainnet|testnet|robinhood in .env
const client = new SignerClient({
  network: resolveNetworkFromEnv(),
  privateKey: '0x1234567890abcdef...',
  accountIndex: 123,
  apiKeyIndex: 0,
});

// Or target Robinhood explicitly
const rhClient = new SignerClient({
  network: 'robinhood',
  privateKey: '0x1234567890abcdef...',
  accountIndex: 123,
  apiKeyIndex: 0,
});
```

## Notes

- The `privateKey` should be your API key private key, not your Ethereum private key
- The `accountIndex` and `apiKeyIndex` can be obtained from the system setup process
- WASM signer is now the default and only signing method
- The `wasmPath` should point to the compiled WASM binary file
- Read-only access (info, tokenlist, system config) needs no key — use `ApiClient` + `InfoApi` / `TokenlistApi` directly (see `examples/robinhood_quickstart.ts`).
