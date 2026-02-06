#!/usr/bin/env node
/**
 * Lighter Protocol - Rust WASM Build Script
 * 
 * This script builds the Rust WebAssembly signer for Lighter Protocol.
 * 
 * Source Code: lighter-rust/signer-wasm/
 * Build Documentation: lighter-wasm/BUILD.md
 * 
 * What it does:
 * 1. Verifies wasm-pack is installed (installs if needed)
 * 2. Compiles Rust code for Node.js target (CommonJS)
 * 3. Compiles Rust code for Web target (ESM)
 * 4. Copies binaries to lighter-wasm/ for distribution
 * 
 * Usage:
 *   npm run build:wasm              # Recommended: Full build
 *   npm run build:wasm:clean        # Clean rebuild from scratch
 *   npm run build:wasm:direct       # Direct wasm-pack (advanced)
 *   npm run build:wasm:dev          # Faster unoptimized build
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const wasmDir = path.join(projectRoot, 'wasm');
const lighterRustDir = path.join(projectRoot, 'lighter-rust');

function run(cmd, args, options = {}) {
  console.log(`Running: ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

function ensureWasmDir() {
  if (!fs.existsSync(wasmDir)) {
    fs.mkdirSync(wasmDir, { recursive: true });
  }
}

function buildRustWasm() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🦀 Lighter Protocol Rust WASM Builder               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('📍 Source: lighter-rust/signer-wasm/');
  console.log('📍 Output: lighter-wasm/\n');
  
  ensureWasmDir();

  // Check if wasm-pack is installed
  try {
    execSync('wasm-pack --version', { stdio: 'pipe' });
    console.log('✅ wasm-pack found\n');
  } catch (error) {
    console.log('⚠️  wasm-pack not found. Installing...\n');
    run('cargo', ['install', 'wasm-pack']);
    console.log();
  }

  // Verify lighter-rust directory exists
  if (!fs.existsSync(lighterRustDir)) {
    throw new Error(`lighter-rust directory not found at ${lighterRustDir}`);
  }

  const signerWasmDir = path.join(lighterRustDir, 'signer-wasm');
  if (!fs.existsSync(signerWasmDir)) {
    throw new Error(`signer-wasm directory not found at ${signerWasmDir}`);
  }

  // Build for both targets
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔨 Compiling for Node.js target...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  run('wasm-pack', [
    'build',
    signerWasmDir,
    '--target', 'nodejs',
    '--release',
    '--out-dir', path.join(wasmDir, 'rust-nodejs')
  ]);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔨 Compiling for Web target...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  run('wasm-pack', [
    'build',
    signerWasmDir,
    '--target', 'web',
    '--release',
    '--out-dir', path.join(wasmDir, 'rust-web')
  ]);

  // Copy to lighter-wasm distribution directory
  const nodeOutputWasm = path.join(wasmDir, 'rust-nodejs', 'signer_wasm.wasm');
  const nodeOutputJs = path.join(wasmDir, 'rust-nodejs', 'signer_wasm.js');
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 Distributing binaries...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (fs.existsSync(nodeOutputWasm)) {
    fs.copyFileSync(nodeOutputWasm, path.join(wasmDir, 'lighter-signer.wasm'));
    console.log('✅ Copied WASM binary to wasm/lighter-signer.wasm');
  }

  if (fs.existsSync(nodeOutputJs)) {
    fs.copyFileSync(nodeOutputJs, path.join(wasmDir, 'lighter-signer.js'));
    console.log('✅ Copied JS glue to wasm/lighter-signer.js');
  }

  // Report build artifacts
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Rust WASM Build Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('📂 Output Directories:');
  console.log(`   • Node.js:  ${path.join(wasmDir, 'rust-nodejs')}/`);
  console.log(`   • Web:      ${path.join(wasmDir, 'rust-web')}/`);
  console.log(`   • Package:  ${wasmDir}/\n`);

  console.log('🔍 Next Steps:');
  console.log('   1. Verify build: npm run verify:wasm');
  console.log('   2. Test usage:   npm test');
  console.log('   3. See docs:     See lighter-wasm/BUILD.md\n');
  
  console.log('📖 Documentation:');
  console.log('   • lighter-wasm/BUILD.md - WASM package guide');
  console.log('   • lighter-rust/signer-wasm/BUILD.md - Rust build guide\n');
}

try {
  buildRustWasm();
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}

