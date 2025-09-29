const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const wasmPath = path.join(__dirname, '..', 'wasm', 'lighter-signer.wasm');
const execPathNode = path.join(__dirname, '..', 'wasm', 'wasm_exec_nodejs.js');
const execPath = path.join(__dirname, '..', 'wasm', 'wasm_exec.js');

let ok = true;

if (!fs.existsSync(wasmPath)) {
  console.error('Missing wasm artifact:', wasmPath);
  ok = false;
}

if (!fs.existsSync(execPathNode) && !fs.existsSync(execPath)) {
  // Try to vendor official Go runtime
  try {
    const goroot = execSync('go env GOROOT').toString().trim();
    const candidates = [
      path.join(goroot, 'misc', 'wasm', 'wasm_exec.js'),
      path.join(goroot, 'lib', 'wasm', 'wasm_exec.js'),
    ];
    for (const src of candidates) {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, execPath);
        console.log('Vendored official wasm_exec.js from', src);
        break;
      }
    }
  } catch (_) {
    // ignore
  }
  if (!fs.existsSync(execPathNode) && !fs.existsSync(execPath)) {
    console.error('Missing wasm runtime: expected wasm/wasm_exec_nodejs.js or wasm/wasm_exec.js');
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
} else {
  console.log('WASM artifacts verified.');
}
