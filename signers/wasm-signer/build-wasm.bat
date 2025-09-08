@echo off
REM Build script for lighter-go WASM signer (Windows)

echo Building lighter-go WASM signer...

REM Set Go environment for WASM
set GOOS=js
set GOARCH=wasm

REM Build the WASM binary
echo Compiling Go to WASM...
go build -o lighter-signer.wasm ./main.go

REM Copy the Go WASM runtime
echo Copying Go WASM runtime...
for /f "tokens=*" %%i in ('go env GOROOT') do set GOROOT=%%i
copy "%GOROOT%\misc\wasm\wasm_exec.js" .

echo Build complete!
echo Files created:
echo   - lighter-signer.wasm (WASM binary)
echo   - wasm_exec.js (Go WASM runtime)
echo.
echo To use in your TypeScript project:
echo   1. Copy both files to your project's public/static directory
echo   2. Load wasm_exec.js before loading your WASM module
echo   3. Use the exported functions: generateAPIKey, createClient, signCreateOrder, signCancelOrder, createAuthToken

