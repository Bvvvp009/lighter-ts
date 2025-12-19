/**
 * Example: Generate API Key Pair
 * 
 * This example demonstrates how to generate API key pairs (private/public keys)
 * from a seed using the WASM signer's GenerateAPIKey function.
 * 
 * The generated keys can be used for:
 * - Creating new API keys for your account
 * - Testing key generation
 * - Key rotation scenarios
 */

import { WasmSignerClient, WasmSignerConfig } from '../src/signer/wasm-signer';
import * as dotenv from 'dotenv';

dotenv.config();

async function generateAPIKeyExample() {
  console.log('🔑 API Key Generation Example\n');

  // WASM configuration (minimal - only needed for initialization)
  const wasmConfig: WasmSignerConfig = {
    wasmPath: process.env['WASM_PATH'] || './wasm/lighter-signer.wasm',
    wasmExecPath: process.env['WASM_EXEC_PATH'] || './wasm/wasm_exec.js',
  };

  const wasmClient = new WasmSignerClient(wasmConfig);

  try {
    // Initialize WASM client
    console.log('📦 Initializing WASM client...');
    await wasmClient.initialize();
    console.log('✅ WASM client initialized\n');

    // ============================================================================
    // Example 1: Generate from a simple seed
    // ============================================================================
    console.log('📋 Example 1: Generate from Simple Seed');
    const seed1 = 'my-secret-seed-123';
    console.log(`   Seed: "${seed1}"\n`);

    const keyPair1 = await wasmClient.generateAPIKey(seed1);
    if (keyPair1) {
      console.log('✅ Key pair generated:');
      console.log('   Private Key:', keyPair1.privateKey.substring(0, 20) + '...');
      console.log('   Public Key: ', keyPair1.publicKey.substring(0, 20) + '...');
      console.log('');
    } else {
      console.error('❌ Failed to generate key pair');
    }

    // ============================================================================
    // Example 2: Generate from a longer seed phrase
    // ============================================================================
    console.log('📋 Example 2: Generate from Seed Phrase');
    const seed2 = 'this-is-a-longer-seed-phrase-for-better-security-2024';
    console.log(`   Seed: "${seed2}"\n`);

    const keyPair2 = await wasmClient.generateAPIKey(seed2);
    if (keyPair2) {
      console.log('✅ Key pair generated:');
      console.log('   Private Key:', keyPair2.privateKey.substring(0, 20) + '...');
      console.log('   Public Key: ', keyPair2.publicKey.substring(0, 20) + '...');
      console.log('');
    } else {
      console.error('❌ Failed to generate key pair');
    }

    // ============================================================================
    // Example 3: Generate from timestamp-based seed
    // ============================================================================
    console.log('📋 Example 3: Generate from Timestamp Seed');
    const seed3 = `account-${Date.now()}-${Math.random()}`;
    console.log(`   Seed: "${seed3}"\n`);

    const keyPair3 = await wasmClient.generateAPIKey(seed3);
    if (keyPair3) {
      console.log('✅ Key pair generated:');
      console.log('   Private Key:', keyPair3.privateKey.substring(0, 20) + '...');
      console.log('   Public Key: ', keyPair3.publicKey.substring(0, 20) + '...');
      console.log('');
    } else {
      console.error('❌ Failed to generate key pair');
    }

    // ============================================================================
    // Example 4: Deterministic generation (same seed = same keys)
    // ============================================================================
    console.log('📋 Example 4: Deterministic Generation');
    const deterministicSeed = 'deterministic-seed-12345';
    console.log(`   Seed: "${deterministicSeed}"`);
    console.log('   (Generating twice to verify determinism)\n');

    const keyPair4a = await wasmClient.generateAPIKey(deterministicSeed);
    const keyPair4b = await wasmClient.generateAPIKey(deterministicSeed);

    if (keyPair4a && keyPair4b) {
      console.log('   First generation:');
      console.log('   Private Key:', keyPair4a.privateKey.substring(0, 20) + '...');
      console.log('   Public Key: ', keyPair4a.publicKey.substring(0, 20) + '...');
      console.log('');
      console.log('   Second generation:');
      console.log('   Private Key:', keyPair4b.privateKey.substring(0, 20) + '...');
      console.log('   Public Key: ', keyPair4b.publicKey.substring(0, 20) + '...');
      console.log('');

      if (
        keyPair4a.privateKey === keyPair4b.privateKey &&
        keyPair4a.publicKey === keyPair4b.publicKey
      ) {
        console.log('✅ Deterministic: Same seed produces same keys');
      } else {
        console.log('⚠️  Non-deterministic: Same seed produces different keys');
      }
    }

    console.log('\n📝 Notes:');
    console.log('   - The same seed will always generate the same key pair');
    console.log('   - Use a secure, unique seed for production keys');
    console.log('   - Store seeds securely - losing the seed means losing the keys');
    console.log('   - Private keys should be kept secret and never shared');
    console.log('   - Public keys can be shared and used for account setup');

    console.log('\n🎉 API key generation examples completed!');
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  }
}

if (require.main === module) {
  generateAPIKeyExample().catch(console.error);
}

export { generateAPIKeyExample };












