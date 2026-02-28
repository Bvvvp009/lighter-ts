const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const wasmDir = path.join(projectRoot, 'wasm');
const outWasm = path.join(wasmDir, 'lighter-signer.wasm');
// Use local lighter-go directory (must exist in project root)
const lighterGoDir = path.join(projectRoot, 'lighter-go');

function run(cmd, args, options = {}) {
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

function cloneLighterGo() {
  console.log('📥 Cloning lighter-go from GitHub...');
  const { execSync } = require('child_process');
  try {
    execSync(`git clone https://github.com/elliottech/lighter-go.git "${lighterGoDir}"`, {
      stdio: 'inherit',
      cwd: projectRoot
    });
    console.log('✅ Successfully cloned lighter-go');
  } catch (error) {
    throw new Error(`Failed to clone lighter-go: ${error.message}\n` +
      `Please ensure git is installed and you have network access.`);
  }
}

function verifyLighterGo() {
  if (!fs.existsSync(lighterGoDir)) {
    console.log('⚠️ lighter-go directory not found. Attempting to clone from GitHub...');
    cloneLighterGo();
  }
  
  const wasmPath = path.join(lighterGoDir, 'wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM directory not found in ${lighterGoDir}\n` +
      `Expected: ${wasmPath}`);
  }
  
  const wasmMainGo = path.join(wasmPath, 'main.go');
  if (!fs.existsSync(wasmMainGo)) {
    throw new Error(`WASM main.go not found at ${wasmMainGo}`);
  }
  
  console.log('✅ Verified lighter-go directory structure');
}

function buildWasm() {
  console.log('Building WASM from lighter-go...');
  
  // Ensure output directory exists
  ensureWasmDir();

  // Build WASM - use the same command as in lighter-go justfile
  const env = { ...process.env, GOOS: 'js', GOARCH: 'wasm' };
  const goCmd = process.platform === 'win32' ? 'go.exe' : 'go';
  
  // Run go mod vendor first (as per justfile)
  console.log('Running go mod vendor...');
  run(goCmd, ['mod', 'vendor'], { cwd: lighterGoDir, env });
  
  // Build WASM (trimpath flag matches justfile)
  console.log('Building WASM binary...');
  run(goCmd, ['build', '-trimpath', '-o', outWasm, './wasm'], { 
    cwd: lighterGoDir, 
    env 
  });

  console.log('✅ Built WASM ->', outWasm);
}

function copyWasmExec() {
  // Try to copy wasm_exec.js from Go installation
  try {
    const goroot = execSync('go env GOROOT').toString().trim();
    const candidates = [
      path.join(goroot, 'misc', 'wasm', 'wasm_exec.js'),
      path.join(goroot, 'lib', 'wasm', 'wasm_exec.js'),
    ];
    
    for (const src of candidates) {
      if (fs.existsSync(src)) {
        const dest = path.join(wasmDir, 'wasm_exec.js');
        fs.copyFileSync(src, dest);
        console.log('✅ Copied wasm_exec.js from', src);
        return;
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not copy wasm_exec.js automatically:', error.message);
    console.warn('   Please ensure wasm/wasm_exec.js exists');
  }
}

// Main build process
try {
  console.log('🚀 Building WASM signer from lighter-go...\n');
  
  // Verify lighter-go directory exists (auto-clone if needed)
  verifyLighterGo();
  
  // Verify structure after potential clone
  const wasmPath = path.join(lighterGoDir, 'wasm');
  const wasmMainGo = path.join(wasmPath, 'main.go');
  if (!fs.existsSync(wasmPath) || !fs.existsSync(wasmMainGo)) {
    throw new Error(`WASM directory structure invalid in ${lighterGoDir}\n` +
      `Expected: ${wasmMainGo}`);
  }
  
  // Build WASM
  buildWasm();
  
  // Copy wasm_exec.js if available
  copyWasmExec();
  
  console.log('\n✅ Build complete!');
  console.log(`   WASM file: ${outWasm}`);
  console.log(`   Source: ${lighterGoDir}`);
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
