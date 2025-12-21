/**
 * Example: Fast Withdrawal
 
 * IMPORTANT: Private key requirements:
 * 1. API_PRIVATE_KEY - Required for L2 (Layer 2) transaction signing (done by WASM internally)
 * 2. ETH_PRIVATE_KEY / ACCOUNT_PRIVATE_KEY - Optional for L1 (Ethereum) signature
 *    - L1 signature is OPTIONAL - transfers work with only L2 signature (API key signature)
 *    - If provided, must be an Ethereum wallet private key (NOT the API key)
 */

import { SignerClient, ApiClient, TransactionApi } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function withdrawFast() {
  console.log('🚀 Fast Withdrawal Example\n');

  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0');
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0');
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const ETH_PRIVATE_KEY = process.env['ETH_PRIVATE_KEY'] || process.env['ACCOUNT_PRIVATE_KEY'] || '';
  const WITHDRAW_ADDRESS = process.env['L1_ADDRESS'] || '';
  const AMOUNT_USDC = parseFloat(process.env['WITHDRAW_AMOUNT'] || '5.0');

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  if (!WITHDRAW_ADDRESS) {
    throw new Error('WITHDRAW_ADDRESS environment variable is required');
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

  const transactionApi = new TransactionApi(apiClient);

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    console.log('✅ Clients initialized\n');

    // Step 1: Create auth token
    console.log('🔑 Creating auth token...');
    const authToken = await signerClient.createAuthTokenWithExpiry(3600); // 1 hour expiry
    console.log('✅ Auth token created\n');

    // Step 2: Get fast withdraw pool info
    console.log('📊 Fetching fast withdraw pool info...');
    const poolInfoResponse = await apiClient.get('/api/v1/fastwithdraw/info', {
      account_index: ACCOUNT_INDEX.toString()
    }, {
      headers: {
        'Authorization': authToken
      }
    });

    if (poolInfoResponse.data.code !== 200) {
      throw new Error(`Pool info failed: ${poolInfoResponse.data.message || 'Unknown error'}`);
    }

    const poolInfo = poolInfoResponse.data;
    const toAccount = poolInfo.to_account_index;
    const withdrawLimit = poolInfo.withdraw_limit || poolInfo.fast_bridge_limit;

    console.log(`✅ Pool info retrieved:`);
    console.log(`   Pool account: ${toAccount}`);
    console.log(`   Withdraw limit: ${withdrawLimit}\n`);

    // Step 3: Get transfer fee
    console.log('💰 Fetching transfer fee...');
    const feeInfoResponse = await apiClient.get('/api/v1/transferFeeInfo', {
      account_index: ACCOUNT_INDEX.toString(),
      to_account_index: toAccount.toString()
    }, {
      headers: {
        'Authorization': authToken
      }
    });

    const feeInfo = feeInfoResponse.data;
    const fee = feeInfo.transfer_fee_usdc; // Already in scaled units (int)
    console.log(`✅ Transfer fee: ${fee / 1e6} USDC\n`);

    // Step 4: Get nonce
    console.log('🔢 Fetching next nonce...');
    const nextNonce = await transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
    console.log(`✅ Next nonce: ${nextNonce.nonce}\n`);

    console.log('📝 Building memo from withdraw address...');
    const addrHex = WITHDRAW_ADDRESS.toLowerCase().replace(/^0x/, '');
    const addrBytes = Buffer.from(addrHex, 'hex');
    if (addrBytes.length !== 20) {
      throw new Error(`Invalid address length: ${addrBytes.length}. Expected 20 bytes (40 hex chars)`);
    }
    const memoBytes = Buffer.concat([addrBytes, Buffer.alloc(12, 0)]);
    const memoHex = memoBytes.toString('hex');
    console.log(`✅ Memo: ${memoHex}\n`);

    // Step 6: Sign transfer transaction
    console.log('✍️  Signing transfer transaction...');
    const scaledAmount = Math.floor(AMOUNT_USDC * 1e6); // USDC has 6 decimals

    const wasmClient = (signerClient as any).wallet;
    const signedTx = await wasmClient.signTransfer({
      toAccountIndex: toAccount,
      asset_id: 3, // USDC asset index (3 = USDCAssetIndex)
      is_spot_account: false, // Perp account
      usdcAmount: scaledAmount,
      fee: fee,
      memo: memoHex,
      nonce: nextNonce.nonce,
      apiKeyIndex: API_KEY_INDEX,
      accountIndex: ACCOUNT_INDEX
    });

    if (signedTx.error) {
      throw new Error(`L2 signing failed: ${signedTx.error}`);
    }

    console.log('✅ Transfer transaction signed\n');

  
    let txInfo = signedTx.txInfo;
    if (signedTx.messageToSign && ETH_PRIVATE_KEY) {
      console.log('🔐 Signing L1 message with Ethereum private key (optional)...');
      try {
        const { ethers } = require('ethers');
        const wallet = new ethers.Wallet(ETH_PRIVATE_KEY); // ETH_PRIVATE_KEY = Ethereum wallet private key
        
        // Sign the message - ethers.signMessage automatically adds Ethereum message prefix
        const l1Signature = await wallet.signMessage(signedTx.messageToSign);
        console.log('✅ L1 signature created\n');
        
        // Parse tx_info JSON and add L1 signature to L1Sig field
        const txInfoObj = JSON.parse(txInfo);
        txInfoObj.L1Sig = l1Signature;
        txInfo = JSON.stringify(txInfoObj);
        console.log('✅ L1 signature added to transaction info\n');
      } catch (e) {
        throw new Error(`Failed to sign L1 message: ${e instanceof Error ? e.message : e}`);
      }
    } else if (signedTx.messageToSign && !ETH_PRIVATE_KEY) {
      console.log('ℹ️  L1 signature message available but ETH_PRIVATE_KEY not provided - using only L2 signature\n');
    }

    // Step 7: Submit to fastwithdraw endpoint
    console.log('📤 Submitting fast withdrawal...');
    const params = new URLSearchParams();
    params.append('tx_info', txInfo);
    params.append('to_address', WITHDRAW_ADDRESS);

    const fastWithdrawResponse = await apiClient.post('/api/v1/fastwithdraw', params, {
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const result = fastWithdrawResponse.data;

    if (result.code === 200) {
      console.log('✅✅✅ SUCCESS! Fast withdrawal submitted! ✅✅✅\n');
      console.log(`Transaction Hash: ${result.tx_hash || result.txHash || 'N/A'}`);
      console.log(`Amount: ${AMOUNT_USDC} USDC`);
      console.log(`To Address: ${WITHDRAW_ADDRESS}\n`);
    } else {
      throw new Error(`Fast withdrawal failed: ${result.message || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run the example
if (require.main === module) {
  withdrawFast().catch(console.error);
}

export { withdrawFast };

