// Performance testing for order placement latency
import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

interface PerformanceMetrics {
  wasmInitialization: number;
  clientSetup: number;
  orderCreation: number;
  totalTime: number;
}

async function measureOrderPlacementPerformance(): Promise<PerformanceMetrics> {
  if (!API_KEY_PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  const metrics: PerformanceMetrics = {
    wasmInitialization: 0,
    clientSetup: 0,
    orderCreation: 0,
    totalTime: 0
  };

  const startTime = performance.now();

  console.log('🚀 Starting performance test...');

  // 1. Client initialization
  const clientSetupStart = performance.now();
  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });
  metrics.clientSetup = performance.now() - clientSetupStart;

  // 2. WASM initialization
  const wasmInitStart = performance.now();
  await client.initialize();
  await (client as any).ensureWasmClient();
  metrics.wasmInitialization = performance.now() - wasmInitStart;

  // 3. Client validation
  const err = client.checkClient();
  if (err) {
    throw new Error(`CheckClient error: ${err}`);
  }

  console.log(`✅ Client setup: ${metrics.clientSetup.toFixed(2)}ms`);
  console.log(`✅ WASM initialization: ${metrics.wasmInitialization.toFixed(2)}ms`);

  // 4. Measure complete order creation
  const orderStart = performance.now();
  const [, txHash, createErr] = await client.createMarketOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 1000000, // 0.001 ETH
    avgExecutionPrice: 4000,
    isAsk: true,
    reduceOnly: false
  });
  metrics.orderCreation = performance.now() - orderStart;

  if (createErr) {
    throw new Error(`Order creation failed: ${createErr}`);
  }

  console.log(`✅ Order creation: ${metrics.orderCreation.toFixed(2)}ms`);
  console.log(`📋 Transaction hash: ${txHash ? txHash.substring(0, 16) + '...' : 'None'}`);

  metrics.totalTime = performance.now() - startTime;

  await client.close();

  return metrics;
}

async function runPerformanceBenchmark(iterations: number = 5): Promise<void> {
  console.log(`🧪 Running performance benchmark (${iterations} iterations)...\n`);

  const results: PerformanceMetrics[] = [];

  for (let i = 0; i < iterations; i++) {
    console.log(`\n--- Iteration ${i + 1}/${iterations} ---`);
    try {
      const metrics = await measureOrderPlacementPerformance();
      results.push(metrics);
      
      console.log(`📊 Total time: ${metrics.totalTime.toFixed(2)}ms`);
      console.log(`📋 Transaction hash: ${metrics.orderCreation > 0 ? 'Success' : 'Failed'}`);
    } catch (error) {
      console.error(`❌ Iteration ${i + 1} failed:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  if (results.length === 0) {
    console.log('❌ No successful iterations completed');
    return;
  }

  // Calculate statistics
  const avgMetrics: PerformanceMetrics = {
    wasmInitialization: 0,
    clientSetup: 0,
    orderCreation: 0,
    totalTime: 0
  };

  const firstResult = results[0];
  const minMetrics: PerformanceMetrics = {
    wasmInitialization: firstResult.wasmInitialization,
    clientSetup: firstResult.clientSetup,
    orderCreation: firstResult.orderCreation,
    totalTime: firstResult.totalTime
  };
  const maxMetrics: PerformanceMetrics = {
    wasmInitialization: firstResult.wasmInitialization,
    clientSetup: firstResult.clientSetup,
    orderCreation: firstResult.orderCreation,
    totalTime: firstResult.totalTime
  };

  for (const result of results) {
    avgMetrics.wasmInitialization += result.wasmInitialization;
    avgMetrics.clientSetup += result.clientSetup;
    avgMetrics.orderCreation += result.orderCreation;
    avgMetrics.totalTime += result.totalTime;

    minMetrics.wasmInitialization = Math.min(minMetrics.wasmInitialization, result.wasmInitialization);
    minMetrics.clientSetup = Math.min(minMetrics.clientSetup, result.clientSetup);
    minMetrics.orderCreation = Math.min(minMetrics.orderCreation, result.orderCreation);
    minMetrics.totalTime = Math.min(minMetrics.totalTime, result.totalTime);

    maxMetrics.wasmInitialization = Math.max(maxMetrics.wasmInitialization, result.wasmInitialization);
    maxMetrics.clientSetup = Math.max(maxMetrics.clientSetup, result.clientSetup);
    maxMetrics.orderCreation = Math.max(maxMetrics.orderCreation, result.orderCreation);
    maxMetrics.totalTime = Math.max(maxMetrics.totalTime, result.totalTime);
  }

  // Calculate averages
  const count = results.length;
  avgMetrics.wasmInitialization /= count;
  avgMetrics.clientSetup /= count;
  avgMetrics.orderCreation /= count;
  avgMetrics.totalTime /= count;

  console.log('\n📈 PERFORMANCE BENCHMARK RESULTS');
  console.log('=====================================');
  console.log(`Success rate: ${results.length}/${iterations} (${(results.length/iterations*100).toFixed(1)}%)`);
  console.log('\n📊 AVERAGE TIMES:');
  console.log(`  Client Setup:     ${avgMetrics.clientSetup.toFixed(2)}ms`);
  console.log(`  WASM Init:        ${avgMetrics.wasmInitialization.toFixed(2)}ms`);
  console.log(`  Order Creation:   ${avgMetrics.orderCreation.toFixed(2)}ms`);
  console.log(`  TOTAL TIME:       ${avgMetrics.totalTime.toFixed(2)}ms`);

  console.log('\n⚡ MINIMUM TIMES:');
  console.log(`  Client Setup:     ${minMetrics.clientSetup.toFixed(2)}ms`);
  console.log(`  WASM Init:        ${minMetrics.wasmInitialization.toFixed(2)}ms`);
  console.log(`  Order Creation:   ${minMetrics.orderCreation.toFixed(2)}ms`);
  console.log(`  TOTAL TIME:       ${minMetrics.totalTime.toFixed(2)}ms`);

  console.log('\n🐌 MAXIMUM TIMES:');
  console.log(`  Client Setup:     ${maxMetrics.clientSetup.toFixed(2)}ms`);
  console.log(`  WASM Init:        ${maxMetrics.wasmInitialization.toFixed(2)}ms`);
  console.log(`  Order Creation:   ${maxMetrics.orderCreation.toFixed(2)}ms`);
  console.log(`  TOTAL TIME:       ${maxMetrics.totalTime.toFixed(2)}ms`);

  // Performance analysis
  console.log('\n🔍 PERFORMANCE ANALYSIS:');
  console.log('========================');
  
  console.log(`Core order creation: ${avgMetrics.orderCreation.toFixed(2)}ms`);
  console.log(`  - Includes: nonce retrieval, order signing, and submission`);

  console.log('\n💡 OPTIMIZATION RECOMMENDATIONS:');
  console.log('==================================');
  
  if (avgMetrics.wasmInitialization > 100) {
    console.log('⚠️  WASM initialization is slow - consider pre-initializing');
  }
  if (avgMetrics.orderCreation > 100) {
    console.log('⚠️  Order creation is slow - check network and WASM performance');
  }
  
  if (avgMetrics.orderCreation < 50) {
    console.log('✅ Excellent performance! Order creation under 50ms');
  } else if (avgMetrics.orderCreation < 100) {
    console.log('✅ Good performance! Order creation under 100ms');
  } else if (avgMetrics.orderCreation < 200) {
    console.log('⚠️  Acceptable performance, but could be improved');
  } else {
    console.log('❌ Poor performance! Order creation over 200ms');
  }

  console.log('\n🏆 COMPETITIVE ANALYSIS:');
  console.log('========================');
  console.log('Expected performance ranges:');
  console.log('  - Python SDK: ~100-300ms (interpreted, ctypes overhead)');
  console.log('  - Go SDK: ~20-80ms (compiled, native performance)');
  console.log('  - TypeScript SDK: ~50-150ms (V8 JIT, WASM)');
  
  if (avgMetrics.orderCreation < 80) {
    console.log('🎯 Our TypeScript SDK is competitive with Go SDK!');
  } else if (avgMetrics.orderCreation < 150) {
    console.log('🎯 Our TypeScript SDK is competitive with Python SDK!');
  } else {
    console.log('🎯 Our TypeScript SDK needs optimization to be competitive');
  }
}

if (require.main === module) {
  runPerformanceBenchmark(3).catch(console.error);
}
