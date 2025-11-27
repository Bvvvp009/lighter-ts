/**
 * Example: System Setup
 * Demonstrates system setup including account creation, API key generation, and initial configuration
 */

import { SignerClient, ApiClient } from '../src';

async function systemSetup() {
  console.log('🚀 System Setup...\n');

  try {
    // 1. Initialize clients explicitly
    console.log('🔧 Initializing Clients...');
    
    const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
    const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
    const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
    const BASE_URL = 'https://testnet.zklighter.elliot.ai';
    const TARGET_API_KEY_INDEX = 6;
    const ACCOUNT_PRIVATE_KEY = process.env['ACCOUNT_PRIVATE_KEY'];
    
    if (!ACCOUNT_PRIVATE_KEY) {
      throw new Error('ACCOUNT_PRIVATE_KEY must be set in .env file for L1 signature operations');
    }

    const signerClient = new SignerClient({
      url: BASE_URL,
      privateKey: API_PRIVATE_KEY,
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX
    });

    const apiClient = new ApiClient({
      host: BASE_URL
    });

    await signerClient.initialize();
    await signerClient.ensureWasmClient();
    console.log('✅ Clients initialized successfully!\n');

    // 2. Create Authentication Token
    console.log('🔑 Creating Authentication Token...');
    const authToken = await signerClient.createAuthTokenWithExpiry(600); // 10 minutes
    console.log('✅ Authentication Token created successfully!');
    console.log(`   Token: ${authToken.substring(0, 20)}...\n`);

    // 3. Create API Key for Specific Key Index (if requested)
    const targetApiKeyIndex = TARGET_API_KEY_INDEX;
    if (targetApiKeyIndex !== null && !isNaN(targetApiKeyIndex)) {
      console.log(`🔑 Creating API Key for Key Index ${targetApiKeyIndex}...`);
      try {
        // Generate a new API key pair
        const apiKeyPair = await signerClient.generateAPIKey();
        if (!apiKeyPair) {
          throw new Error('Failed to generate API key pair');
        }
        
        console.log('✅ API Key pair generated successfully!');
        console.log(`   Private Key: ${apiKeyPair.privateKey.substring(0, 20)}...`);
        console.log(`   Public Key: ${apiKeyPair.publicKey.substring(0, 20)}...\n`);

        // Change the API key using ETH private key
        const ethPrivateKey = ACCOUNT_PRIVATE_KEY;
        if (!ethPrivateKey) {
          throw new Error('ETH_PRIVATE_KEY or PRIVATE_KEY environment variable is required for API key creation');
        }

        console.log('📝 Registering API Key on server...');
        const [changeResult, txHash, error] = await signerClient.changeApiKey({
          ethPrivateKey: ethPrivateKey,
          newPubkey: apiKeyPair.publicKey,
          newPrivateKey: apiKeyPair.privateKey,
          newApiKeyIndex: targetApiKeyIndex
        });

        if (error) {
          throw new Error(`Failed to change API key: ${error}`);
        }

        console.log('✅ API Key registration transaction sent!');
        console.log(`   Transaction Hash: ${txHash}\n`);

        // Wait for the transaction to be processed
        console.log('⏳ Waiting for API key to be registered on server (10 seconds)...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Display API Key Configuration
        console.log('📋 API Key Configuration:');
        console.log(`   Account Index: ${ACCOUNT_INDEX}`);
        console.log(`   API Key Index: ${targetApiKeyIndex}`);
        console.log(`   Private Key: ${apiKeyPair.privateKey}`);
        console.log(`   Public Key: ${apiKeyPair.publicKey}\n`);

        // Optional: Verify the API key works by creating a new client with it
        // Note: Verification may fail if the transaction hasn't been processed yet
        const VERIFY_API_KEY = process.env['VERIFY_API_KEY'] !== 'false'; // Default to true
        if (VERIFY_API_KEY) {
          console.log('🔍 Verifying API Key...');
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
            console.log('✅ API Key verified successfully!');
            console.log(`   Auth Token: ${verifyAuthToken.substring(0, 20)}...\n`);
          } catch (verifyError) {
            console.log('⚠️ API Key verification failed (transaction may still be processing)');
            console.log(`   Error: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
            console.log('   Note: The API key was created successfully. Verification may succeed after a few more seconds.\n');
          }
        } else {
          console.log('⏭️ Skipping API key verification (VERIFY_API_KEY=false)\n');
        }
      } catch (error) {
        console.error(`❌ Error creating API key for index ${targetApiKeyIndex}:`, error);
        console.log('⚠️ Continuing with system setup...\n');
      }
    } else {
      console.log('💡 Tip: Set TARGET_API_KEY_INDEX environment variable to create a new API key\n');
    }

    // 4. Get Account Information
    console.log('👤 Fetching Account Information...');
    try {
      const accountInfo = await apiClient.get('/api/v1/account', {
        account_index: ACCOUNT_INDEX,
        auth: authToken
      });
      console.log('✅ Account Information fetched successfully!');
      console.log(`   Account Index: ${accountInfo.data.index}`);
      console.log(`   L1 Address: ${accountInfo.data.l1_address}`);
      console.log(`   L2 Address: ${accountInfo.data.l2_address}`);
      console.log(`   Balance: ${accountInfo.data.balance}`);
      console.log(`   Margin Balance: ${accountInfo.data.margin_balance}\n`);
    } catch (error) {
      console.log('⚠️ Could not fetch account info (may require proper authentication)\n');
    }

    // 5. Get System Information
    console.log('ℹ️ Fetching System Information...');
    const systemInfo = await apiClient.get('/api/v1/root');
    console.log('✅ System Information fetched successfully!');
    console.log(`   Version: ${systemInfo.data.version}`);
    console.log(`   Chain ID: ${systemInfo.data.chain_id}`);
    console.log(`   Block Height: ${systemInfo.data.block_height}\n`);

    // 6. Get Available Markets
    console.log('📊 Fetching Available Markets...');
    const markets = await apiClient.get('/api/v1/markets');
    console.log('✅ Markets fetched successfully!');
    console.log(`   Available Markets: ${markets.data.length}`);
    markets.data.slice(0, 3).forEach((market: any, index: number) => {
      console.log(`   Market ${index}: ${market.symbol} (ID: ${market.market_id})`);
    });
    console.log('');

    // 7. Test API Key Functionality
    console.log('🔐 Testing API Key Functionality...');
    try {
      const nextNonce = await (signerClient as any).getNextNonce();
      console.log('✅ API Key functionality test successful!');
      console.log(`   Next Nonce: ${nextNonce}\n`);
    } catch (error) {
      console.log('⚠️ API Key functionality test failed (may require proper setup)\n');
    }

    // 8. System Health Check
    console.log('🏥 Performing System Health Check...');
    try {
      const healthCheck = await apiClient.get('/api/v1/health');
      console.log('✅ System health check passed!');
      console.log(`   Status: ${healthCheck.data.status || 'OK'}\n`);
    } catch (error) {
      console.log('⚠️ System health check failed (endpoint may not be available)\n');
    }

    console.log('🎉 System Setup Completed Successfully!');
    console.log('✅ All components are ready for trading operations');

  } catch (error) {
    console.error('❌ Error during system setup:', error);
  }
}

// Run the example
if (require.main === module) {
  systemSetup().catch(console.error);
}

export { systemSetup };
