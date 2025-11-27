# WasmSignerConfig

Configuration object for the WASM signer client. The WASM signer is compiled from the official [lighter-go](https://github.com/elliottech/lighter-go) repository.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wasmPath` | `string` | No | Path to the WASM binary file (defaults to `wasm/lighter-signer.wasm`) |
| `wasmExecPath` | `string` | No | Path to wasm_exec.js runtime (optional, auto-detected if not provided) |

## Example

```typescript
import { WasmSignerClient } from 'lighter-ts-sdk';

// Minimal configuration - paths auto-resolve
const config: WasmSignerConfig = {
  wasmPath: 'wasm/lighter-signer.wasm'
};

const wasmClient = new WasmSignerClient(config);
```

## Notes

- The `wasmPath` defaults to `wasm/lighter-signer.wasm` if not provided
- The `wasmExecPath` is optional and will be auto-detected if not provided
- For Node.js environments, the runtime will look for `wasm_exec.js` in common locations
- For browser environments, the runtime will look for `wasm_exec.js` in the same directory as the WASM file
- The WASM signer is compiled from the official lighter-go repository during the build process
