# WASM Signer for Lighter Protocol

This document explains how to set up and use the WebAssembly (WASM) signer for the Lighter Protocol TypeScript SDK, enabling Windows compatibility without requiring Go installation.

## Overview

The WASM signer compiles the Go cryptographic libraries from [lighter-go](https://github.com/elliottech/lighter-go) into WebAssembly, allowing you to use the exact same signing logic in TypeScript applications running on Windows, browsers, or any platform that supports WebAssembly.

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
   cd lighter-go
   ```

### For Using WASM (Runtime)

- **Node.js**: Version 16+ (for WebAssembly support)
- **Browsers**: Modern browsers with WebAssembly support (Chrome 57+, Firefox 52+, Safari 11+)

## Building the WASM Module

### Option 1: Using the Build Script (Recommended)

1. Navigate to the lighter-go directory:
   ```bash
   cd lighter-go
   ```

2. Run the build script:
   ```bash
   # On Windows
   ./build-wasm.bat
   
   # On Unix/Linux/macOS
   ./build-wasm.sh
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
   go build -o lighter-signer.wasm ./wasm/main.go
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

Replace the server-based signer with the WASM signer:

```typescript
import { SignerClient } from './src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

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

### 3. Browser Integration

For browser usage, ensure the WASM files are served from your web server:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Lighter WASM Signer</title>
</head>
<body>
    <script src="./wasm_exec.js"></script>
    <script type="module">
        import { SignerClient } from './src/signer/wasm-signer-client.js';
        
        const client = new SignerClient({
            url: 'https://testnet.zklighter.elliot.ai',
            privateKey: 'your-private-key',
            accountIndex: 65,
            apiKeyIndex: 1,
            wasmConfig: {
                wasmPath: './lighter-signer.wasm',
                wasmExecPath: './wasm_exec.js'
            }
        });
        
        await client.initialize();
        // Use client...
    </script>
</body>
</html>
```

## API Reference

### SignerClient Constructor

```typescript
new SignerClient({
  url: string;                    // Lighter API URL
  privateKey: string;             // Your private key
  accountIndex: number;           // Account index
  apiKeyIndex: number;           // API key index
  wasmConfig: {                  // WASM configuration
    wasmPath: string;            // Path to WASM binary
    wasmExecPath?: string;       // Path to wasm_exec.js (optional)
  };
})
```

### Methods

#### `initialize(): Promise<void>`
Initialize the WASM signer. Must be called before using other methods.

#### `createOrder(params): Promise<[any, string, string | null]>`
Create a limit order.

#### `createMarketOrder(params): Promise<[any, string, string | null]>`
Create a market order.

#### `cancelOrder(params): Promise<[any, string, string | null]>`
Cancel an existing order.

#### `generateAPIKey(seed?: string): Promise<{privateKey: string, publicKey: string} | null>`
Generate a new API key pair.

#### `createAuthTokenWithExpiry(expirySeconds?: number): Promise<string>`
Create an authentication token.

## Examples

### Complete Example

See `examples/create-cancel-order-wasm.ts` for a complete working example.

### Key Generation Example

```typescript
const client = new SignerClient({
  // ... config
  wasmConfig: {
    wasmPath: './lighter-signer.wasm',
    wasmExecPath: './wasm_exec.js'
  }
});

await client.initialize();

// Generate a new API key pair
const keyPair = await client.generateAPIKey();
console.log('Private Key:', keyPair.privateKey);
console.log('Public Key:', keyPair.publicKey);
```

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

### Performance Tips

1. **Preload WASM**: Initialize the signer early in your application lifecycle
2. **Reuse Client**: Create one client instance and reuse it
3. **Error Handling**: Always wrap signer calls in try-catch blocks

## Security Considerations

- **Private Key Storage**: Never commit private keys to version control
- **Environment Variables**: Use `.env` files for sensitive data
- **HTTPS**: Always use HTTPS in production environments
- **Key Rotation**: Regularly rotate your API keys

## Comparison with Other Signers

| Feature | WASM Signer | Server Signer | Local Signer |
|---------|-------------|---------------|--------------|
| Windows Support | ✅ | ✅ | ❌ |
| Browser Support | ✅ | ❌ | ❌ |
| No External Dependencies | ✅ | ❌ | ❌ |
| Cryptographic Accuracy | ✅ | ✅ | ⚠️ |
| Performance | ✅ | ⚠️ | ⚠️ |
| Setup Complexity | Medium | Low | High |

## Migration Guide

### From Server Signer

Replace:
```typescript
const client = new SignerClient({
  // ... other config
  signerServerUrl: 'http://localhost:8080'
});
```

With:
```typescript
const client = new SignerClient({
  // ... other config
  wasmConfig: {
    wasmPath: './lighter-signer.wasm',
    wasmExecPath: './wasm_exec.js'
  }
});
await client.initialize();
```

### From Local Signer

The WASM signer provides the same API as the local signer but with better compatibility and accuracy.

## Support

For issues related to:
- **WASM Build**: Check Go installation and lighter-go repository
- **TypeScript Integration**: Check file paths and WebAssembly support
- **Cryptographic Operations**: Verify private keys and network connectivity

## License

This WASM signer implementation follows the same license as the lighter-go repository.

