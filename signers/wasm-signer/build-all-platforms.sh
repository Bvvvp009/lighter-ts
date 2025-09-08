#!/bin/bash
# Cross-platform build script for lighter WASM signer

echo "Building lighter-go WASM signer for all platforms..."

# Set Go environment for WASM
export GOOS=js
export GOARCH=wasm

# Build the WASM binary
echo "Compiling Go to WASM..."
go build -o lighter-signer.wasm main.go

# Create a simple wasm_exec.js if it doesn't exist
if [ ! -f "wasm_exec.js" ]; then
    echo "Creating wasm_exec.js..."
    cat > wasm_exec.js << 'EOF'
// Go WASM Runtime - Simplified version
// This is a minimal implementation for the lighter signer

const go = new Go();

// Initialize WASM module
async function initWasm(wasmPath) {
    const wasmModule = await WebAssembly.instantiateStreaming(fetch(wasmPath), go.importObject);
    go.run(wasmModule.instance);
}

// Export functions for global access
window.initWasm = initWasm;
window.go = go;
EOF
fi

echo "Build complete!"
echo "Files created:"
echo "  - lighter-signer.wasm (WASM binary)"
echo "  - wasm_exec.js (Go WASM runtime)"
echo ""
echo "To use in your TypeScript project:"
echo "  1. Copy both files to your project's public/static directory"
echo "  2. Load wasm_exec.js before loading your WASM module"
echo "  3. Use the exported functions: generateAPIKey, createClient, signCreateOrder, signCancelOrder, createAuthToken"

