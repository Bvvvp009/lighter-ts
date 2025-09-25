// Simple performance test for order placement
import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function runSimplePerformanceTest(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable is required');
    return;
  }

  console.log('🚀 Starting simple performance test...\n');

  // Test 1: Client initialization
  console.log('📊 Testing client initialization...');
  const initStart = performance.now();
  
  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await (client as any).ensureWasmClient();
  
  const initTime = performance.now() - initStart;
  console.log(`✅ Client initialization: ${initTime.toFixed(2)}ms\n`);

  // Client validation
  const err = client.checkClient();
  if (err) {
    console.error(`CheckClient error: ${err}`);
    return;
  }

  // Test 2: Order placement performance
  console.log('📊 Testing order placement performance...');
  const orderStart = performance.now();
  
  const [, txHash, createErr] = await client.createMarketOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 1000000, // 0.001 ETH
    avgExecutionPrice: 4000,
    isAsk: true,
    reduceOnly: false
  });
  
  const orderTime = performance.now() - orderStart;
  
  if (createErr) {
    console.error(`❌ Order creation failed: ${createErr}`);
  } else {
    console.log(`✅ Order creation: ${orderTime.toFixed(2)}ms`);
    console.log(`📋 Transaction hash: ${txHash ? txHash.substring(0, 16) + '...' : 'None'}`);
  }

  await client.close();

  // Performance analysis
  console.log('\n🔍 PERFORMANCE ANALYSIS');
  console.log('========================');
  console.log(`Client initialization: ${initTime.toFixed(2)}ms`);
  console.log(`Order placement:       ${orderTime.toFixed(2)}ms`);
  console.log(`Total time:            ${(initTime + orderTime).toFixed(2)}ms`);

  console.log('\n🏆 COMPETITIVE ANALYSIS');
  console.log('========================');
  console.log('Expected performance ranges:');
  console.log('  - Python SDK: ~100-300ms (interpreted, ctypes overhead)');
  console.log('  - Go SDK: ~20-80ms (compiled, native performance)');
  console.log('  - TypeScript SDK: ~50-150ms (V8 JIT, WASM)');

  console.log('\n💡 PERFORMANCE ASSESSMENT:');
  console.log('===========================');
  
  if (orderTime < 50) {
    console.log('🎯 EXCELLENT! Order placement under 50ms - competitive with Go SDK');
  } else if (orderTime < 100) {
    console.log('🎯 GOOD! Order placement under 100ms - competitive with Python SDK');
  } else if (orderTime < 200) {
    console.log('⚠️  ACCEPTABLE - Order placement under 200ms, but could be improved');
  } else {
    console.log('❌ SLOW - Order placement over 200ms, needs optimization');
  }

  if (initTime > 100) {
    console.log('⚠️  WASM initialization is slow - consider pre-initializing for production');
  }

  console.log('\n🚀 OPTIMIZATION RECOMMENDATIONS:');
  console.log('=================================');
  
  if (initTime > 50) {
    console.log('• Pre-initialize WASM client for faster startup');
  }
  
  if (orderTime > 100) {
    console.log('• Check network latency and API response times');
    console.log('• Consider implementing order batching for multiple orders');
    console.log('• Profile WASM signing performance');
  }

  console.log('\n📈 PRODUCTION READINESS:');
  console.log('=========================');
  
  const totalTime = initTime + orderTime;
  if (totalTime < 150) {
    console.log('✅ READY for high-frequency trading applications');
  } else if (totalTime < 300) {
    console.log('✅ READY for general trading applications');
  } else {
    console.log('⚠️  May need optimization for real-time trading');
  }

  console.log('\n🔧 TECHNICAL BREAKDOWN:');
  console.log('========================');
  console.log('Order placement includes:');
  console.log('  • Nonce retrieval from API');
  console.log('  • Order signing with WASM');
  console.log('  • Transaction submission to API');
  console.log('  • Network round-trip time');
}

if (require.main === module) {
  runSimplePerformanceTest().catch(console.error);
}
