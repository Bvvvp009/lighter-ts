/**
 * Example: Revoke API Key
 * 
 * This example demonstrates how to "revoke" an API key by overwriting it with a new key
 * at the same API key index. This effectively makes the old key useless.
 * 
 * Note: "Revoking" an API key means replacing it at the same index, which invalidates
 * the old key pair. You can either:
 * 1. Replace it with a new key (effectively rotating the key)
 * 2. Replace it with a dummy/zero key (if protocol supports it)
 */

import * as fs from 'fs';
import { SignerClient, ApiClient, resolveNetworkFromEnv } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Write a freshly generated API key to a local file, readable only by its owner.
 *
 * Keys never go to stdout: terminal scrollback, CI logs and screen shares all
 * outlive the run. `*.key` is gitignored, and mode 0600 keeps the file out of
 * other users' reach on POSIX (Windows ignores the mode, as ever).
 */
function saveNewKey(
  accountIndex: number,
  apiKeyIndex: number,
  pair: { privateKey: string; publicKey: string }
): string {
  const now = new Date().toISOString();
  const file = `lighter-api-key-acct${accountIndex}-idx${apiKeyIndex}-${now.replace(/[:.]/g, '-')}.key`;
  const body =
    `# Lighter API key -- generated ${now}\n` +
    `# account_index=${accountIndex} api_key_index=${apiKeyIndex}\n` +
    `# Set this value as API_PRIVATE_KEY. Treat it like a password.\n` +
    `${pair.privateKey}\n`;
  fs.writeFileSync(file, body, { encoding: 'utf8', mode: 0o600 });
  return file;
}

async function revokeApiKey() {
  console.log('🔐 API Key Revocation Example\n');

  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);
  const BASE_URL = resolveNetworkFromEnv().apiUrl;
  const TARGET_API_KEY_INDEX = parseInt(process.env['TARGET_API_KEY_INDEX'] || API_KEY_INDEX.toString(), 10); // Index to revoke
  const ACCOUNT_PRIVATE_KEY = process.env['ACCOUNT_PRIVATE_KEY'] || process.env['ETH_PRIVATE_KEY'] || '';

  // Safety check: Warn if trying to revoke the key we're using
  if (TARGET_API_KEY_INDEX === API_KEY_INDEX) {
    console.warn('⚠️  WARNING: You are trying to revoke the API key you are currently using!');
    console.warn(`   Current API Key Index: ${API_KEY_INDEX}`);
    console.warn(`   Target API Key Index to Revoke: ${TARGET_API_KEY_INDEX}`);
    console.warn('   This may fail. Consider using a different API key to revoke this one.\n');
  }

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  if (!ACCOUNT_PRIVATE_KEY) {
    throw new Error('ACCOUNT_PRIVATE_KEY or ETH_PRIVATE_KEY environment variable is required for L1 signature');
  }

  console.log(`📋 Revocation Parameters:`);
  console.log(`   Account Index: ${ACCOUNT_INDEX}`);
  console.log(`   API Key Index to Revoke: ${TARGET_API_KEY_INDEX}`);
  console.log(`   Base URL: ${BASE_URL}\n`);

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX // Use a different active key to revoke the target key
  });

  const apiClient = new ApiClient({ host: BASE_URL });

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();
    console.log('✅ Clients initialized\n');

    // Step 1: Generate a new key pair to replace the old one
    console.log(`🔑 Step 1: Generating new API key pair...`);
    const newApiKeyPair = await signerClient.generateAPIKey();
    if (!newApiKeyPair) {
      throw new Error('Failed to generate new API key pair');
    }
    
    console.log('✅ New API key pair generated');

    // Persist the new key BEFORE step 2 overwrites the old one on-chain. Once
    // that transaction lands the old key is dead, so a crash between here and
    // there would leave this account index with no usable key at all.
    //
    // The key itself is never printed. A truncated key in scrollback is both a
    // leak and useless to keep -- this example used to say "save this
    // securely!" while showing 20 of the key's 80 characters.
    const keyFile = saveNewKey(ACCOUNT_INDEX, TARGET_API_KEY_INDEX, newApiKeyPair);
    console.log(`   New Public Key: ${newApiKeyPair.publicKey.substring(0, 20)}...`);
    console.log(`🔒 Private key written to ${keyFile} (owner-only, gitignored)`);
    console.log(`   Back that file up now -- it is the only copy.\n`);

    // Step 2: Overwrite the existing key at the target index
    // This effectively "revokes" the old key by making it useless
    console.log(`📝 Step 2: Revoking old API key by overwriting at index ${TARGET_API_KEY_INDEX}...`);
    console.log(`   This will replace the existing key, making it invalid.`);
    console.log(`   Using API Key Index ${API_KEY_INDEX} for authorization.\n`);

    // Note: If you get "invalid PublicKey" error, it may be because:
    // 1. You're trying to revoke the same key you're using (use a different API_KEY_INDEX)
    // 2. The API has restrictions on overwriting existing keys
    // 3. The public key format may need validation

    const [changeResult, txHash, error] = await signerClient.changeApiKey({
      ethPrivateKey: ACCOUNT_PRIVATE_KEY,
      newPubkey: newApiKeyPair.publicKey,
      newPrivateKey: newApiKeyPair.privateKey,
      newApiKeyIndex: TARGET_API_KEY_INDEX // Same index = overwrite/revoke old key
    });

    if (error) {
      throw new Error(`Failed to revoke API key: ${error}`);
    }

    if (!txHash) {
      throw new Error('No transaction hash returned');
    }

    console.log('✅✅✅ API Key Revocation Successful! ✅✅✅\n');
    console.log(`Transaction Hash: ${txHash}`);
    console.log(`\n📋 Result:`);
    console.log(`   The old API key at index ${TARGET_API_KEY_INDEX} has been revoked`);
    console.log(`   The new API key is now active at index ${TARGET_API_KEY_INDEX}`);
    console.log(`   Old key: INVALID (can no longer be used)`);
    console.log(`   The new private key is in ${keyFile} -- set it as API_PRIVATE_KEY\n`);

    // Step 3: Verify the revocation by checking if old key still works
    console.log('🔍 Step 3: Verifying revocation...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for transaction to process

    console.log(`\n💡 Note: To verify revocation, try using the old key - it should fail.`);
    console.log(`   The new key should work for index ${TARGET_API_KEY_INDEX}\n`);

  } catch (error) {
    console.error('❌ Error revoking API key:', error);
    throw error;
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run the example
// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('revoke_api_key');
if (isMain) {
  revokeApiKey().catch(console.error);
}

export { revokeApiKey };


