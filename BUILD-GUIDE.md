# Build & Compilation Guide

This guide covers all aspects of building and compiling the Lighter TypeScript SDK, including the WASM signer for Windows compatibility.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [TypeScript Compilation](#typescript-compilation)
3. [WASM Signer Build](#wasm-signer-build)
4. [Build Scripts](#build-scripts)
5. [Output Structure](#output-structure)
6. [Development Workflow](#development-workflow)
7. [Production Build](#production-build)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software
- **Node.js**: Version 16.0+ (for WebAssembly support)
- **TypeScript**: Version 5.0+ (installed via npm)
- **Go**: Version 1.23+ (for WASM signer build)
- **Git**: For cloning repositories

### Installation Commands
```bash
# Install Node.js (choose your platform)
# Windows: Download from nodejs.org or use winget
winget install OpenJS.NodeJS

# macOS: Use Homebrew
brew install node

# Linux: Use package manager
sudo apt install nodejs npm

# Install Go
# Windows
winget install GoLang.Go

# macOS
brew install go

# Linux
sudo apt install golang-go

# Verify installations
node --version    # Should be 16.0+
npm --version     # Should be 8.0+
go version        # Should be 1.23+
```

## TypeScript Compilation

### Project Configuration
The SDK uses a strict TypeScript configuration in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Compilation Commands
```bash
# Clean previous build
npm run clean

# Compile TypeScript
npm run build

# Watch mode for development
npm run dev

# Check types without emitting
npx tsc --noEmit
```

### Build Process
1. **Type Checking**: Validates all TypeScript types
2. **Compilation**: Converts TypeScript to JavaScript
3. **Declaration Generation**: Creates `.d.ts` files
4. **Source Maps**: Generates `.map` files for debugging
5. **Output**: Places compiled files in `dist/` directory

## WASM Signer Build

### Overview
The WASM signer compiles Go cryptographic libraries to WebAssembly, enabling Windows compatibility.

### Build Prerequisites
```bash
# Verify Go installation
go version

# Set Go environment (if needed)
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin
```

### Build Process

#### Step 1: Clone lighter-go Repository
```bash
# Clone the repository
git clone https://github.com/elliottech/lighter-go.git
cd lighter-go

# Verify repository structure
ls -la
# Should see: main.go, go.mod, go.sum, build scripts
```

#### Step 2: Build WASM Binary

**Windows:**
```bash
# Run Windows build script
./build-wasm.bat

# Or manual build
set GOOS=js
set GOARCH=wasm
go build -o lighter-signer.wasm ./wasm/main.go
copy "%GOROOT%\misc\wasm\wasm_exec.js" .
```

**Unix/Linux/macOS:**
```bash
# Run Unix build script
./build-wasm.sh

# Or manual build
export GOOS=js
export GOARCH=wasm
go build -o lighter-signer.wasm ./wasm/main.go
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" .
```

#### Step 3: Verify Build Output
```bash
# Check generated files
ls -la *.wasm *.js

# Expected output:
# lighter-signer.wasm    (approximately 3.02 MB)
# wasm_exec.js          (Go WASM runtime)
```

#### Step 4: Copy to Project
```bash
# Copy WASM files to your TypeScript project
cp lighter-signer.wasm /path/to/lighter-ts-standalone/
cp wasm_exec.js /path/to/lighter-ts-standalone/

# Verify files are accessible
ls -la lighter-signer.wasm wasm_exec.js
```

### Build Scripts

The repository includes automated build scripts:

#### Windows Build Script (`build-wasm.bat`)
```batch
@echo off
echo Building WASM signer for Windows...

set GOOS=js
set GOARCH=wasm

echo Compiling Go to WASM...
go build -o lighter-signer.wasm ./wasm/main.go

echo Copying WASM runtime...
copy "%GOROOT%\misc\wasm\wasm_exec.js" .

echo Build complete!
echo Generated files:
echo - lighter-signer.wasm
echo - wasm_exec.js
```

#### Unix Build Script (`build-wasm.sh`)
```bash
#!/bin/bash
echo "Building WASM signer for Unix/Linux/macOS..."

export GOOS=js
export GOARCH=wasm

echo "Compiling Go to WASM..."
go build -o lighter-signer.wasm ./wasm/main.go

echo "Copying WASM runtime..."
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" .

echo "Build complete!"
echo "Generated files:"
echo "- lighter-signer.wasm"
echo "- wasm_exec.js"
```

### Cross-Platform Build
```bash
# Build for all platforms
./build-all-platforms.sh

# Or on Windows
./build-all-platforms.bat
```

## Build Scripts

### Package.json Scripts
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rimraf dist",
    "prepublishOnly": "npm run clean && npm run build",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

### Custom Build Scripts
```bash
# Full build with cleanup
npm run clean && npm run build

# Build with linting
npm run lint && npm run build

# Build with testing
npm run test && npm run build

# Development build with watch
npm run dev
```

### Build Verification
```bash
# Verify build output
ls -la dist/

# Expected structure:
# dist/
# ├── index.js
# ├── index.d.ts
# ├── index.js.map
# ├── index.d.ts.map
# ├── api/
# ├── signer/
# ├── types/
# └── utils/

# Test build output
node dist/index.js
```

## Output Structure

### Compiled Output
```
dist/
├── index.js              # Main entry point
├── index.d.ts            # Type definitions
├── index.js.map          # Source map
├── index.d.ts.map        # Declaration map
├── api/                  # API client classes
│   ├── account-api.js
│   ├── account-api.d.ts
│   ├── order-api.js
│   ├── order-api.d.ts
│   └── ...
├── signer/               # Signing functionality
│   ├── signer-client.js
│   ├── signer-client.d.ts
│   ├── wasm-signer-client.js
│   └── wasm-signer-client.d.ts
├── types/                # Type definitions
│   ├── index.js
│   ├── index.d.ts
│   └── ...
└── utils/                # Utility functions
    ├── configuration.js
    ├── configuration.d.ts
    └── ...
```

### WASM Files
```
lighter-ts-standalone/
├── lighter-signer.wasm   # WASM binary (3.02 MB)
├── wasm_exec.js          # Go WASM runtime
└── dist/                 # Compiled TypeScript
```

### Source Maps
Source maps are generated for debugging:
- `.js.map` files map compiled JavaScript back to TypeScript
- `.d.ts.map` files map declaration files back to source

## Development Workflow

### 1. Initial Setup
```bash
# Clone repository
git clone https://github.com/elliottech/lighter-ts.git
cd lighter-ts

# Install dependencies
npm install

# Set up environment
cp env.example .env
# Edit .env with your values
```

### 2. Development Mode
```bash
# Start watch mode
npm run dev

# In another terminal, run tests
npm run test:watch

# Run examples
npm run example:api-only
```

### 3. Code Quality
```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type check
npx tsc --noEmit
```

### 4. Testing
```bash
# Run all tests
npm test

# Run specific test
npm test -- --testPathPattern=api-client

# Run with coverage
npm test -- --coverage
```

### 5. Build Verification
```bash
# Clean build
npm run clean
npm run build

# Verify output
ls -la dist/
node dist/index.js
```

## Production Build

### Build Process
```bash
# Clean previous builds
npm run clean

# Install production dependencies
npm install --production

# Build the project
npm run build

# Verify build
npm run test
```

### Build Optimization
```bash
# Minify JavaScript (if needed)
npm install --save-dev terser
npx terser dist/index.js -o dist/index.min.js

# Bundle for browser (if needed)
npm install --save-dev webpack webpack-cli
npx webpack --mode=production
```

### Docker Build
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY lighter-signer.wasm ./
COPY wasm_exec.js ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Build Verification
```bash
# Test production build
NODE_ENV=production node dist/index.js

# Check file sizes
ls -lh dist/
ls -lh lighter-signer.wasm wasm_exec.js

# Verify imports work
node -e "console.log(require('./dist/index.js'))"
```

## Troubleshooting

### Common Build Issues

#### TypeScript Compilation Errors
```bash
# Error: Cannot find module
# Solution: Check import paths and dependencies
npm install
npm run build

# Error: Type errors
# Solution: Fix type issues
npm run lint
npx tsc --noEmit
```

#### WASM Build Issues
```bash
# Error: Go not found
# Solution: Install Go and verify PATH
go version
which go

# Error: Permission denied
# Solution: Check file permissions
chmod +x build-wasm.sh
./build-wasm.sh

# Error: WASM files not found
# Solution: Verify build output
ls -la *.wasm *.js
```

#### Runtime Issues
```bash
# Error: Cannot load WASM
# Solution: Check file paths and WebAssembly support
node --version  # Should be 16.0+
ls -la lighter-signer.wasm wasm_exec.js
```

### Debug Build Process
```bash
# Verbose TypeScript compilation
npx tsc --verbose

# Debug Go build
go build -v -o lighter-signer.wasm ./wasm/main.go

# Check build output
file lighter-signer.wasm
hexdump -C lighter-signer.wasm | head
```

### Performance Optimization
```bash
# Optimize Go build
go build -ldflags="-s -w" -o lighter-signer.wasm ./wasm/main.go

# Compress WASM (optional)
npm install -g wasm-opt
wasm-opt lighter-signer.wasm -o lighter-signer-opt.wasm
```

### Build Environment Issues
```bash
# Check environment
echo $GOPATH
echo $GOROOT
go env

# Reset Go environment
unset GOPATH
export GOROOT=$(go env GOROOT)
export PATH=$PATH:$GOROOT/bin
```

### Cross-Platform Issues
```bash
# Windows: Use forward slashes in paths
wasmPath: './lighter-signer.wasm'

# Unix: Check file permissions
chmod 644 lighter-signer.wasm
chmod 644 wasm_exec.js

# Browser: Check CORS and MIME types
# Serve WASM files with correct MIME type
```

---

## Next Steps

1. **Verify Build**: Run `npm run build` and check output
2. **Test WASM**: Run `npm run example:test-wasm-signer`
3. **Run Examples**: Execute various examples to verify functionality
4. **Deploy**: Use the production build process for deployment

For more information, see:
- [Developer Guide](./DEVELOPER-GUIDE.md)
- [WASM Signer README](./WASM-SIGNER-README.md)
- [Examples README](./examples/README.md)
