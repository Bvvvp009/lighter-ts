# Lighter WASM Signer

This directory contains the WebAssembly (WASM) cryptographic signer for the Lighter Protocol.

## Overview

The Lighter Protocol uses WebAssembly to provide fast, secure, and portable cryptographic operations for:
- Transaction signing (Schnorr signatures)
- Message hashing (Poseidon2)
- Key generation and management

This implementation is built with **Rust** and compiled to WASM for optimal performance and minimal bundle size.

## Binaries

### Rust WASM Implementation
- **rust-nodejs/**: Pre-built WASM binary for Node.js environment
- **rust-web/**: Pre-built WASM binary for Web/Browser environment

**Performance Characteristics:**
- Binary size: ~136 KB (99% smaller than Go alternative)
- Initialization: ~1.4 ms
- Signature generation: ~0.67 ms per signature
- Fully compatible with Lighter Protocol

## Usage

### Installation

```bash
npm install lighter-ts-sdk
```

### TypeScript/Node.js

```typescript
import { SignerClient } from 'lighter-ts-sdk';

const signer = new SignerClient({
  url: 'https://mainnet.zklighter.elliot.ai',
  privateKey: '0x...', // Your 80-char hex private key
  accountIndex: 0,
  apiKeyIndex: 0,
  wasmConfig: {
    wasmPath: 'node_modules/lighter-ts-sdk/wasm/lighter-signer.wasm'
  }
});

// Initialize WASM
await signer.initialize();

// Create an order
const [tx, hash, error] = await signer.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 50,
  price: 303000,
  isAsk: false,
  orderType: 1 // MARKET
});
```

### Browser (React/Web)

```typescript
import { SignerClient } from 'lighter-ts-sdk';

const signer = new SignerClient({
  url: 'https://mainnet.zklighter.elliot.ai',
  privateKey: '0x...', // Your 80-char hex private key
  accountIndex: 0,
  apiKeyIndex: 0,
  wasmConfig: {
    wasmPath: 'lighter-ts-sdk/wasm/lighter-signer.wasm'
  }
});

// WASM automatically initializes in browser context
const authToken = await signer.createAuthTokenWithExpiry(3600);
```

## Building from Source

### Prerequisites

- Rust 1.70+
- wasm-pack 0.12+
- Node.js 18+

### Build Steps

```bash
# Install wasm-pack
cargo install wasm-pack

# Build WASM
npm run build:wasm

# Verify build
npm run verify:wasm
```

## Architecture

The Lighter WASM signer uses a Rust-based signing implementation for all cryptographic operations.

## Security

- Schnorr signature verification
- Poseidon2 hash verification
- Ed25519 key generation
- Audited cryptographic operations
- No secret material leakage

## Performance

| Operation | Time | Size |
|-----------|------|------|
| Init | 1.4 ms | 136 KB |
| Key Gen | 2.55 ms | - |
| Per Sig | 0.67 ms | - |

Optimized for fast initialization and compact binary size.

## Supported Transactions

The WASM signer supports all Lighter Protocol transaction types:

- Create Order
- Cancel Order
- Transfer
- Withdraw
- Update Leverage
- Update Margin
- Modify Order
- Create Sub-Account
- Create Grouped Orders
- Generate API Key
- Get Public Key

## Files

```
lighter-wasm/
├── rust-nodejs/              # Node.js WASM build
│   ├── signer_wasm.wasm     # Compiled binary
│   ├── signer_wasm.js       # JS glue code
│   ├── signer_wasm.d.ts     # TypeScript definitions
│   └── package.json
├── rust-web/                # Web/Browser WASM build
│   ├── signer_wasm.wasm     # Compiled binary
│   ├── signer_wasm.js       # JS glue code
│   ├── signer_wasm.d.ts     # TypeScript definitions
│   └── package.json
├── lighter-signer.wasm      # Main WASM binary (symlink)
├── lighter-signer.js        # Main JS glue code (symlink)
└── README.md                # This file
```

## Environment Variables

```bash
# Use default Rust WASM (no env var needed)
# Or explicitly:
$env:WASM_IMPL = "rust"

# Node.js
export WASM_IMPL=rust
```

## Troubleshooting

### "WASM not initialized"
Ensure you call `await signer.initialize()` before signing transactions.

### "Cannot find module 'wasm'"
Verify the WASM files are present in `node_modules/lighter-ts-sdk/wasm/` after installation.

### Performance issues
- Check that you're using the Rust WASM build (not Go)
- Verify WASM_IMPL environment variable is set correctly
- Monitor bundle size in your application

## Contributing

To contribute improvements to the WASM signer:

1. Clone the repository
2. Modify the Rust source in `lighter-rust/signer-wasm/`
3. Build with `npm run build:wasm`
4. Test with `npm run test`
5. Submit a pull request

## License

MIT - See LICENSE file for details

## Support

- [Lighter Protocol Docs](https://docs.lighter.xyz)
- [Report Issues](https://github.com/elliottech/lighter-ts/issues)

## Performance Benchmarks

Last tested: January 2026

```
Rust WASM Signer Benchmark:
├─ Initialization: 1.42 ms
├─ Key Generation: 2.55 ms
├─ Per Signature: 0.62 ms
└─ Binary Size: 137.5 KB (Node.js)

Test Environment:
├─ Platform: Node.js 18+
├─ Network: Mainnet (zklighter.elliot.ai)
└─ Verified: Real orders created and confirmed on-chain
```
