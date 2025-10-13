import { SignerClient } from '../src/index';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create Auth Token Example
 * 
 * This example demonstrates how to create authentication tokens for API requests
 * that require authentication but don't involve transactions.
 * 
 * Auth tokens are used for endpoints like:
 * - Getting user points/rewards
 * - Accessing private account data
 * - Any authenticated read-only operations
 * 
 * Prerequisites:
 * - API_PRIVATE_KEY in .env (your API key private key)
 * - API_KEY_INDEX in .env (your API key index)
 * - ACCOUNT_INDEX in .env (your account index)
 * - BASE_URL in .env (API endpoint)
 */

const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const BASE_URL = process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';

async function main() {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('❌ API_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  console.log('🔐 Create Auth Token Example\n');
  console.log('═'.repeat(80));

  // Initialize SignerClient (standalone WASM) to create auth tokens
  const signer = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  try {
    console.log('\n📝 Initializing signer...');
    await signer.initialize();
    await signer.ensureWasmClient();
    console.log('✅ Signer initialized\n');

    // Example 1: Create short-lived auth token (default ~10 minutes)
    console.log('Example 1: Short-lived Auth Token (10 minutes)');
    console.log('-'.repeat(80));
    
    const shortLivedToken = await signer.createAuthTokenWithExpiry();
    console.log('✅ Short-lived token created');
    console.log(`   Token: ${shortLivedToken.substring(0, 50)}...`);
    console.log(`   Expires: ~10 minutes from now\n`);

    // Example 2: Create custom duration auth token (1 hour)
    console.log('Example 2: Custom Duration Auth Token (1 hour)');
    console.log('-'.repeat(80));
    
    const oneHourInSeconds = 60 * 60;
    const oneHourToken = await signer.createAuthTokenWithExpiry(oneHourInSeconds);
    console.log('✅ 1-hour token created');
    console.log(`   Token: ${oneHourToken.substring(0, 50)}...`);
    console.log(`   Expires: 1 hour from now\n`);

    // Example 3: Create very short-lived token (5 minutes) for sensitive operations
    console.log('Example 3: Very Short-lived Token (5 minutes)');
    console.log('-'.repeat(80));
    
    const fiveMinutesInSeconds = 60 * 5;
    const shortToken = await signer.createAuthTokenWithExpiry(fiveMinutesInSeconds);
    console.log('✅ 5-minute token created');
    console.log(`   Token: ${shortToken.substring(0, 50)}...`);
    console.log(`   Expires: 5 minutes from now\n`);

    // Example 4: Using the auth token with API requests
    console.log('Example 4: Using Auth Token with API Requests');
    console.log('-'.repeat(80));
    
    const { ApiClient } = await import('../src/index');
    const apiClient = new ApiClient({ host: BASE_URL });
    
    // Set the auth token in headers
    apiClient.setDefaultHeader('Authorization', shortLivedToken);
    
    console.log('✅ Auth token set in API client headers');
    console.log('   Now you can make authenticated API requests\n');

    // Example usage with actual API call (if available)
    try {
      const { AccountApi } = await import('../src/index');
      const accountApi = new AccountApi(apiClient);
      
      // This is just an example - adjust based on actual authenticated endpoints
      console.log('   Making authenticated request to get account info...');
      const accountInfo = await accountApi.getAccount({
        by: 'index',
        value: ACCOUNT_INDEX.toString()
      });
      console.log(`   ✅ Successfully retrieved account index: ${accountInfo.index}`);
    } catch (apiError) {
      console.log('   ℹ️  Account endpoint may not require auth or may have different requirements');
    }

    // Clean up
    await signer.close();
    await apiClient.close();

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main().catch(console.error);

