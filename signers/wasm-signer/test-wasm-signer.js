// Test file for WASM signer
// This demonstrates how to use the compiled WASM signer

import { SignerClient } from '../src/signer/wasm-signer-client';

async function testWasmSigner() {
    console.log('Testing WASM signer...');
    
    try {
        // Initialize the signer client with WASM configuration
        const client = new SignerClient({
            url: 'https://testnet.zklighter.elliot.ai',
            privateKey: 'your-private-key-here',
            accountIndex: 1,
            apiKeyIndex: 1,
            wasmConfig: {
                wasmPath: './lighter-signer.wasm',
                wasmExecPath: './wasm_exec.js'
            }
        });
        
        // Initialize the WASM signer
        await client.initialize();
        console.log('WASM signer initialized successfully!');
        
        // Test API key generation
        const apiKey = await client.generateAPIKey();
        if (apiKey) {
            console.log('Generated API key:', apiKey);
        }
        
        // Test creating an order
        const [order, txHash, error] = await client.createOrder({
            marketIndex: 1,
            clientOrderIndex: 1,
            baseAmount: 1000000, // 1 USDC in micro units
            price: 50000, // $50.00
            isAsk: false, // Buy order
            orderType: SignerClient.ORDER_TYPE_LIMIT,
            timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
            reduceOnly: false,
            triggerPrice: 0
        });
        
        if (error) {
            console.error('Error creating order:', error);
        } else {
            console.log('Order created successfully:', order);
            console.log('Transaction hash:', txHash);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testWasmSigner();

