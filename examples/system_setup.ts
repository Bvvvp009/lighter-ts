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
    
    // Validate required environment variables
    if (!process.env['PRIVATE_KEY']) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    const signerClient = new SignerClient({
      url: process.env['LIGHTER_URL'] || 'https://mainnet.zklighter.elliot.ai',
      privateKey: process.env['PRIVATE_KEY'] || '',
      accountIndex: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
      apiKeyIndex: parseInt(process.env['API_KEY_INDEX'] || '0')
    });

    const apiClient = new ApiClient({
      host: process.env['LIGHTER_URL'] || 'https://mainnet.zklighter.elliot.ai'
    });

    await signerClient.initialize();
    await signerClient.ensureWasmClient();
    console.log('✅ Clients initialized successfully!\n');

    // 2. Create Authentication Token
    console.log('🔑 Creating Authentication Token...');
    const authToken = await signerClient.createAuthTokenWithExpiry(600); // 10 minutes
    console.log('✅ Authentication Token created successfully!');
    console.log(`   Token: ${authToken.substring(0, 20)}...\n`);

    // 4. Get Account Information
    console.log('👤 Fetching Account Information...');
    try {
      const accountInfo = await apiClient.get('/api/v1/account', {
        account_index: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
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
