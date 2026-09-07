/**
 * Packaging regression tests.
 *
 * Every bug guarded here shipped in v1.0.13 and was invisible to `npm test`,
 * `tsc --noEmit`, and code review alike -- they only appear when someone
 * actually installs the tarball. That makes them exactly the kind of thing that
 * needs a cheap source-level guard rather than a promise to remember.
 *
 * These assert on build CONFIGURATION rather than on dist/, because dist/ is
 * gitignored and absent on a clean checkout; a test that silently skips when
 * the build has not run would guard nothing.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('dual-package CJS/ESM layout', () => {
  it('declares the package as ESM, which is what makes the marker necessary', () => {
    // If this ever changes to commonjs the marker below becomes redundant
    // rather than wrong -- but the reasoning in write-cjs-package.cjs would be
    // stale, so fail and make someone read it.
    expect(pkg.type).toBe('module');
  });

  it('emits a type=commonjs marker beside the CJS build', () => {
    // Without dist/cjs/package.json, Node applies the root "type": "module" to
    // dist/cjs/*.js, parses them as ESM, and require('lighter-ts-sdk') dies on
    // the first internal require. Every CJS consumer, 100% of the time.
    expect(pkg.scripts['build:cjs']).toContain('write-cjs-package.cjs');
    expect(fs.existsSync(path.join(ROOT, 'scripts', 'write-cjs-package.cjs'))).toBe(true);
  });

  it('writes the marker as part of build:cjs, not a separate step someone can skip', () => {
    // A standalone script in the chain could be reordered or dropped; chaining
    // it to the tsc invocation keeps the output and its marker atomic.
    expect(pkg.scripts['build:cjs']).toMatch(/tsc -p tsconfig\.cjs\.json\s*&&\s*node scripts\/write-cjs-package\.cjs/);
  });

  it('gives each entry condition its own type declarations', () => {
    // A single top-level "types" pointing at the ESM .d.ts makes node16
    // consumers of the CJS build see ESM declarations.
    const root = pkg.exports['.'];
    expect(root.import.types).toBe('./dist/esm/index.d.ts');
    expect(root.require.types).toBe('./dist/cjs/index.d.ts');
    expect(root.import.default).toBe('./dist/esm/index.js');
    expect(root.require.default).toBe('./dist/cjs/index.js');
  });

  it('ships the WASM signer, without which nothing can sign an order', () => {
    expect(pkg.files).toContain('wasm');
    expect(fs.existsSync(path.join(ROOT, 'wasm', 'lighter-signer.wasm'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'wasm', 'wasm_exec.js'))).toBe(true);
  });
});

describe('fix-esm-imports specifier resolution', () => {
  const SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'fix-esm-imports.cjs'), 'utf8');

  it('checks the filesystem instead of blindly appending .js', () => {
    // `./foo` may mean ./foo.js OR ./foo/index.js. Appending .js unconditionally
    // broke every directory import; src/attribution/ shipped that way.
    expect(SRC).toContain("'/index.js'");
    expect(SRC).toMatch(/existsSync/);
  });

  it('fails the build on an unresolvable specifier rather than warning', () => {
    // The original silently emitted a broken specifier, so the error surfaced
    // in a consumer's bundler rather than in our build.
    expect(SRC).toMatch(/process\.exit\(1\)/);
  });

  it('resolves a directory import to /index.js and a file import to .js', () => {
    // Drive the real script against a real temp tree -- asserting on its source
    // text alone would not catch a logic inversion.
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'esmfix-'));
    const dist = path.join(tmp, 'dist', 'esm');
    fs.mkdirSync(path.join(dist, 'pkg'), { recursive: true });
    fs.mkdirSync(path.join(dist, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'pkg', 'index.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(dist, 'sub', 'leaf.js'), 'export const b = 2;\n');
    fs.writeFileSync(
      path.join(dist, 'entry.js'),
      "import { a } from './pkg';\nimport { b } from './sub/leaf';\n",
    );

    const script = path.join(tmp, 'scripts', 'fix-esm-imports.cjs');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'fix-esm-imports.cjs'), script);

    const { status } = require('child_process').spawnSync(process.execPath, [script], {
      encoding: 'utf8',
    });
    const out = fs.readFileSync(path.join(dist, 'entry.js'), 'utf8');

    expect(status).toBe(0);
    expect(out).toContain("from './pkg/index.js'");
    expect(out).toContain("from './sub/leaf.js'");
    expect(out).not.toContain("'./pkg.js'");

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('exits nonzero when a specifier resolves to neither form', () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'esmfix-bad-'));
    const dist = path.join(tmp, 'dist', 'esm');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'entry.js'), "import { x } from './ghost';\n");

    const script = path.join(tmp, 'scripts', 'fix-esm-imports.cjs');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'fix-esm-imports.cjs'), script);

    const res = require('child_process').spawnSync(process.execPath, [script], {
      encoding: 'utf8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('ghost');

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('published surface', () => {
  it('does not publish the .env file under any files/ignore combination', () => {
    // Belt and braces: .npmignore is the real guard, but `files` winning over
    // it in some npm versions is exactly the kind of thing that leaks a key.
    const npmignore = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
    expect(npmignore).toMatch(/^\.env$/m);
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(pkg.files).not.toContain('.env');
  });

  it('runs the full verify gate plus the build before publishing', () => {
    expect(pkg.scripts.prepublishOnly).toContain('verify');
    expect(pkg.scripts.prepublishOnly).toContain('build');
    expect(pkg.scripts.prepublishOnly).toContain('verify:wasm');
  });
});

describe('consumer-reachable subpaths', () => {
  // An "exports" map is a whitelist: the moment it exists, every path NOT
  // listed becomes unreachable, even when `files` faithfully ships it. That
  // mismatch is silent -- npm pack shows the file present and the consumer
  // still gets ERR_PACKAGE_PATH_NOT_EXPORTED. It shipped that way: the 13.9 MB
  // signer binary was in the tarball and unreachable from the outside.

  it('keeps the root entry intact', () => {
    // Everything below is additive; if a refactor collapses "." these guards
    // would still pass while the package became unusable.
    expect(pkg.exports['.'].import.default).toBe('./dist/esm/index.js');
    expect(pkg.exports['.'].require.default).toBe('./dist/cjs/index.js');
  });

  it('exports every shipped asset directory that is not reachable via "."', () => {
    // wasm/ is in `files` but is not part of the JS entry graph, so it can
    // ONLY be reached by subpath. Browser and bundler users must copy the
    // binary into their own static assets, which means resolving it first.
    expect(pkg.files).toContain('wasm');
    expect(pkg.exports['./wasm/*']).toBe('./wasm/*');
  });

  it('exports package.json, which tooling resolves as a subpath', () => {
    // Bundlers, jest resolvers and framework loaders routinely do
    // require.resolve('lighter-ts-sdk/package.json'). Node blocks it unless it
    // is listed, and the failure surfaces inside someone else's toolchain.
    expect(pkg.exports['./package.json']).toBe('./package.json');
  });

  it('has no exports entry pointing at a path outside files', () => {
    // A subpath export that `files` does not ship is the same bug inverted:
    // resolvable in the repo, missing from the tarball.
    const shipped: string[] = pkg.files.filter((f: string) => !f.startsWith('!'));
    for (const [key, value] of Object.entries(pkg.exports)) {
      if (typeof value !== 'string' || key === './package.json') continue;
      const top = value.replace(/^\.\//, '').split('/')[0] as string;
      expect(shipped).toContain(top);
    }
  });
});
