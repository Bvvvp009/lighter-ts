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

function alreadyExplicit(specifier) {
  return (
    specifier.endsWith('.js') ||
    specifier.endsWith('.mjs') ||
    specifier.endsWith('.cjs') ||
    specifier.endsWith('.json') ||
    specifier.endsWith('.wasm')
  );
}

/**
 * Node ESM needs a real file path, and `./foo` can mean either `./foo.js` or
 * `./foo/index.js`. Appending `.js` unconditionally silently breaks every
 * directory import -- `src/attribution/` shipped that way and only surfaced
 * when the browser bundler refused to resolve `../attribution.js`. So ask the
 * filesystem which one exists instead of guessing.
 *
 * Returns the rewritten specifier, or null if neither form is on disk.
 */
function resolveSpecifier(specifier, fileDir) {
  const base = path.resolve(fileDir, specifier);
  if (fs.existsSync(base + '.js')) return specifier + '.js';
  if (fs.existsSync(path.join(base, 'index.js'))) return specifier + '/index.js';
  return null;
}

const PATTERNS = [
  /(from\s+['"])(\.{1,2}\/[^'"\n]+)(['"])/g,
  /(import\s*\(\s*['"])(\.{1,2}\/[^'"\n]+)(['"]\s*\))/g,
  /(export\s+\*\s+from\s+['"])(\.{1,2}\/[^'"\n]+)(['"])/g,
  /(export\s+\{[^}]*\}\s+from\s+['"])(\.{1,2}\/[^'"\n]+)(['"])/g,
];

function rewriteContent(content, fileDir, unresolved) {
  let out = content;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match, pre, spec, post) => {
      if (alreadyExplicit(spec)) return match;
      const resolved = resolveSpecifier(spec, fileDir);
      if (resolved === null) {
        unresolved.push(spec);
        return match;
      }
      return `${pre}${resolved}${post}`;
    });
  }
  return out;
}

function run() {
  if (!fs.existsSync(ROOT)) {
    console.log('fix-esm-imports: dist/esm not found, skipping');
    return;
  }

  const files = listFiles(ROOT);
  let changed = 0;
  const problems = [];

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const unresolved = [];
    const updated = rewriteContent(original, path.dirname(file), unresolved);
    for (const spec of unresolved) {
      problems.push(`${path.relative(ROOT, file)} -> ${spec}`);
    }
    if (updated !== original) {
      fs.writeFileSync(file, updated, 'utf8');
      changed += 1;
    }
  }

  console.log(`fix-esm-imports: processed=${files.length} changed=${changed}`);

  if (problems.length > 0) {
    console.error(
      '\nfix-esm-imports: these relative imports resolve to neither <spec>.js\n' +
        'nor <spec>/index.js, so the ESM build would fail at import time:\n' +
        problems.map((p) => `  ${p}`).join('\n') +
        '\n\nThis is a build error rather than a warning on purpose: an\n' +
        'unresolvable specifier breaks consumers at runtime, not here.\n',
    );
    process.exit(1);
  }
}

run();
