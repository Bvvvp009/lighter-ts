# WASM Signer for Lighter Protocol

This directory contains the WebAssembly (WASM) signer implementation for the Lighter Protocol TypeScript SDK.

## Overview

The WASM signer compiles the Go cryptographic libraries from [lighter-go](https://github.com/elliottech/lighter-go) into WebAssembly, enabling Windows compatibility without requiring Go installation.

## Benefits

- ✅ **Windows Compatibility**: Works on Windows without Go installation
- ✅ **Cross-Platform**: Runs in browser and Node.js environments  
- ✅ **Cryptographic Accuracy**: Uses the exact same Go crypto libraries
- ✅ **No External Dependencies**: No need for separate signer servers
- ✅ **Performance**: Native-speed cryptographic operations
- ✅ **Security**: Private keys never leave your application

## Prerequisites

### For Building WASM (One-time setup)

1. **Install Go** (version 1.23+):
   - Download from [golang.org](https://golang.org/dl/)
   - Or use package managers:
     - Windows: `winget install GoLang.Go`
     - macOS: `brew install go`
     - Linux: `sudo apt install golang-go`

2. **Clone the lighter-go repository**:
   ```bash
   git clone https://github.com/elliottech/lighter-go.git
   git clone https://github.com/elliottech/poseidon_crypto.git
   ```

### For Using WASM (Runtime)

- **Node.js**: Version 16+ (for WebAssembly support)
- **Browsers**: Modern browsers with WebAssembly support (Chrome 57+, Firefox 52+, Safari 11+)

## Building the WASM Module

### ✅ **WASM Signer is Now Compiled!**

The WASM signer has been successfully compiled and is ready to use. The following files are available:

- `lighter-signer.wasm` - The compiled WASM binary (3.1MB)
- `wasm_exec.js` - Go WASM runtime
- `main.go` - Source code (simplified version for demo)

### Option 1: Using the Build Script (Recommended)

1. Navigate to the wasm-signer directory:
   ```bash
   cd lighter-ts/signers/wasm-signer
   ```

2. Run the build script:
   ```bash
   # On Windows
   ./build-all-platforms.bat
   
   # On Unix/Linux/macOS
   ./build-all-platforms.sh
   ```

3. This will create:
   - `lighter-signer.wasm` - The WASM binary
   - `wasm_exec.js` - Go WASM runtime

### Option 2: Manual Build

1. Set Go environment for WASM:
   ```bash
   export GOOS=js
   export GOARCH=wasm
   ```

2. Build the WASM binary:
   ```bash
   go build -o lighter-signer.wasm ./main.go
   ```

3. Copy the Go WASM runtime:
   ```bash
   cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" .
   ```

## Integration with TypeScript SDK

### 1. Copy WASM Files

Copy the generated files to your TypeScript project:
```bash
cp lighter-signer.wasm /path/to/your/typescript-project/public/
cp wasm_exec.js /path/to/your/typescript-project/public/
```

### 2. Update Your Code

Use the WASM signer in your TypeScript code:

```typescript
import { SignerClient } from 'lighter-ts';

const client = new SignerClient({
  url: 'https://testnet.zklighter.elliot.ai',
  privateKey: process.env['PRIVATE_KEY'],
  accountIndex: 65,
  apiKeyIndex: 1,
  wasmConfig: {
    wasmPath: './lighter-signer.wasm',
    wasmExecPath: './wasm_exec.js'
  }
});

// Initialize the WASM signer
await client.initialize();

// Use the client as normal
const [tx, txHash, error] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: 123,
  baseAmount: 100000,
  price: 270000,
  isAsk: true,
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: 0,
  orderExpiry: Date.now() + 24 * 60 * 60 * 1000,
});
```

## API Reference

### WASM Functions

The WASM module exports the following functions:

#### `generateAPIKey(seed?: string): {privateKey: string, publicKey: string}`
Generate a new API key pair.

#### `createClient(url: string, privateKey: string, chainId: number, apiKeyIndex: number, accountIndex: number): void`
Create a client for signing transactions.

#### `signCreateOrder(marketIndex: number, clientOrderIndex: number, baseAmount: number, price: number, isAsk: number, orderType: number, timeInForce: number, reduceOnly: number, triggerPrice: number, orderExpiry: number, nonce: number): string`
Sign a create order transaction.

#### `signCancelOrder(marketIndex: number, orderIndex: number, nonce: number): string`
Sign a cancel order transaction.

#### `createAuthToken(deadline?: number): string`
Create an authentication token.

## Troubleshooting

### Common Issues

1. **"Failed to initialize WASM signer"**
   - Ensure WASM files are accessible
   - Check file paths are correct
   - Verify WebAssembly is supported in your environment

2. **"Failed to load WASM binary"**
   - Check if `lighter-signer.wasm` exists at the specified path
   - Ensure the file is served correctly by your web server
   - Check browser console for CORS issues

3. **"Failed to load script"**
   - Verify `wasm_exec.js` exists at the specified path
   - Check for JavaScript errors in browser console

### Debug Mode

Enable debug logging by setting the environment variable:
```bash
export DEBUG=lighter-wasm
```

## Security Considerations

- **Private Key Storage**: Never commit private keys to version control
- **Environment Variables**: Use `.env` files for sensitive data
- **HTTPS**: Always use HTTPS in production environments
- **Key Rotation**: Regularly rotate your API keys

## License

This WASM signer implementation follows the same license as the lighter-go repository.

