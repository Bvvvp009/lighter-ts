# SignerConfig

Configuration object for the `SignerClient` class.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | `string` | Yes | The Lighter API URL (e.g., `https://mainnet.zklighter.elliot.ai`) |
| `privateKey` | `string` | Yes | Your API key private key |
| `accountIndex` | `number` | Yes | Your account index |
| `apiKeyIndex` | `number` | Yes | Your API key index |
| `signerServerUrl` | `string` | No | URL of the signer server (alternative to WASM) |
| `wasmConfig` | `WasmSignerConfig` | No | Configuration for WASM signer |

## Example

```typescript
import { SignerClient } from 'lighter-ts-sdk';

const config: SignerConfig = {
  url: 'https://mainnet.zklighter.elliot.ai',
  privateKey: '0x1234567890abcdef...',
  accountIndex: 123,
  apiKeyIndex: 0,
  wasmConfig: {
    wasmPath: 'wasm/lighter-signer.wasm',
    wasmExecPath: 'wasm/wasm_exec.js' // optional
  }
};

const client = new SignerClient(config);
```

## Notes

- Either `signerServerUrl` or `wasmConfig` must be provided
- The `privateKey` should be your API key private key, not your Ethereum private key
- The `accountIndex` and `apiKeyIndex` can be obtained from the system setup process
- The `wasmPath` should point to the compiled WASM binary file
