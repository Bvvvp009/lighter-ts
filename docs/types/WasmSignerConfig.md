# WasmSignerConfig

Configuration object for the WASM signer client. The WASM signer is compiled from Rust source.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `wasmPath` | `string` | No | Path to the WASM binary file (defaults to `wasm/lighter-signer.wasm`) |
| `wasmExecPath` | `string` | No | Reserved for legacy runtimes; not required for Rust WASM |

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
- The `wasmExecPath` is optional and typically unused for Rust WASM
- For Node.js environments, use files under `wasm/rust-nodejs/`
- For browser environments, use files under `wasm/rust-web/`
- The WASM signer is compiled from Rust source during the build process
