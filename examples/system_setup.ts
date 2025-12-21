/**
 * Example: System Setup
 * Demonstrates API key generation and registration
 * 
 * - Verifies account exists & fetches account index by L1 address
 * - Handles multiple accounts by selecting the master account (minimum index)
 * - Creates multiple API keys in a single run
 * - Changes all API keys using existing API key for authentication
 * 
 * Requirements:
 * - ETH_PRIVATE_KEY: Ethereum private key for L1 signature (required for ChangePubKey)
 * - ACCOUNT_INDEX: Account index (optional, will be fetched if not provided)
 * - API_KEY_INDEX: Starting API key index (optional, defaults to 3)
 * - NUM_API_KEYS: Number of API keys to generate (optional, defaults to 1)
 * - BASE_URL: API endpoint URL (optional)
 * - API_PRIVATE_KEY: Existing API private key for authentication (required if not creating first key)
 * - EXISTING_API_KEY_INDEX: Index of existing API key (optional, defaults to 0 if API_PRIVATE_KEY provided)
 */

import { SignerClient, ApiClient, AccountApi } from '../src';
import { createWasmSignerClient } from '../src/signer/wasm-signer';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';
const ETH_PRIVATE_KEY = process.env['ETH_PRIVATE_KEY'] || process.env['ACCOUNT_PRIVATE_KEY'] || '';
const ACCOUNT_INDEX_ENV = process.env['ACCOUNT_INDEX'];
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '3', 10);
const NUM_API_KEYS = parseInt(process.env['NUM_API_KEYS'] || '1', 10);
const EXISTING_API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
const EXISTING_API_KEY_INDEX = process.env['EXISTING_API_KEY_INDEX'] 
  ? parseInt(process.env['EXISTING_API_KEY_INDEX'], 10) 
  : (EXISTING_API_PRIVATE_KEY ? 0 : undefined);
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
    console.log(`📋 Ethereum Address: ${ethAddress}`);

    // 2. Initialize API client
    const apiClient = new ApiClient({ host: BASE_URL });
    const accountApi = new AccountApi(apiClient);

    // 3. Verify that the account exists & fetch account index
    let accountIndex: number;

    if (ACCOUNT_INDEX_OVERRIDE !== null) {
      accountIndex = ACCOUNT_INDEX_OVERRIDE;
      console.log(`📋 Using account index: ${accountIndex}\n`);
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
        } else {
          accountIndex = parseInt(accounts[0].index, 10);
        }
        console.log(`📋 Using account index: ${accountIndex}\n`);
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

    // 4. Generate API key pairs
    const tempWasmClient = await createWasmSignerClient({
      wasmPath: 'wasm/lighter-signer.wasm'
    });
    await tempWasmClient.initialize();

    const privateKeys: Record<number, string> = {};
    const publicKeys: string[] = [];

    console.log(`🔑 Generating ${NUM_API_KEYS} API Key(s)...`);
    for (let i = 0; i < NUM_API_KEYS; i++) {
      const seed = `api-key-${API_KEY_INDEX + i}-${Date.now()}-${Math.random()}`;
      const apiKeyPair = await tempWasmClient.generateAPIKey(seed);
      if (!apiKeyPair) {
        throw new Error('Failed to generate API key pair');
      }
      
      const targetApiKeyIndex = API_KEY_INDEX + i;
      publicKeys.push(apiKeyPair.publicKey);
      privateKeys[targetApiKeyIndex] = apiKeyPair.privateKey;
    }
    console.log(`✅ Generated ${NUM_API_KEYS} API key(s)\n`);

    // 5. Create SignerClient with existing API key for authentication
    if (!EXISTING_API_PRIVATE_KEY) {
      throw new Error('API_PRIVATE_KEY environment variable is required for authentication. Use an existing API key to register new ones.');
    }

    console.log(`📝 Using existing API key (index ${EXISTING_API_KEY_INDEX}) for authentication...`);
    const txClient = new SignerClient({
      url: BASE_URL,
      privateKey: EXISTING_API_PRIVATE_KEY,
      accountIndex: accountIndex,
      apiKeyIndex: EXISTING_API_KEY_INDEX!
    });
    
    await txClient.initialize();
    await txClient.ensureWasmClient();

    // 6. Change API keys (register new public keys)
    console.log(`📝 Registering ${NUM_API_KEYS} API Key(s) on server...`);
    for (let i = 0; i < NUM_API_KEYS; i++) {
      const targetApiKeyIndex = API_KEY_INDEX + i;
      const publicKey = publicKeys[i];
      
      const [changeResult, txHash, error] = await txClient.changeApiKey({
        ethPrivateKey: ETH_PRIVATE_KEY,
        newPubkey: publicKey,
        newPrivateKey: privateKeys[targetApiKeyIndex],
        newApiKeyIndex: targetApiKeyIndex
      });

      if (error) {
        // If key already exists, skip it
        if (error.includes('already') || error.includes('in use')) {
          console.log(`⚠️  API key ${targetApiKeyIndex} already exists, skipping...`);
          continue;
        }
        throw new Error(`Failed to create API key at index ${targetApiKeyIndex}: ${error}`);
      }

      console.log(`✅ API key ${targetApiKeyIndex} created`);
    }
    console.log('');

    // 7. Wait for transactions to be processed
    console.log(`⏳ Waiting for transactions to be processed...`);
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 8. Verify API keys
    console.log(`🔍 Verifying API keys...`);
    const checkError = await txClient.checkClient(true);
    if (checkError) {
      console.warn(`⚠️  Verification pending: ${checkError}`);
    } else {
      console.log(`✅ All API keys verified`);
    }
    console.log('');

    // 9. Save API key configuration
    saveApiKeyConfig(BASE_URL, accountIndex, privateKeys);

    // Cleanup
    await txClient.close();
    await apiClient.close();

    console.log('🎉 System Setup Completed Successfully!');

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
