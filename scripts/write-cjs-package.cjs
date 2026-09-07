#!/usr/bin/env node

/**
 * The root package.json declares "type": "module", which applies to EVERY .js
 * file in the package -- including the CommonJS build under dist/cjs. Node then
 * parses those files as ESM and `require('lighter-ts-sdk')` dies on the first
 * internal require. Dropping a scoped {"type":"commonjs"} beside the CJS output
 * is the standard dual-package fix: it overrides the root field for that subtree
 * only, and leaves dist/esm and dist/browser as ESM.
 *
 * Emitted by the build rather than committed, because `rm -rf dist` would
 * otherwise silently take it away and ship a broken CJS entry point again.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'dist', 'cjs');
const TARGET = path.join(DIR, 'package.json');

if (!fs.existsSync(DIR)) {
  console.error('write-cjs-package: dist/cjs not found -- did build:cjs run?');
  process.exit(1);
}

fs.writeFileSync(TARGET, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8');
console.log('write-cjs-package: wrote dist/cjs/package.json (type=commonjs)');
