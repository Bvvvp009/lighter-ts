# WasmSignerConfig

Configuration object for the WASM signer client.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wasmPath` | `string` | Yes | Path to the WASM binary file |
| `wasmExecPath` | `string` | No | Path to wasm_exec.js runtime (optional) |

## Example

```typescript
import { WasmSignerClient } from 'lighter-ts-sdk';

const config: WasmSignerConfig = {
  wasmPath: 'wasm/lighter-signer.wasm',
  wasmExecPath: 'wasm/wasm_exec.js' // optional, will auto-detect if not provided
};

const wasmClient = new WasmSignerClient(config);
```

## Notes

- The `wasmPath` should point to the compiled WASM binary file
- The `wasmExecPath` is optional and will be auto-detected if not provided
- For Node.js environments, the runtime will look for wasm_exec.js in common locations
- For browser environments, the runtime will look for wasm_exec.js in the same directory as the WASM file
