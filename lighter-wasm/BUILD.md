# Lighter WASM - Complete Build & Integration Guide

This package contains pre-compiled WebAssembly binaries for the Lighter Protocol cryptographic signer, compiled from Rust source code.

## What's Included

This `lighter-wasm` package is a **distribution of compiled Rust WASM**:

```
lighter-wasm/
├── rust-nodejs/          # Node.js compatible WASM (CommonJS)
├── rust-web/             # Browser compatible WASM (ESM)
├── lighter-signer.wasm   # Primary WASM binary
├── lighter-signer.js     # JavaScript glue code
├── signer_wasm.d.ts      # TypeScript definitions
└── README.md             # This file
```

## Understanding the Build

### Rust Source Location
The source code lives in the **parent workspace**:
```
lighter-ts/
├── lighter-wasm/         ← You are here (compiled binaries)
└── lighter-rust/         ← Source code (see BUILD.md below)
    └── signer-wasm/      ← Rust source code
```

### Build Process
```
Rust Source (lighter-rust/signer-wasm/)
    ↓
wasm-pack compilation
    ↓
WASM binary + JS glue code
    ↓
lighter-wasm/ (this directory)
```

## How to Build from Source

### For Users: Using Pre-Built Binaries (Recommended)

The binaries in this package are already compiled. Simply install:

```bash
npm install lighter-wasm
```

Then use in your code:

```typescript
import { SignerClient } from 'lighter-wasm';
const signer = new SignerClient(privateKey);
```

### For Developers: Building from Rust Source

If you need to compile the WASM yourself:

#### Step 1: Set Up Prerequisites
```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack

# Verify installation
wasm-pack --version
```

#### Step 2: Build from Lighter TypeScript SDK
```bash
cd lighter-ts/  # Go to project root
npm run build:wasm
```

This automatically:
1. Finds the Rust source in `lighter-rust/signer-wasm/`
2. Compiles for both Node.js and Web targets
3. Places output in `lighter-wasm/rust-nodejs/` and `lighter-wasm/rust-web/`

#### Step 3: Verify the Build
```bash
npm run verify:wasm
```

### For Advanced Users: Direct wasm-pack Build

```bash
cd lighter-rust/signer-wasm/

# Build for Node.js (CommonJS)
wasm-pack build --target nodejs --release --out-dir ../../wasm/rust-nodejs

# Build for Web (ESM)
wasm-pack build --target web --release --out-dir ../../wasm/rust-web
```

## Rust Source Documentation

For detailed information about the Rust implementation, see:

📄 **[lighter-rust/signer-wasm/BUILD.md](../lighter-rust/signer-wasm/BUILD.md)**

Topics covered:
- Source code structure and modules
- Cryptographic primitives provided
- Detailed build commands
- Troubleshooting compilation issues
- Build optimizations and configurations

## Target Information

### Node.js Target
- **Location**: `rust-nodejs/`
- **Module**: CommonJS (`.require()`)
- **Use Case**: Node.js servers, CLI tools, backends
- **Exports**: TypeScript definitions included

### Web Target
- **Location**: `rust-web/`
- **Module**: ES Modules (`.import`)
- **Use Case**: Browser, frontend applications
- **Exports**: TypeScript definitions included

## Version Tracking

The built WASM is versioned with this package:
- Check version: `npm list lighter-wasm`
- Source commit: Deterministic builds from tagged releases

## Using in Your Project

### TypeScript/Node.js
```typescript
// Automatically uses Node.js target
import { SignerClient } from 'lighter-wasm';

const client = new SignerClient(privateKey);
const signature = client.signOrder(orderData);
```

### Browser/Frontend
```typescript
// Automatically uses Web target via package exports
import { SignerClient } from 'lighter-wasm';

const client = new SignerClient(privateKey);
const signature = await client.signOrder(orderData);
```

### Manual Target Selection
```typescript
// Explicitly use Node.js version
import { SignerClient } from 'lighter-wasm/nodejs';

// Explicitly use Web version
import { SignerClient } from 'lighter-wasm/web';
```

## Security & Verification

### Before Using
1. Verify package source: `npm info lighter-wasm`
2. Check integrity: `npm audit`
3. Inspect WASM: Binary can be examined with tools like `wasm-objdump`

### Build Reproducibility
To verify you've built the same binary:
```bash
npm run build:wasm
npm run verify:wasm
```

## Build Information

| Property | Details |
|----------|---------|
| **Compiler** | rustc (edition 2021) |
| **WASM Tool** | wasm-pack 0.12+ |
| **Optimization** | Release with LTO, size-optimized |
| **WASM Size** | ~400KB (gzipped: ~120KB) |
| **Dependencies** | See source `Cargo.toml` |

## File Reference

| File | Purpose |
|------|---------|
| `rust-nodejs/signer_wasm.js` | Node.js entry point |
| `rust-web/signer_wasm.js` | Web entry point |
| `signer_wasm.d.ts` | TypeScript type definitions |
| `lighter-signer.wasm` | Actual WebAssembly binary |
| `lighter-signer.js` | Legacy compatibility entry point |

## What's Exported

See [lighter-rust/signer-wasm/BUILD.md](../lighter-rust/signer-wasm/BUILD.md#module-reference) for detailed function reference.

Typical exports:
- `SignerClient` - Main signer class
- `signOrder()` - Create order signatures
- `verifySignature()` - Verify signatures
- `deriveKey()` - Key derivation
- `poseidonHash()` - Cryptographic hashing

## Troubleshooting

### Module Not Found
Ensure proper import target:
```typescript
// Correct
import { SignerClient } from 'lighter-wasm';

// Incorrect (will not work)
import { SignerClient } from './lighter-signer.wasm';
```

### Build Issues
If you need to rebuild:
```bash
cd lighter-ts
npm run build:wasm
```

For help with build issues, see [lighter-rust/signer-wasm/BUILD.md](../lighter-rust/signer-wasm/BUILD.md#troubleshooting)

### WASM Size Concerns
The WASM is intentionally optimized for size:
- Release mode: ~400KB
- Gzipped: ~120KB
- Stripe optimization via LTO

## Related Resources

- **Lighter Protocol**: https://lighter.exchange
- **TypeScript SDK**: See parent `lighter-ts` directory
- **Rust Implementation**: `lighter-rust/` directory
- **WebAssembly Guide**: https://rustwasm.org

## 📝 License

MIT License - See parent directory LICENSE file

---

**Package**: lighter-wasm  
**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: February 2026
