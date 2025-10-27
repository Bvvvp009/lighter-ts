import dotenv from 'dotenv';
import { SignerClient } from '../src';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'https://api-testnet.lighter.xyz';
const PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
const ACCOUNT_INDEX = parseInt(process.env.ACCOUNT_INDEX || '10');
const API_KEY_INDEX = parseInt(process.env.API_KEY_INDEX || '10');

// Market ID for ETH/USDC (example)
const MARKET_INDEX = 0;

async function main() {
  console.log('🚀 Starting leverage update example...\n');

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
    console.log(`📊 Market Index: ${MARKET_INDEX}`);
    console.log(`🔑 Account Index: ${ACCOUNT_INDEX}`);
    console.log(`🔑 API Key Index: ${API_KEY_INDEX}\n`);

    // Verify API key exists before proceeding
    try {
      const auth = await signerClient.createAuthTokenWithExpiry();
      console.log(`✅ API key verified (auth token created)\n`);
    } catch (error) {
      console.error(`❌ Failed to verify API key: ${error}`);
      console.log(`\n💡 Hint: Make sure API key index ${API_KEY_INDEX} exists for account ${ACCOUNT_INDEX}`);
      console.log(`   You can create API keys using the frontend or the changeApiKey method.\n`);
      return;
    }

    // Example 1: Update to Cross Margin with 3x leverage
    console.log('\n📈 Example 1: Setting CROSS margin mode with 3x leverage');
    const [crossLeverageInfo, crossTxHash, crossError] = await signerClient.updateLeverage(
      MARKET_INDEX,
      SignerClient.CROSS_MARGIN_MODE,
      3  // 3x leverage
    );

    if (crossError) {
      console.error(`❌ Error updating to CROSS margin: ${crossError}`);
    } else {
      console.log(`✅ CROSS margin set successfully!`);
      console.log(`📝 Transaction Hash: ${crossTxHash}`);
      console.log(`📊 Leverage Info:`, JSON.stringify(crossLeverageInfo, null, 2));
    }

    // Wait a bit before next update
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Example 2: Update to Isolated Margin with 5x leverage
    console.log('\n📈 Example 2: Setting ISOLATED margin mode with 20x leverage');
    console.log(`Market Index: ${MARKET_INDEX}`);
    console.log(`Margin Mode: ${SignerClient.ISOLATED_MARGIN_MODE} (1 = ISOLATED, 0 = CROSS)`);
    console.log(`Leverage: 20x (IMF: ${Math.floor(10000 / 20)})`);
    
    const [isolatedLeverageInfo, isolatedTxHash, isolatedError] = await signerClient.updateLeverage(
      MARKET_INDEX,
      SignerClient.ISOLATED_MARGIN_MODE,
      20  // 20x leverage
    );

    if (isolatedError) {
      console.error(`❌ Error updating to ISOLATED margin: ${isolatedError}`);
    } else {
      console.log(`✅ ISOLATED margin set successfully!`);
      console.log(`📝 Transaction Hash: ${isolatedTxHash}`);
      console.log(`📊 Leverage Info:`, JSON.stringify(isolatedLeverageInfo, null, 2));
    }

    // Example 3: Revert back to Cross Margin with 2x leverage
    console.log('\n📈 Example 3: Reverting to CROSS margin mode with 2x leverage');
    const [revertInfo, revertTxHash, revertError] = await signerClient.updateLeverage(
      MARKET_INDEX,
      SignerClient.CROSS_MARGIN_MODE,
      2  // 2x leverage
    );

    if (revertError) {
      console.error(`❌ Error reverting to CROSS margin: ${revertError}`);
    } else {
      console.log(`✅ Reverted to CROSS margin successfully!`);
      console.log(`📝 Transaction Hash: ${revertTxHash}`);
      console.log(`📊 Leverage Info:`, JSON.stringify(revertInfo, null, 2));
    }

    console.log('\n✅ Leverage update examples completed!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);

