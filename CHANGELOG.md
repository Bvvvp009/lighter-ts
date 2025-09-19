# Changelog

All notable changes to the Lighter TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-19

### Added
- Initial release of Lighter TypeScript SDK
- Complete WASM-based signer client implementation
- Full API client coverage for all Lighter Protocol endpoints
- WebSocket client for real-time data streaming
- Comprehensive TypeScript type definitions
- 14 example scripts covering all major functionality
- Complete documentation with API reference
- Support for all order types (limit, market, stop-loss, take-profit)
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
- Stop-loss and take-profit orders
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
- `create_sl_tp.ts` - Stop-loss and take-profit orders
- `create_with_multiple_keys.ts` - Multi-key trading
- `system_setup.ts` - Account setup and API key generation
- `transfer_update_leverage.ts` - Account management operations
- `get_info.ts` - API information retrieval
- `ws.ts` - WebSocket real-time data
- `ws_async.ts` - Asynchronous WebSocket handling
- `ws_send_tx.ts` - WebSocket transaction sending
- `ws_send_batch_tx.ts` - WebSocket batch transactions
- `send_tx_batch.ts` - Batch transaction processing

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

## [Unreleased]

### Planned Features
- Additional order types
- Enhanced error recovery
- Performance optimizations
- Additional WebSocket subscriptions
- Enhanced documentation
- Unit tests
- Integration tests
- CI/CD pipeline
