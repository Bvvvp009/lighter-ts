import { ApiClient, TransactionApi } from '../src';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// The API_KEY_PRIVATE_KEY provided belongs to a dummy account registered on Testnet.
// It was generated using the setup_system.py script, and serves as an example.
const BASE_URL = "https://testnet.zklighter.elliot.ai";
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = 1146;
const API_KEY_INDEX = 0;

function trimException(e: any): string {
  return e.toString().trim().split('\n').pop() || e.toString();
}

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable is required');
    return;
  }

  const apiClient = new ApiClient({ host: BASE_URL });
  const transactionApi = new TransactionApi(apiClient);

  try {
    // Get next nonce to demonstrate the API structure
    console.log('Getting next nonce...');
    const nextNonce = await transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
    console.log(`Next nonce: ${nextNonce.nonce}`);

    // Demonstrate the transaction structure that would be sent
    console.log('\n=== Transaction Structure Demo ===');
    
    // Create order transaction structure (this is what would be signed)
    const createOrderTx = {
      AccountIndex: ACCOUNT_INDEX,
      OrderBookIndex: 0,
      ClientOrderIndex: 123,
      BaseAmount: 100000,
      Price: 270000,
      IsAsk: 1,
      OrderType: 0, // ORDER_TYPE_LIMIT
      TimeInForce: 1, // ORDER_TIME_IN_FORCE_GOOD_TILL_TIME
      ReduceOnly: 0,
      TriggerPrice: 0,
      Nonce: nextNonce.nonce,
    };

    console.log('Create Order Transaction Structure:');
    console.log(JSON.stringify(createOrderTx, null, 2));

    // Cancel order transaction structure
    const cancelOrderTx = {
      AccountIndex: ACCOUNT_INDEX,
      OrderBookIndex: 0,
      OrderIndex: 123,
      Nonce: nextNonce.nonce + 1,
    };

    console.log('\nCancel Order Transaction Structure:');
    console.log(JSON.stringify(cancelOrderTx, null, 2));

    // Show what the API call would look like
    console.log('\n=== API Call Structure ===');
    console.log('For create order:');
    console.log(`POST /api/v1/sendTx`);
    console.log(`tx_type: 14 (TX_TYPE_CREATE_ORDER)`);
    console.log(`tx_info: ${JSON.stringify(createOrderTx)}`);

    console.log('\nFor cancel order:');
    console.log(`POST /api/v1/sendTx`);
    console.log(`tx_type: 15 (TX_TYPE_CANCEL_ORDER)`);
    console.log(`tx_info: ${JSON.stringify(cancelOrderTx)}`);

    console.log('\n=== Note ===');
    console.log('In a real implementation, the transaction would be signed with the private key');
    console.log('and the signature would be added as a "Sig" field to the tx_info JSON.');
    console.log('This demo shows the structure without actual signing.');

  } catch (error) {
    console.error(`Error: ${trimException(error)}`);
  } finally {
    await apiClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
} 