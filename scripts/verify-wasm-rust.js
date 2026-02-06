#!/usr/bin/env node
/**
 * Rust WASM Verification Script
 * Verifies that Rust WASM binaries are properly built and included
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.dirname(__dirname);
const wasmDir = path.join(projectRoot, 'wasm');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.log(`❌ ${message}`);
    failed++;
  }
}

console.log('🔍 Verifying Rust WASM Build...\n');

// Check main WASM binary
check(fs.existsSync(path.join(wasmDir, 'lighter-signer.wasm')), 'Main WASM binary exists');

// Check Node.js build
check(fs.existsSync(path.join(wasmDir, 'rust-nodejs')), 'Node.js build directory exists');
check(fs.existsSync(path.join(wasmDir, 'rust-nodejs', 'signer_wasm.wasm')), 'Node.js WASM binary exists');
check(fs.existsSync(path.join(wasmDir, 'rust-nodejs', 'signer_wasm.js')), 'Node.js JS glue code exists');

// Check Web build
check(fs.existsSync(path.join(wasmDir, 'rust-web')), 'Web build directory exists');
check(fs.existsSync(path.join(wasmDir, 'rust-web', 'signer_wasm.wasm')), 'Web WASM binary exists');
check(fs.existsSync(path.join(wasmDir, 'rust-web', 'signer_wasm.js')), 'Web JS glue code exists');

// Check Rust adapter
check(fs.existsSync(path.join(projectRoot, 'src', 'signer', 'rust-wasm-adapter.ts')), 'Rust WASM adapter exists');

// Check WASM signer client uses Rust
const wasmSignerClient = fs.readFileSync(path.join(projectRoot, 'src', 'signer', 'wasm-signer-client.ts'), 'utf8');
check(wasmSignerClient.includes('RustWasmOrderSigner'), 'Rust WASM adapter is imported');
check(wasmSignerClient.includes('routeWasmSigning'), 'Routing infrastructure present');

// Check package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
check(!packageJson.scripts['build:wasm:go'], 'Go build script removed from package.json');
check(packageJson.scripts['build:wasm'].includes('rust'), 'Rust is default build target');

// Check WASM binary size
const nodeBinary = path.join(wasmDir, 'rust-nodejs', 'signer_wasm.wasm');
if (fs.existsSync(nodeBinary)) {
  const stats = fs.statSync(nodeBinary);
  const sizeKb = (stats.size / 1024).toFixed(1);
  check(stats.size < 200000, `Binary size reasonable (${sizeKb} KB)`);
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.error('❌ Verification failed');
  process.exit(1);
}

console.log('✅ All checks passed! Rust WASM is ready.');
