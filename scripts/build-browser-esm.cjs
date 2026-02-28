#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_ESM = path.join(PROJECT_ROOT, 'dist', 'esm');
const DIST_BROWSER = path.join(PROJECT_ROOT, 'dist', 'browser');
const ENTRY_POINT = path.join(DIST_ESM, 'index.js');

console.log('🔨 Building Browser ESM bundle...\n');

if (!fs.existsSync(ENTRY_POINT)) {
  console.error('❌ dist/esm/index.js not found. Run build:esm first.');
  process.exit(1);
}

if (!fs.existsSync(DIST_BROWSER)) {
  fs.mkdirSync(DIST_BROWSER, { recursive: true });
}

try {
  const esbuild = require('esbuild');

  esbuild.buildSync({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    format: 'esm',
    outfile: path.join(DIST_BROWSER, 'lighter-ts-sdk.browser.js'),
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
      '.wasm': 'binary'
    },
    define: {
      'process.env.NODE_ENV': '"browser"'
    }
  });

  const demo = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Browser ESM Import Check</title>
</head>
<body>
  <pre id="out">running...</pre>
  <script type="module">
    import { SignerClient } from './lighter-ts-sdk.browser.js';
    console.log('SignerClient:', SignerClient);
    const ok = typeof SignerClient === 'function';
    document.body.setAttribute('data-result', ok ? 'ok' : 'fail');
    document.getElementById('out').textContent = ok
      ? 'OK: SignerClient import path works in browser ESM bundle'
      : 'FAIL: SignerClient export missing';
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(DIST_BROWSER, 'index.html'), demo, 'utf8');

  console.log('✅ Browser ESM bundle created: dist/browser/lighter-ts-sdk.browser.js');
  console.log('✅ Browser ESM demo created: dist/browser/index.html\n');
} catch (error) {
  console.error('❌ Browser ESM build failed:', error.message);
  process.exit(1);
}
