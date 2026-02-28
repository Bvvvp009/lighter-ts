#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'dist', 'esm');

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function shouldRewrite(specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return false;
  }
  if (specifier.endsWith('.js') || specifier.endsWith('.mjs') || specifier.endsWith('.cjs')) {
    return false;
  }
  if (specifier.endsWith('.json') || specifier.endsWith('.wasm')) {
    return false;
  }
  return true;
}

function rewriteContent(content) {
  return content
    .replace(/(from\s+['"])(\.{1,2}\/[^'"\n]+)(['"])/g, (m, p1, spec, p3) => {
      if (!shouldRewrite(spec)) return m;
      return `${p1}${spec}.js${p3}`;
    })
    .replace(/(import\s*\(\s*['"])(\.{1,2}\/[^'"\n]+)(['"]\s*\))/g, (m, p1, spec, p3) => {
      if (!shouldRewrite(spec)) return m;
      return `${p1}${spec}.js${p3}`;
    })
    .replace(/(export\s+\*\s+from\s+['"])(\.{1,2}\/[^'"\n]+)(['"])/g, (m, p1, spec, p3) => {
      if (!shouldRewrite(spec)) return m;
      return `${p1}${spec}.js${p3}`;
    })
    .replace(/(export\s+\{[^}]*\}\s+from\s+['"])(\.{1,2}\/[^'"\n]+)(['"])/g, (m, p1, spec, p3) => {
      if (!shouldRewrite(spec)) return m;
      return `${p1}${spec}.js${p3}`;
    });
}

function run() {
  if (!fs.existsSync(ROOT)) {
    console.log('fix-esm-imports: dist/esm not found, skipping');
    return;
  }

  const files = listFiles(ROOT);
  let changed = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const updated = rewriteContent(original);
    if (updated !== original) {
      fs.writeFileSync(file, updated, 'utf8');
      changed += 1;
    }
  }

  console.log(`fix-esm-imports: processed=${files.length} changed=${changed}`);
}

run();
