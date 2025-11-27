import type { components, paths, operations } from './generated/openapi';
import type {
  ZkLighterInfo,
  ReqGetAccount,
  ReqGetCandlesticks,
  ReqGetOrderBookDetails,
  ReqGetOrderBookOrders,
  ReqGetRecentTrades,
  ReqGetTrades,
  ReqGetTx,
  ReqGetBlock,
  ReqGetBlockTxs,
  ReqGetRangeWithCursor,
  ReqGetRangeWithIndex,
  ReqGetRangeWithIndexSortable
} from './api';

/**
 * Primary type exports
 */
export * from './config';
export * from './api';
export * from './trading';
export * from './transaction';

/**
 * Strongly typed OpenAPI primitives for consumers that need full spec access.
 */
export type OpenApiComponents = components;
export type OpenApiPaths = paths;
export type OpenApiOperations = operations;

/**
 * Convenience aliases that align legacy SDK names with OpenAPI generated types.
 */
export type RootInfo = ZkLighterInfo;
export type AccountParams = ReqGetAccount;
export type CandlestickParams = ReqGetCandlesticks;
export type OrderBookParams = ReqGetOrderBookDetails;
export type OrderDepthParams = ReqGetOrderBookOrders;
export type TradeParams = ReqGetRecentTrades;
export type TradesQueryParams = ReqGetTrades;
export type TransactionParams = ReqGetTx;
export type BlockParams = ReqGetBlock;
export type BlockTransactionsParams = ReqGetBlockTxs;
export type CursorParams = ReqGetRangeWithCursor;
export type IndexPaginationParams = ReqGetRangeWithIndex;
export type SortableIndexPaginationParams = ReqGetRangeWithIndexSortable;