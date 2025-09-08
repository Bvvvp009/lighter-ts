@echo off
REM Cross-platform build script for lighter WASM signer (Windows)

echo Building lighter-go WASM signer for all platforms...

REM Set Go environment for WASM
set GOOS=js
set GOARCH=wasm

REM Build the WASM binary
echo Compiling Go to WASM...
go build -o lighter-signer.wasm main.go

REM Create a simple wasm_exec.js if it doesn't exist
if not exist "wasm_exec.js" (
    echo Creating wasm_exec.js...
    (
        echo // Go WASM Runtime - Simplified version
        echo // This is a minimal implementation for the lighter signer
        echo.
        echo const go = new Go^(^);
        echo.
        echo // Initialize WASM module
        echo async function initWasm^(wasmPath^) {
        echo     const wasmModule = await WebAssembly.instantiateStreaming^(fetch^(wasmPath^), go.importObject^);
        echo     go.run^(wasmModule.instance^);
        echo }
        echo.
        echo // Export functions for global access
        echo window.initWasm = initWasm;
        echo window.go = go;
    ) > wasm_exec.js
)

echo Build complete!
echo Files created:
echo   - lighter-signer.wasm (WASM binary)
echo   - wasm_exec.js (Go WASM runtime)
echo.
echo To use in your TypeScript project:
echo   1. Copy both files to your project's public/static directory
echo   2. Load wasm_exec.js before loading your WASM module
echo   3. Use the exported functions: generateAPIKey, createClient, signCreateOrder, signCancelOrder, createAuthToken

