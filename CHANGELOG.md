# Changelog

All notable changes to the Lighter TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Additional order types
- Enhanced error recovery
- Additional WebSocket subscriptions
- Enhanced documentation
- Unit tests
- Integration tests
- CI/CD pipeline
