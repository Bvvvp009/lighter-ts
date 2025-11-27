/**
 * Example: Create Auth Token
 * Demonstrates creating authentication tokens for API requests
 */

import { SignerClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function createAuthToken() {
  console.log('Creating Auth Token...');

  // Use environment variables for configuration
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "4");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  // Validate required environment variables
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    // Create short-lived auth token (default ~10 minutes)
    const authToken = await signerClient.createAuthToken();
    console.log(`Auth token created: ${authToken}`);
    
    // Create custom duration token (maximum 8 hour)
    const oneHourInSeconds = 8 *60 * 60;
    const longToken = await signerClient.createAuthTokenWithExpiry(oneHourInSeconds);
    console.log(`8-hour token created: ${longToken}`);

    console.log('Auth tokens created successfully');

  } catch (error) {
    console.error('Error creating auth token:', error);
  }
}

// Run the example
if (require.main === module) {
  createAuthToken().catch(console.error);
}

export { createAuthToken };
