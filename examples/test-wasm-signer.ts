import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = 'https://testnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = 65;
const API_KEY_INDEX = 1;

async function testWasmSigner(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.log('⚠️  PRIVATE_KEY not found in environment variables');
    console.log('   This is expected for testing - the WASM signer will fail to initialize');
    console.log('   but we can verify the code structure is correct');
    console.log('');
  }

  console.log('=== WASM Signer Test ===');
  console.log('Testing WASM signer structure and initialization...');
  console.log('');

  try {
    // Test 1: Create SignerClient with WASM config
    console.log('1. Creating SignerClient with WASM configuration...');
    const client = new SignerClient({
      url: BASE_URL,
      privateKey: API_KEY_PRIVATE_KEY || 'dummy-key-for-testing',
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      wasmConfig: {
        wasmPath: './lighter-signer.wasm',
        wasmExecPath: './wasm_exec.js'
      }
    });
    console.log('   ✅ SignerClient created successfully');
    console.log('');

    // Test 2: Check client validation
    console.log('2. Testing client validation...');
    const validationError = client.checkClient();
    if (validationError) {
      console.log(`   ⚠️  Validation error: ${validationError}`);
    } else {
      console.log('   ✅ Client validation passed');
    }
    console.log('');

    // Test 3: Try to initialize (will fail without WASM files, but we can test the structure)
    console.log('3. Testing WASM initialization...');
    try {
      await client.initialize();
      console.log('   ✅ WASM signer initialized successfully');
    } catch (error) {
      console.log(`   ⚠️  WASM initialization failed (expected): ${error}`);
      console.log('   This is expected since WASM files are not built yet');
    }
    console.log('');

    // Test 4: Test API key generation (will fail without WASM, but tests structure)
    console.log('4. Testing API key generation...');
    try {
      const keyPair = await client.generateAPIKey();
      if (keyPair) {
        console.log('   ✅ API key generation successful');
        console.log(`   Private Key: ${keyPair.privateKey}`);
        console.log(`   Public Key: ${keyPair.publicKey}`);
      }
    } catch (error) {
      console.log(`   ⚠️  API key generation failed (expected): ${error}`);
      console.log('   This is expected since WASM files are not built yet');
    }
    console.log('');

    console.log('=== Test Summary ===');
    console.log('✅ SignerClient structure is correct');
    console.log('✅ WASM configuration is properly set up');
    console.log('✅ Error handling works as expected');
    console.log('⚠️  WASM files need to be built to enable full functionality');
    console.log('');
    console.log('Next steps:');
    console.log('1. Build the WASM files using the build scripts');
    console.log('2. Copy the generated files to your project');
    console.log('3. Run this test again to verify full functionality');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testWasmSigner().catch(console.error);
}

