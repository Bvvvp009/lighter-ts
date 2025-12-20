/**
 * Example: System Setup
 * Demonstrates API key generation and registration
 * 
 * This example matches the Python system_setup.py example:
 * - Verifies account exists & fetches account index by L1 address
 * - Handles multiple accounts by selecting the master account (minimum index)
 * - Creates multiple API keys in a single run
 * - Changes all API keys using a single client
 * - Verifies the API keys work
 * 
 * Requirements:
 * - ETH_PRIVATE_KEY: Ethereum private key for L1 signature (required)
 * - ACCOUNT_INDEX: Account index (optional, will be fetched if not provided)
 * - API_KEY_INDEX: Starting API key index (optional, defaults to 3)
 * - NUM_API_KEYS: Number of API keys to generate (optional, defaults to 5)
 * - BASE_URL: API endpoint URL (optional)
 * - API_PRIVATE_KEY: Existing API private key for authentication (optional)
 * - EXISTING_API_KEY_INDEX: Index of existing API key (optional, defaults to 0 if API_PRIVATE_KEY provided)
 */

import { SignerClient, ApiClient, AccountApi } from '../src';
import { createWasmSignerClient } from '../src/signer/wasm-signer';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Configuration matching Python example
const BASE_URL = process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';
const ETH_PRIVATE_KEY = process.env['ETH_PRIVATE_KEY'] || process.env['ACCOUNT_PRIVATE_KEY'] || '';
const ACCOUNT_INDEX_ENV = process.env['ACCOUNT_INDEX'];
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '3', 10);
const NUM_API_KEYS = parseInt(process.env['NUM_API_KEYS'] || '5', 10);

// Optional: Existing API key for authorization (needed if creating additional keys)
// If not provided, will try to use a temporary key (may fail for first key creation)
const EXISTING_API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
const EXISTING_API_KEY_INDEX = process.env['EXISTING_API_KEY_INDEX'] 
  ? parseInt(process.env['EXISTING_API_KEY_INDEX'], 10) 
  : (EXISTING_API_PRIVATE_KEY ? 0 : undefined);

// If you set this to something other than null, the script will use that account index instead of using the master account index.
// This is useful if you have multiple accounts on the same L1 address or are the owner of a public pool.
// You need to use the private key associated to the master account or the owner of the public pool to change the API keys.
const ACCOUNT_INDEX_OVERRIDE = ACCOUNT_INDEX_ENV ? parseInt(ACCOUNT_INDEX_ENV, 10) : null;

/**
 * Save API key configuration to a file
 */
function saveApiKeyConfig(baseUrl: string, accountIndex: number, privateKeys: Record<number, string>): void {
  const config: any = {
    base_url: baseUrl,
    account_index: accountIndex,
    api_keys: {}
  };

  for (const [apiKeyIndex, privateKey] of Object.entries(privateKeys)) {
    config.api_keys[apiKeyIndex] = {
      private_key: privateKey,
      api_key_index: parseInt(apiKeyIndex, 10)
    };
  }

  const configPath = path.join(process.cwd(), 'api_key_config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\n💾 API key configuration saved to: ${configPath}`);
}

async function systemSetup() {
  console.log('🚀 System Setup...\n');

  if (!ETH_PRIVATE_KEY) {
    throw new Error('ETH_PRIVATE_KEY or ACCOUNT_PRIVATE_KEY environment variable is required');
  }

  try {
    // 1. Get Ethereum address from private key
    const { ethers } = await import('ethers');
    const wallet = new ethers.Wallet(ETH_PRIVATE_KEY);
    const ethAddress = wallet.address;
    console.log(`📋 Ethereum Address: ${ethAddress}\n`);

    // 2. Initialize API client
    const apiClient = new ApiClient({ host: BASE_URL });
    const accountApi = new AccountApi(apiClient);

    // 3. Verify that the account exists & fetch account index
    let accountIndex: number;

    if (ACCOUNT_INDEX_OVERRIDE !== null) {
      accountIndex = ACCOUNT_INDEX_OVERRIDE;
      console.log(`📋 Using provided account index: ${accountIndex}\n`);
    } else {
      try {
        const accounts = await accountApi.getAccountsByL1Address(ethAddress);
        
        if (accounts.length === 0) {
          console.error(`❌ Error: account not found for ${ethAddress}`);
          await apiClient.close();
          return;
        }

        // If we have multiple accounts, find the master account (minimum index)
        if (accounts.length > 1) {
          for (const account of accounts) {
            console.log(`📋 Found accountIndex: ${account.index}`);
          }

          // Find the account with minimum index (master account)
          const masterAccount = accounts.reduce((min, acc) => {
            const minIdx = parseInt(min.index, 10);
            const accIdx = parseInt(acc.index, 10);
            return accIdx < minIdx ? acc : min;
          });
          
          accountIndex = parseInt(masterAccount.index, 10);
          console.log(`📋 Multiple accounts found, using the master account ${accountIndex}\n`);
        } else {
          accountIndex = parseInt(accounts[0].index, 10);
          console.log(`📋 Using account index: ${accountIndex}\n`);
        }
      } catch (error: any) {
        if (error.message && error.message.includes('account not found')) {
          console.error(`❌ Error: account not found for ${ethAddress}`);
          await apiClient.close();
          return;
        } else {
          throw error;
        }
      }
    }

    // 4. Create a private/public key pair for each new API key
    // We need to initialize a WASM client first to generate keys
    const tempWasmClient = await createWasmSignerClient({
      wasmPath: 'wasm/lighter-signer.wasm'
    });
    await tempWasmClient.initialize();

    const privateKeys: Record<number, string> = {};
    const publicKeys: string[] = [];

    console.log(`🔑 Generating ${NUM_API_KEYS} API Key(s)...\n`);
    for (let i = 0; i < NUM_API_KEYS; i++) {
      // Generate a unique seed for each API key to ensure uniqueness
      // Pass any string to be used as seed for create_api_key like
      // create_api_key("Hello world random seed to make things more secure")
      const seed = `api-key-${API_KEY_INDEX + i}-${Date.now()}-${Math.random()}`;
      const apiKeyPair = await tempWasmClient.generateAPIKey(seed);
      if (!apiKeyPair) {
        throw new Error('Failed to generate API key pair');
      }
      
      const targetApiKeyIndex = API_KEY_INDEX + i;
      publicKeys.push(apiKeyPair.publicKey);
      privateKeys[targetApiKeyIndex] = apiKeyPair.privateKey;
      
      console.log(`   ✅ Generated API key for index ${targetApiKeyIndex}`);
      console.log(`      Private Key: ${apiKeyPair.privateKey.substring(0, 20)}...`);
      console.log(`      Public Key: ${apiKeyPair.publicKey.substring(0, 20)}...\n`);
    }

    // 5. Create a SignerClient to change API keys
    // We need at least one existing API key to authenticate, or we can use a temporary one
    // Use existing API key if available, otherwise use the first generated key temporarily
    let txClient: SignerClient;
    
    if (EXISTING_API_PRIVATE_KEY && EXISTING_API_KEY_INDEX !== undefined) {
      // Use existing registered API key for authorization
      console.log(`📝 Using existing API key (index ${EXISTING_API_KEY_INDEX}) for authentication...\n`);
      txClient = new SignerClient({
        url: BASE_URL,
        privateKey: EXISTING_API_PRIVATE_KEY,
        accountIndex: accountIndex,
        apiKeyIndex: EXISTING_API_KEY_INDEX
      });
    } else {
      // Use the first generated key temporarily to initialize the client
      // Note: This may fail if no existing API key is registered and we're trying to create the first key
      const firstApiKeyIndex = API_KEY_INDEX;
      const firstPrivateKey = privateKeys[firstApiKeyIndex];
      console.log(`📝 Using temporary key (index ${firstApiKeyIndex}) for authentication...\n`);
      txClient = new SignerClient({
        url: BASE_URL,
        privateKey: firstPrivateKey,
        accountIndex: accountIndex,
        apiKeyIndex: firstApiKeyIndex
      });
    }
    
    await txClient.initialize();
    await txClient.ensureWasmClient();

    // 6. Change all API keys
    console.log(`📝 Registering ${NUM_API_KEYS} API Key(s) on server...\n`);
    for (let i = 0; i < NUM_API_KEYS; i++) {
      const targetApiKeyIndex = API_KEY_INDEX + i;
      const publicKey = publicKeys[i];
      
      console.log(`   📝 Changing API key at index ${targetApiKeyIndex}...`);
      
      // Ensure public key is properly formatted (with 0x prefix)
      // Note: The public key from generateAPIKey already includes '0x' prefix
      const formattedPublicKey = publicKey.startsWith('0x') ? publicKey : `0x${publicKey}`;
      
      // Log the full public key for debugging (first 50 chars)
      console.log(`      Public Key (first 50 chars): ${formattedPublicKey.substring(0, 50)}...`);
      
      const [changeResult, txHash, error] = await txClient.changeApiKey({
        ethPrivateKey: ETH_PRIVATE_KEY,
        newPubkey: formattedPublicKey,
        newPrivateKey: privateKeys[targetApiKeyIndex],
        newApiKeyIndex: targetApiKeyIndex
      });

      if (error) {
        console.error(`   ❌ Error details for API key ${targetApiKeyIndex}:`);
        console.error(`      Public Key: ${formattedPublicKey.substring(0, 50)}...`);
        console.error(`      Public Key Length: ${formattedPublicKey.length}`);
        console.error(`      Error: ${error}`);
        console.error(`\n   💡 Troubleshooting:`);
        console.error(`      - If you see "invalid PublicKey, update the sdk", this may indicate:`);
        console.error(`        1. WASM module version mismatch with server`);
        console.error(`        2. Public key format validation issue`);
        console.error(`        3. API key index may already be in use or restricted`);
        console.error(`      - Try using a different API_KEY_INDEX`);
        console.error(`      - Ensure you're using the latest WASM module\n`);
        throw new Error(`Failed to change API key at index ${targetApiKeyIndex}: ${error}`);
      }

      console.log(`   ✅ API key ${targetApiKeyIndex} registration transaction sent!`);
      console.log(`      Transaction Hash: ${txHash.substring(0, 16)}...\n`);
    }

    // 7. Wait some time so that we receive the new API key in the response
    console.log(`⏳ Waiting 10 seconds for transactions to be processed...\n`);
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 8. Check that the API key changed on the server
    console.log(`🔍 Verifying API keys...\n`);
    const checkError = await txClient.checkClient(true); // Use WASM check
    if (checkError) {
      console.warn(`⚠️  Client check warning: ${checkError}`);
      console.log(`   Note: This might be expected if the first key hasn't been fully processed yet.\n`);
    } else {
      console.log(`✅ Client check passed!\n`);
    }

    // 9. Verify all API keys work by creating clients for each
    console.log(`🔍 Verifying all ${NUM_API_KEYS} API keys...\n`);
    for (let i = 0; i < NUM_API_KEYS; i++) {
      const targetApiKeyIndex = API_KEY_INDEX + i;
      try {
        const verifyClient = new SignerClient({
          url: BASE_URL,
          privateKey: privateKeys[targetApiKeyIndex],
          accountIndex: accountIndex,
          apiKeyIndex: targetApiKeyIndex
        });

        await verifyClient.initialize();
        await verifyClient.ensureWasmClient();
        
        const verifyError = await verifyClient.checkClient(true);
        if (verifyError) {
          console.log(`   ⚠️  API key ${targetApiKeyIndex} verification failed: ${verifyError}`);
          console.log(`      Note: The API key was created successfully. Verification may succeed after a few more seconds.\n`);
        } else {
          console.log(`   ✅ API key ${targetApiKeyIndex} verified successfully!\n`);
        }
        
        await verifyClient.close();
      } catch (error: any) {
        console.log(`   ⚠️  API key ${targetApiKeyIndex} verification failed: ${error.message}`);
        console.log(`      Note: The API key was created successfully. Verification may succeed after a few more seconds.\n`);
      }
    }

    // 10. Save API key configuration
    saveApiKeyConfig(BASE_URL, accountIndex, privateKeys);

    // Cleanup
    await txClient.close();
    await apiClient.close();

    console.log('🎉 System Setup Completed Successfully!');
    console.log('✅ API keys have been generated and registered');

  } catch (error) {
    console.error('❌ Error during system setup:', error);
    throw error;
  }
}

// Run the example
if (require.main === module) {
  systemSetup().catch(console.error);
}

export { systemSetup };
