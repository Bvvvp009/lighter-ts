# Changelog

All notable changes to the Lighter TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.7] - 2025-11-27

### Added
- **Spot Market Support** - Full support for spot trading markets with dedicated examples
  - `create_spot_limit_order.ts` - Create limit orders on spot markets
  - `create_market_spot_orders.ts` - Create market orders on spot markets (ETH, SOL)
  - `create_spot_twap_order.ts` - Create TWAP orders on spot markets
  - `cancel_spot_order.ts` - Cancel spot market orders
  - Spot market indices: 2048 (ETH SPOT), 2049 (BTC SPOT), 2051 (SOL SPOT)
- **Grouped Orders (OTOCO)** - Support for One-Triggers-Other (OTO) and One-Cancels-Other (OCO) order types
  - `createGroupedOrders()` method for creating OTOCO grouped orders
  - Example in `multi_client_advanced.ts` demonstrating grouped order creation
- **Additional API Methods** - Expanded API coverage
  - Enhanced `modifyOrder()` for order modifications
  - Public pool operations (create, update, mint, burn shares)
  - Subaccount management and operations
  - Account tier management (premium/standard)
  - Margin and leverage management improvements
- **Comprehensive Documentation** - Extensive documentation updates
  - Complete API reference documentation
  - Migration guide for version upgrades
  - Enhanced Getting Started guide
  - Detailed examples documentation
  - Spot market examples README

### Changed
- **Market Index Support** - Extended from `uint8` to `uint16` to support larger market indices (spot markets)

### Fixed
- **Position Detection** - Improved position fetching with retry logic for API synchronization
- **Nonce Management** - Enhanced nonce handling to prevent "invalid nonce" errors
- **Linter Errors** - Fixed undefined variables and type issues

### Improved
- **Examples Quality** - All examples now use environment variables, improved error handling
- **Error Messages** - More descriptive error messages throughout the SDK
- **Type Safety** - Enhanced TypeScript types for better developer experience

## [1.0.6] - 2025-01-XX

### Changed
- **Documentation** - Fixed repository URL placeholder in README
- **Examples** - Removed dangerous default private key values

### Fixed
- **Linter Errors** - Fixed undefined `poolIndex` variable in `public_pool_operations.ts`
- **Spot Examples** - Fixed references to non-existent files in spot README

## [1.0.5] - 2025-10-13

### Added
- **Authentication Examples** - New `create_auth_token.ts` example for creating auth tokens
- **Nonce Manager Example** - Comprehensive `nonce_manager.ts` example for single and multiple API key nonce management
- **Deposit to Subaccounts** - New `deposit_to_subaccounts.ts` example for managing subaccount deposits
- **Transaction Helper Utilities** - New `transaction-helper.ts` with reusable transaction confirmation functions
- **Withdraw to L1** - New `withdraw.ts` example for withdraw funds to L1 Address
- **Market Order with SL/TP** - New `market_order_with_sl_tp.ts` example showing complete workflow for opening position with protection

### Fixed
- **Logger Integration** - Improved consistency in error handling throughout codebase
- **WebSocket Logging** - Removed verbose connection and reconnection logs

### Improved
- **Production Ready** - Source code now suitable for production with minimal logging

## [1.0.4] - 2025-01-29

### Added
- **Standalone WASM signer** - No Go installation required
- **Auto path resolution** - Automatic detection of bundled WASM files
- **Simplified configuration** - No `wasmConfig` needed for basic usage
- **Cross-platform support** - Works on Windows, Linux, macOS without Go
- **Referral points example** - New `get_points.ts` example with auth tokens

### Changed
- **Removed Go dependency** - Users don't need Go installed to use the SDK
- **Updated documentation** - All examples now show simplified configuration
- **Improved WASM runtime** - Uses official Go `wasm_exec.js` instead of custom version
- **Enhanced error handling** - Better runtime initialization error messages

### Fixed
- **WASM initialization** - Fixed `mem.set is not a function` error
- **Runtime compatibility** - Replaced incompatible `wasm_exec_nodejs.js`
- **Memory management** - Proper DataView initialization in WASM runtime
- **Import resolution** - Correct module name mapping for Go runtime

### Security
- **Production ready** - Thoroughly tested on machines with and without Go installation

## [1.0.0] - 2025-01-19

### Added
- Initial release of Lighter TypeScript SDK
- Complete WASM-based signer client implementation
- Full API client coverage for all Lighter Protocol endpoints
- WebSocket client for real-time data streaming
- Comprehensive TypeScript type definitions
- 14 example scripts covering all major functionality
- Complete documentation with API reference
- Support for basic order types (limit, market)
- Account management operations (transfer, leverage updates)
- Batch transaction support
- Automatic reconnection for WebSocket connections
- Error handling and validation throughout
- Environment variable configuration support
- Node.js and browser compatibility

### Features
- **SignerClient**: High-level trading interface with WASM signer
- **ApiClient**: Low-level HTTP API client
- **WsClient**: Real-time WebSocket data streaming
- **Account Management**: Complete account operations
- **Order Management**: Full order lifecycle support
- **Transaction Handling**: Transaction creation and management
- **Type Safety**: Comprehensive TypeScript definitions
- **Error Handling**: Robust error handling throughout
- **Documentation**: Complete API documentation and examples

### API Coverage
- AccountApi: Account information and management
- OrderApi: Order book and trading data
- TransactionApi: Transaction management and history
- BlockApi: Block information and data
- RootApi: System information and status

### Order Types Supported
- Limit orders with various time-in-force options
- Market orders with slippage protection
- Reduce-only orders
- Batch order operations

### Transaction Types Supported
- Create order transactions
- Cancel order transactions
- Cancel all orders transactions
- USDC transfer transactions
- Leverage update transactions

### Examples Included
- `create_market_order.ts` - Basic market order creation
- `create_cancel_order.ts` - Limit order creation and cancellation
- `create_market_order_max_slippage.ts` - Market orders with price protection
- `create_with_multiple_keys.ts` - Multi-key trading
- `system_setup.ts` - Account setup and API key generation
- `transfer_update_leverage.ts` - Account management operations
- `get_info.ts` - API information retrieval
- `ws.ts` - WebSocket real-time data
- `ws_async.ts` - Asynchronous WebSocket handling
- `ws_send_tx.ts` - WebSocket transaction sending
- `send_tx_batch.ts` - Batch transaction processing
- `performance_test.ts` - Basic performance testing
- `market_data_json.ts` - Market data retrieval
- `wait_for_transaction.ts` - Transaction confirmation

### Documentation
- Complete API reference documentation
- Type definitions for all interfaces
- Getting started guide
- Comprehensive examples
- Error handling guidelines
- WebSocket usage guide

### Dependencies
- axios: HTTP client
- dotenv: Environment variable management
- ethers: Ethereum utilities
- ws: WebSocket client
- TypeScript: Type definitions and compilation

### Browser Support
- Modern browsers with WebAssembly support
- WebSocket API support required
- ES2020+ features

### Node.js Support
- Node.js 16+ required
- WebAssembly support
- WebSocket support

## [1.0.2] - 2025-01-26

### Fixed
- Updated README examples with correct method signatures
- Fixed order type constants in documentation
- Corrected transfer and leverage update method parameters
- Updated changelog with precise enhancement descriptions

### Documentation
- Corrected all code examples to match actual API
- Updated order type constants to use proper naming
- Fixed method parameter order in examples
- Enhanced changelog with detailed performance improvements
- Added comprehensive list of new order types

## [1.0.1] - 2025-01-26

### Fixed
- Fixed WASM path resolution issues in NPM packages
- Resolved "Cannot find module" errors for relative WASM paths
- Fixed automatic wasm_exec.js detection in Node.js environments

### Performance
- ~200ms performance improvement in WASM initialization
- Enhanced nonce caching for improved transaction throughput
- Optimized HTTP client with connection pooling
- Memory pool management for reduced allocation overhead
- Request batching for multiple operations
- Advanced caching for frequently accessed data

### Added
- Stop Loss Orders (SL) - Market orders triggered by price levels
- Stop Loss Limit Orders (SLL) - Limit orders triggered by price levels
- Take Profit Orders (TP) - Market orders for profit taking
- Take Profit Limit Orders (TPL) - Limit orders for profit taking
- TWAP Orders - Time-weighted average price orders
- Performance monitoring and benchmarking utilities
- Enhanced error handling and recovery mechanisms
- Comprehensive performance testing examples

### Enhanced
- Automatic WASM path resolution relative to package root
- Improved error messages for better debugging
- Enhanced WebSocket client with better reconnection logic
- Optimized order creation and cancellation workflows
- Better memory management and garbage collection

### Examples
- `final_optimized_performance_test.ts` - Comprehensive performance benchmarking
- `create_sl_tp.ts` - Stop-loss and take-profit order examples
- `ws_send_batch_tx.ts` - WebSocket batch transaction examples
- `close_all_positions.ts` - Position management examples
- Enhanced existing examples with better error handling

### Technical
- Improved TypeScript type definitions
- Better Node.js compatibility across platforms
- Enhanced WASM runtime detection and loading
- Optimized build process and bundle size
- Better documentation and code comments

## [1.0.3] - 2025-01-26

### Fixed
- Removed problematic private key length validation that was causing errors
- Fixed validation issues that were breaking package functionality

## [Unreleased]

### Planned Features
- Additional order types as of API supported 
- Adding SL and Tp to transaction type instead of sending separately send with order
- Additional WebSocket subscriptions 

## [1.0.6] - 2025-01-21

### Fixed
- **Order Status Checking** - Fixed `TypeError: activeOrders is not iterable` by correctly extracting `orders` array from API responses
- **API Response Parsing** - Updated `getAccountActiveOrders()` and `getAccountInactiveOrders()` to extract `orders` field from response
- **Order Matching** - Fixed order lookup to use `client_order_index` field correctly
- **TWAP SL/TP Orders** - Prevented invalid reduce-only direction errors by excluding SL/TP from TWAP batches
- **Field Mapping** - Updated Order interface to match actual API response fields (`filled_base_amount`, `remaining_base_amount`, etc.)

### Added
- **MarketHelper Documentation** - Complete documentation for `docs/MarketHelper.md`
- **Utilities Documentation** - Complete documentation for `docs/Utilities.md` covering order status checking
- **createUnifiedOrder Documentation** - Added comprehensive documentation in `docs/SignerClient.md`
- **TWAP Order Note** - Documented TWAP SL/TP limitation in README and GettingStarted docs

### Changed
- **Documentation Consistency** - Updated all comments to use industry-standard terminology
- **TWAP SL/TP Handling** - TWAP orders now skip SL/TP in batch to prevent position-related errors
