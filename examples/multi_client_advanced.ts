/**
 * Example: Advanced Multi-Client Operations
 * 
 * This example demonstrates using multiple API keys and accounts with all
 * the new transaction methods (createSubAccount, modifyOrder, public pools, etc.)
 */

import { SignerClient, ApiClient, OrderType, TimeInForce } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function multiClientAdvancedExample() {
  const API_KEY_1 = process.env['API_PRIVATE_KEY'] || "";
  if (!API_KEY_1) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const API_KEY_2 = "a900ad2f39b9f55dbf5471f8ca7cf9c8ffbcb3a9205dd2f53b6163a5fc294425ca3bebfbc38fdf74";
  const API_KEY_INDEX_1 = 4;
  const API_KEY_INDEX_2 = 5;
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';
  // Client 1: Master account with API key index 1
  const client1 = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_1,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX_1,
  });

  // Client 2: Same account but different API key index
  const client2 = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_2,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX_2,
  });

  try {
    // Initialize both clients
    console.log('📝 Initializing clients...');
    await client1.initialize();
    await client1.ensureWasmClient();
    await client2.initialize();
    await client2.ensureWasmClient();
    console.log('✅ Both clients initialized\n');

    // Example 1: Create sub account with client 1
    console.log('='.repeat(60));
    console.log('Example 1: Create Sub Account with Client 1');
    console.log('='.repeat(60));
    const [subAccountInfo, subTxHash, subError] = await client1.createSubAccount();
    if (subError) {
      console.error('❌ Failed to create sub account:', subError);
    } else {
      console.log('✅ Sub account created!');
      console.log('🔗 Transaction Hash:', subTxHash);
      if (subTxHash) {
        await client1.waitForTransaction(subTxHash, 60000, 2000);
      }
    }

    // Example 2: Create order with client 1, modify with client 2
    console.log('\n' + '='.repeat(60));
    console.log('Example 2: Create Order with Client 1, Modify with Client 2');
    console.log('='.repeat(60));
    
    // Create order with client 1
    const [orderInfo, orderTxHash, orderError] = await client1.createOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: 1000000,
      price: 300000,
      isAsk: false,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0,
      orderExpiry: Date.now() + (28 * 24 * 60 * 60 * 1000),
    });

    if (orderError) {
      console.error('❌ Failed to create order:', orderError);
    } else {
      console.log('✅ Order created with Client 1');
      console.log('🔗 Transaction Hash:', orderTxHash);
      
      // Extract order index from order info
      const orderIndex = (orderInfo as any)?.OrderIndex || (orderInfo as any)?.orderIndex;
      
      if (orderIndex) {
        // Modify order with client 2 (different API key)
        console.log(`\n📝 Modifying order ${orderIndex} with Client 2...`);
        const [modifyInfo, modifyTxHash, modifyError] = await client2.modifyOrder(
          0,        // marketIndex
          orderIndex,
          1500000,  // new baseAmount
          310000,   // new price
          0         // triggerPrice
        );

        if (modifyError) {
          console.error('❌ Failed to modify order:', modifyError);
        } else {
          console.log('✅ Order modified with Client 2');
          console.log('🔗 Transaction Hash:', modifyTxHash);
        }
      }
    }

    // Example 3: Create public pool with client 1, update with client 2
    console.log('\n' + '='.repeat(60));
    console.log('Example 3: Create Public Pool with Client 1, Update with Client 2');
    console.log('='.repeat(60));
    
    const [poolInfo, poolTxHash, poolError] = await client1.createPublicPool(
      100,      // operatorFee: 1%
      1000000,  // initialTotalShares
      5000      // minOperatorShareRate: 50%
    );

    if (poolError) {
      console.error('❌ Failed to create public pool:', poolError);
    } else {
      console.log('✅ Public pool created with Client 1');
      console.log('🔗 Transaction Hash:', poolTxHash);
      
      // Extract public pool index
      const publicPoolIndex = (poolInfo as any)?.PublicPoolIndex || (poolInfo as any)?.publicPoolIndex || 0;
      
      if (publicPoolIndex) {
        // Update pool with client 2
        console.log(`\n📝 Updating public pool ${publicPoolIndex} with Client 2...`);
        const [updateInfo, updateTxHash, updateError] = await client2.updatePublicPool(
          publicPoolIndex,
          1,    // status: active
          150,  // operatorFee: 1.5%
          6000  // minOperatorShareRate: 60%
        );

        if (updateError) {
          console.error('❌ Failed to update public pool:', updateError);
        } else {
          console.log('✅ Public pool updated with Client 2');
          console.log('🔗 Transaction Hash:', updateTxHash);
        }
      }
    }

    // Example 4: Update margin with different clients
    console.log('\n' + '='.repeat(60));
    console.log('Example 4: Update Margin with Different Clients');
    console.log('='.repeat(60));
    
    // Add margin with client 1
    console.log('📝 Adding margin with Client 1...');
    const [addMarginInfo, addTxHash, addError] = await client1.updateMargin(
      0,    // marketIndex
      100,  // usdcAmount: 100 USDC
      0     // direction: 0 = add
    );

    if (addError) {
      console.error('❌ Failed to add margin:', addError);
    } else {
      console.log('✅ Margin added with Client 1');
      console.log('🔗 Transaction Hash:', addTxHash);
    }

    // Remove margin with client 2
    console.log('\n📝 Removing margin with Client 2...');
    const [removeMarginInfo, removeTxHash, removeError] = await client2.updateMargin(
      0,   // marketIndex
      50,  // usdcAmount: 50 USDC
      1    // direction: 1 = remove
    );

    if (removeError) {
      console.error('❌ Failed to remove margin:', removeError);
    } else {
      console.log('✅ Margin removed with Client 2');
      console.log('🔗 Transaction Hash:', removeTxHash);
    }

    // Example 5: Create grouped orders with different clients
    console.log('\n' + '='.repeat(60));
    console.log('Example 5: Create Grouped Orders with Different Clients');
    console.log('='.repeat(60));
    
    // OTO orders with client 1
    // CRITICAL: For grouped orders:
    // - ClientOrderIndex MUST be 0 (nil) for all orders
    // - For OTO: Child order (second order) must be a stop-loss or take-profit order
    // - Child order must have BaseAmount = 0 and be reduce-only
    console.log('📝 Creating OTO orders with Client 1...');
    const orderExpiry = Date.now() + (28 * 24 * 60 * 60 * 1000);
    const currentPrice = 292000; // Approximate current price
    const [groupedInfo, groupedTxHash, groupedError] = await client1.createGroupedOrders(
      1, // groupingType: OTO (One Triggers Other)
      [
        {
          marketIndex: 0,
          clientOrderIndex: 0, // MUST be 0 for grouped orders (nil)
          baseAmount: 1000000, // Parent order has baseAmount
          price: 300000,
          isAsk: false, // Buy order
          orderType: OrderType.LIMIT,
          timeInForce: TimeInForce.GOOD_TILL_TIME,
          orderExpiry: orderExpiry,
          reduceOnly: false
        },
        {
          marketIndex: 0,
          clientOrderIndex: 0, // MUST be 0 for grouped orders (nil)
          baseAmount: 0, // CRITICAL: Child order in OTO must have BaseAmount = 0
          price: 290000,
          isAsk: true, // CRITICAL: Child order must be opposite direction (sell to close long)
          orderType: SignerClient.ORDER_TYPE_STOP_LOSS, // Child must be stop-loss or take-profit (Type 2)
          timeInForce: TimeInForce.IMMEDIATE_OR_CANCEL, // Child orders use IOC
          triggerPrice: 285000, // Trigger price for stop-loss
          orderExpiry: orderExpiry,
          reduceOnly: true // Child orders are always reduce-only
        }
      ]
    );

    if (groupedError) {
      console.error('❌ Failed to create grouped orders:', groupedError);
    } else {
      console.log('✅ Grouped orders created with Client 1');
      console.log('🔗 Transaction Hash:', groupedTxHash);
    }

    console.log('\n🎉 All multi-client operations completed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client1.close();
    await client2.close();
  }
}

if (require.main === module) {
  multiClientAdvancedExample().catch(console.error);
}

export { multiClientAdvancedExample };




