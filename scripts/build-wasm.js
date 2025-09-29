const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const projectRoot = path.join(__dirname, '..');
const goDir = path.join(projectRoot, 'temp-lighter-go');
const outWasm = path.join(projectRoot, 'wasm', 'lighter-signer.wasm');

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

// Ensure GOOS/GOARCH
const env = { ...process.env, GOOS: 'js', GOARCH: 'wasm' };

// Build
run(process.platform === 'win32' ? 'go.exe' : 'go', ['build', '-o', outWasm, './wasm'], { cwd: goDir, env });

console.log('Built wasm ->', outWasm);
