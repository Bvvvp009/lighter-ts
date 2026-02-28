#!/usr/bin/env node

/**
 * UMD Bundle Builder for Lighter SDK
 * Builds a universal module bundle for browser, Node.js, and module loaders
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_ESM = path.join(PROJECT_ROOT, 'dist', 'esm');
const DIST_UMD = path.join(PROJECT_ROOT, 'dist', 'umd');
const WASM_DIR = path.join(PROJECT_ROOT, 'wasm');
const ENTRY_POINT = path.join(DIST_ESM, 'index.js');

console.log('🔨 Building UMD Bundle for Lighter SDK...\n');

// Check if esbuild is available
let hasBuild = false;
let buildTool = null;

try {
  require.resolve('esbuild');
  buildTool = 'esbuild';
  hasBuild = true;
} catch (e) {
  console.warn('⚠️  esbuild not found, will attempt to install...');
}

if (!hasBuild) {
  console.log('📦 Installing esbuild...');
  try {
    execSync('npm install --save-dev esbuild', { stdio: 'inherit', cwd: PROJECT_ROOT });
    buildTool = 'esbuild';
    hasBuild = true;
  } catch (e) {
    console.error('❌ Failed to install esbuild');
    process.exit(1);
  }
}

// Create dist/umd directory if it doesn't exist
if (!fs.existsSync(DIST_UMD)) {
  fs.mkdirSync(DIST_UMD, { recursive: true });
  console.log(`✅ Created ${DIST_UMD}`);
}

// Build with esbuild
try {
  console.log(`\n🔧 Building with ${buildTool}...\n`);

  const esbuild = require('esbuild');

  const buildOptions = {
    entryPoints: [ENTRY_POINT],
    bundle: true,
    format: 'iife',
    globalName: 'LighterSDK',
    outfile: path.join(DIST_UMD, 'lighter-ts-sdk.js'),
    platform: 'browser',
    target: ['es2020'],
    external: [
      'fs',
      'os',
      'path',
      'process',
      'crypto',
      'module',
      'node:fs',
      'node:os',
      'node:path',
      'node:module'
    ],
    sourcemap: true,
    minify: false,
    loader: {
      '.wasm': 'binary',
    },
    define: {
      'process.env.NODE_ENV': '"browser"'
    }
  };

  esbuild.buildSync(buildOptions);
  console.log('✅ ESM bundle created\n');

  // Create minified version
  buildOptions.outfile = path.join(DIST_UMD, 'lighter-ts-sdk.min.js');
  buildOptions.minify = true;
  buildOptions.sourcemap = 'external';

  esbuild.buildSync(buildOptions);
  console.log('✅ Minified bundle created\n');

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

// Copy WASM files to UMD dist
try {
  if (fs.existsSync(WASM_DIR)) {
    console.log('📦 Copying WASM files...');
    
    // Copy .wasm binary files
    const wasmFiles = fs.readdirSync(WASM_DIR).filter(f => f.endsWith('.wasm'));
    
    if (wasmFiles.length === 0) {
      console.warn('⚠️  No WASM files found in wasm/ directory');
    } else {
      wasmFiles.forEach(file => {
        const src = path.join(WASM_DIR, file);
        const dst = path.join(DIST_UMD, file);
        fs.copyFileSync(src, dst);
        console.log(`  ✅ ${file}`);
      });
    }
    
    // Copy wasm_exec.js (Go WASM runtime support)
    const wasmExecSrc = path.join(WASM_DIR, 'wasm_exec.js');
    if (fs.existsSync(wasmExecSrc)) {
      const wasmExecDst = path.join(DIST_UMD, 'wasm_exec.js');
      fs.copyFileSync(wasmExecSrc, wasmExecDst);
      console.log(`  ✅ wasm_exec.js`);
    } else {
      console.warn('⚠️  wasm_exec.js not found in wasm/ directory');
    }
  } else {
    console.warn('⚠️  wasm/ directory not found');
  }
} catch (error) {
  console.warn('⚠️  Could not copy WASM files:', error.message);
}

// Create package.json for UMD dist
const packageJson = {
  name: 'lighter-ts-sdk-browser',
  version: require(path.join(PROJECT_ROOT, 'package.json')).version,
  description: 'Browser bundle for Lighter Protocol TypeScript SDK',
  main: 'lighter-ts-sdk.js',
  types: '../esm/index.d.ts',
  files: ['lighter-ts-sdk.js', 'lighter-ts-sdk.min.js', '*.wasm', '*.map']
};

fs.writeFileSync(
  path.join(DIST_UMD, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);
console.log('✅ Created package.json\n');

// Create index.html demo
const demoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lighter SDK - Browser Bundle Demo</title>
    <style>
        body { font-family: monospace; padding: 20px; background: #f5f5f5; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 20px; border-radius: 5px; }
        h1 { color: #333; }
        .code { background: #f0f0f0; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .success { color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Lighter SDK - Browser Bundle Demo</h1>
        <p>This demonstrates loading the Lighter SDK in the browser using the UMD bundle.</p>
        
        <h2>Usage:</h2>
        <div class="code">
&lt;script src="lighter-ts-sdk.js"&gt;&lt;/script&gt;
&lt;script&gt;
  const sdk = window.LighterSDK;
  console.log('SDK loaded:', sdk);
&lt;/script&gt;
        </div>

        <h2>Available in window:</h2>
        <div id="exports"></div>

        <h2>Console Output:</h2>
        <div id="output"></div>
    </div>

    <script src="lighter-ts-sdk.js"></script>
    <script>
        const output = document.getElementById('output');
        const exports = document.getElementById('exports');

        function log(msg, type = 'info') {
            const div = document.createElement('div');
            div.className = type;
            div.textContent = msg;
            output.appendChild(div);
            console.log(msg);
        }

        try {
            const sdk = window.LighterSDK;
            log('✅ SDK Loaded Successfully', 'success');
            
            const keys = Object.keys(sdk).slice(0, 10);
            exports.innerHTML = '<ul>' + keys.map(k => '<li>' + k + '</li>').join('') + '</ul>';
            
            log('Available exports: ' + keys.join(', '));
        } catch (err) {
            log('❌ Error loading SDK: ' + err.message, 'error');
        }
    </script>
</body>
</html>`;

fs.writeFileSync(path.join(DIST_UMD, 'index.html'), demoHtml);
console.log('✅ Created index.html demo\n');

// Summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ UMD Build Complete!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📦 Output Files:');
console.log('  • dist/umd/lighter-ts-sdk.js (unminified)');
console.log('  • dist/umd/lighter-ts-sdk.min.js (minified)');
console.log('  • dist/umd/index.html (demo page)');
console.log('\n🌐 Usage in Browser:');
console.log('  <script src="lighter-ts-sdk.js"></script>');
console.log('  <script>');
console.log('    const sdk = window.LighterSDK;');
console.log('    // Use SDK classes like:');
console.log('    // - ApiClient');
console.log('    // - SignerClient');
console.log('    // - OrderApi');
console.log('  </script>');
console.log('\n✨ For bundlers (Vite, Next.js, Webpack):');
console.log('  import * as LighterSDK from "lighter-ts-sdk";');
console.log('\n');
