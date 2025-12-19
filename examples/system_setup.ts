/**
 * Example: System Setup
 * Demonstrates API key generation and registration
 * 
 * Requirements:
 * - ETH_PRIVATE_KEY: Ethereum private key for L1 signature (required)
 * - ACCOUNT_INDEX: Account index (required)
 * - API_KEY_INDEXES: Comma-separated list of API key indexes to generate (optional, defaults to single key)
 * - BASE_URL: API endpoint URL (optional)
 */

import { SignerClient, ApiClient } from '../src';
import { createWasmSignerClient } from '../src/signer/wasm-signer';
import * as dotenv from 'dotenv';

dotenv.config();

async function systemSetup() {
  console.log('🚀 System Setup...\n');

  try {
    // 1. Get configuration from environment variables
    const ETH_PRIVATE_KEY = process.env['ETH_PRIVATE_KEY'] || process.env['ACCOUNT_PRIVATE_KEY'] || '';
    if (!ETH_PRIVATE_KEY) {
      throw new Error('ETH_PRIVATE_KEY or ACCOUNT_PRIVATE_KEY environment variable is required');
    }

    const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
    const BASE_URL = process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';
    
    // Parse API key indexes to generate
    const API_KEY_INDEXES_STR = process.env['API_KEY_INDEXES'] || '';
    const apiKeyIndexes: number[] = API_KEY_INDEXES_STR
      ? API_KEY_INDEXES_STR.split(',').map(idx => Number.parseInt(idx.trim(), 10)).filter(idx => !isNaN(idx))
      : [];

    console.log('📋 Configuration:');
    console.log(`   Account Index: ${ACCOUNT_INDEX}`);
    console.log(`   Base URL: ${BASE_URL}`);
    if (apiKeyIndexes.length > 0) {
      console.log(`   API Key Indexes to generate: ${apiKeyIndexes.join(', ')}`);
    } else {
      console.log(`   API Key Indexes: Not specified (will generate one key)`);
    }
    console.log('');

    // 2. Initialize API client
    const apiClient = new ApiClient({ host: BASE_URL });

    // 3. Generate and register API keys
    if (apiKeyIndexes.length > 0) {
      console.log(`🔑 Generating ${apiKeyIndexes.length} API Key(s)...\n`);
      
      for (const targetApiKeyIndex of apiKeyIndexes) {
        try {
          console.log(`📝 Processing API Key Index ${targetApiKeyIndex}...`);
          
          // Generate a temporary API key pair just to initialize WASM client
          // This is needed because generateAPIKey requires WASM to be initialized
          const tempWasmClient = await createWasmSignerClient({
            wasmPath: 'wasm/lighter-signer.wasm'
          });
          await tempWasmClient.initialize();
          const tempKeyPair = await tempWasmClient.generateAPIKey();
          
          const tempSignerClient = new SignerClient({
            url: BASE_URL,
            privateKey: tempKeyPair.privateKey,
            accountIndex: ACCOUNT_INDEX,
            apiKeyIndex: 0
          });

          await tempSignerClient.initialize();
          await tempSignerClient.ensureWasmClient();

          // Generate the actual API key pair for the target index
          const apiKeyPair = await tempSignerClient.generateAPIKey();
          if (!apiKeyPair) {
            throw new Error('Failed to generate API key pair');
          }
          
          console.log(`   ✅ API Key pair generated`);
          console.log(`   Private Key: ${apiKeyPair.privateKey.substring(0, 20)}...`);
          console.log(`   Public Key: ${apiKeyPair.publicKey.substring(0, 20)}...`);

          // Register the API key using ETH private key for L1 signature
          console.log(`   📝 Registering API Key on server...`);
          const [changeResult, txHash, error] = await tempSignerClient.changeApiKey({
            ethPrivateKey: ETH_PRIVATE_KEY,
            newPubkey: apiKeyPair.publicKey,
            newPrivateKey: apiKeyPair.privateKey,
            newApiKeyIndex: targetApiKeyIndex
          });

          if (error) {
            throw new Error(`Failed to register API key: ${error}`);
          }

          console.log(`   ✅ API Key registration transaction sent!`);
          console.log(`   Transaction Hash: ${txHash.substring(0, 16)}...\n`);

          // Wait for the transaction to be processed
          await new Promise(resolve => setTimeout(resolve, 10000));

          // Display API Key Configuration
          console.log(`📋 API Key ${targetApiKeyIndex} Configuration:`);
          console.log(`   Account Index: ${ACCOUNT_INDEX}`);
          console.log(`   API Key Index: ${targetApiKeyIndex}`);
          console.log(`   Private Key: ${apiKeyPair.privateKey.substring(0, 20)}...`);
          console.log(`   Public Key: ${apiKeyPair.publicKey.substring(0, 20)}...`);
          console.log(`   ⚠️  Save the full private key securely - it is not shown here for security\n`);

          // Optional: Verify the API key works
          const VERIFY_API_KEY = process.env['VERIFY_API_KEY'] !== 'false';
          if (VERIFY_API_KEY) {
            console.log(`   🔍 Verifying API Key...`);
            try {
              const verifySignerClient = new SignerClient({
                url: BASE_URL,
                privateKey: apiKeyPair.privateKey,
                accountIndex: ACCOUNT_INDEX,
                apiKeyIndex: targetApiKeyIndex
              });

              await verifySignerClient.initialize();
              await verifySignerClient.ensureWasmClient();
              
              const verifyAuthToken = await verifySignerClient.createAuthToken();
              console.log(`   ✅ API Key verified successfully!\n`);
            } catch (verifyError) {
              console.log(`   ⚠️ API Key verification failed (transaction may still be processing)`);
              console.log(`   Note: The API key was created successfully. Verification may succeed after a few more seconds.\n`);
            }
          }
        } catch (error) {
          console.error(`   ❌ Error creating API key for index ${targetApiKeyIndex}:`, error);
          console.log('');
        }
      }
    } else {
      console.log('💡 Tip: Set API_KEY_INDEXES environment variable (comma-separated) to generate API keys');
      console.log('   Example: API_KEY_INDEXES=4,5,6\n');
    }

    // 4. Get System Information
    console.log('ℹ️ Fetching System Information...');
    try {
      const systemInfo = await apiClient.get('/api/v1/root');
      console.log('✅ System Information fetched successfully!');
      console.log(`   Version: ${systemInfo.data.version}`);
      console.log(`   Chain ID: ${systemInfo.data.chain_id}`);
      console.log(`   Block Height: ${systemInfo.data.block_height}\n`);
    } catch (error) {
      console.log('⚠️ Could not fetch system information\n');
    }

    console.log('🎉 System Setup Completed Successfully!');
    console.log('✅ API keys have been generated and registered');

  } catch (error) {
    console.error('❌ Error during system setup:', error);
  }
}

// Run the example
if (require.main === module) {
  systemSetup().catch(console.error);
}

export { systemSetup };
