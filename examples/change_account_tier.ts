import * as dotenv from 'dotenv';
import { SignerClient, ApiClient, AccountApi } from '../src';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'https://api-testnet.lighter.xyz';
const PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
const ACCOUNT_INDEX = parseInt(process.env.ACCOUNT_INDEX || '10');
const API_KEY_INDEX = parseInt(process.env.API_KEY_INDEX || '10');

async function main() {
  console.log('🚀 Starting account tier change example...\n');

  try {
    // Initialize signer client
    const signerClient = new SignerClient({
      url: BASE_URL,
      privateKey: PRIVATE_KEY,
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
    });

    // Ensure signerclient initialized
    await signerClient.initialize();
    await signerClient.ensureWasmClient();
    
    console.log(`✅ SignerClient initialized`);
    console.log(`📊 Account Index: ${ACCOUNT_INDEX}`);
    console.log(`🔑 API Key Index: ${API_KEY_INDEX}\n`);
    
    // Initialize API clients
    const apiClient = new ApiClient({ host: BASE_URL });
    const accountApi = new AccountApi(apiClient);

    console.log(`✅ Clients initialized`);
    console.log(`📊 Account Index: ${ACCOUNT_INDEX}`);

    // Create auth token for authenticated API calls
    console.log('\n🔐 Creating auth token...');
    const authToken = await signerClient.createAuthTokenWithExpiry();
    console.log(`✅ Auth token created successfully: ${authToken.substring(0, 80)}...`);
    console.log(`   Token length: ${authToken.length}\n`);

    // Example 1: Upgrade to Premium tier
    console.log('📈 Example 1: Upgrading to PREMIUM tier');
    try {
      const upgradeResult = await accountApi.changeAccountTier(
        ACCOUNT_INDEX,
        'premium',  // New tier
        authToken
      );
      console.log(`✅ Successfully upgraded to PREMIUM tier!`);
    } catch (error: any) {
      const errorCode = error.response?.data?.code;
      const errorMsg = error.response?.data?.message || error.message;
      
      if (errorCode === 1002 && errorMsg?.includes('already part of')) {
        console.log(`⚠️  Account already part of PREMIUM tier`);
        console.log(`   This is expected if the account is already premium`);
      } else if (errorMsg?.includes('invalid signature')) {
        console.error(`❌ Auth token has INVALID SIGNATURE - fix needed!`);
        throw error;
      } else {
        console.log(`ℹ️  Cannot upgrade to premium: ${errorMsg}`);
        console.log(`   This might be due to account restrictions or tier eligibility`);
      }
    }

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Example 2: Revert back to Standard tier
    console.log('\n📉 Example 2: Reverting to STANDARD tier');
    try {
      const revertResult = await accountApi.changeAccountTier(
        ACCOUNT_INDEX,
        'standard',  // New tier
        authToken
      );
      console.log(`✅ Successfully reverted to STANDARD tier!`);
    } catch (error: any) {
      const errorCode = error.response?.data?.code;
      const errorMsg = error.response?.data?.message || error.message;
      
      if (errorCode === 1002) {
        console.log(`ℹ️  Account already at STANDARD tier or cannot downgrade`);
      } else if (errorMsg?.includes('invalid signature')) {
        console.error(`❌ Auth token has INVALID SIGNATURE - fix needed!`);
        throw error;
      } else {
        console.log(`ℹ️  Cannot revert to standard: ${errorMsg}`);
      }
    }

    console.log('\n✅ Account tier change examples completed!');
    console.log('\n💡 Notes:');
    console.log('   - Tier changes may require specific account conditions');
    console.log('   - Premium tier might require minimum trading volume');
    console.log('   - Some tier changes might be restricted by the protocol');
    console.log('   - Auth tokens are automatically generated using the most reliable method');

    await signerClient.close();
    await apiClient.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);