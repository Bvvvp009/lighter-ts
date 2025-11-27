/**
 * Strongly typed aliases mapped from the OpenAPI schema definitions.
 * This file is auto-generated from swagger definitions via scripting; do not edit manually.
 */

import type { components } from './generated/openapi';

type Schemas = components['schemas'];

export type ApiSchemas = Schemas;
export type ApiSchemaName = keyof Schemas;
export type ApiSchema<K extends ApiSchemaName> = Schemas[K];

export type Account = Schemas['Account'];
export type AccountApiKeys = Schemas['AccountApiKeys'];
export type AccountLimits = Schemas['AccountLimits'];
export type AccountMarginStats = Schemas['AccountMarginStats'];
export type AccountMarketStats = Schemas['AccountMarketStats'];
export type AccountMetadata = Schemas['AccountMetadata'];
export type AccountMetadatas = Schemas['AccountMetadatas'];
export type AccountPnL = Schemas['AccountPnL'];
export type AccountPosition = Schemas['AccountPosition'];
export type AccountStats = Schemas['AccountStats'];
export type AccountTradeStats = Schemas['AccountTradeStats'];
export type Announcement = Schemas['Announcement'];
export type Announcements = Schemas['Announcements'];
export type ApiKey = Schemas['ApiKey'];
export type Block = Schemas['Block'];
export type Blocks = Schemas['Blocks'];
export type BridgeSupportedNetwork = Schemas['BridgeSupportedNetwork'];
export type Candlestick = Schemas['Candlestick'];
export type Candlesticks = Schemas['Candlesticks'];
export type ContractAddress = Schemas['ContractAddress'];
export type CurrentHeight = Schemas['CurrentHeight'];
export type Cursor = Schemas['Cursor'];
export type DailyReturn = Schemas['DailyReturn'];
export type DepositHistory = Schemas['DepositHistory'];
export type DepositHistoryItem = Schemas['DepositHistoryItem'];
export type DetailedAccount = Schemas['DetailedAccount'];
export type DetailedAccounts = Schemas['DetailedAccounts'];
export type DetailedCandlestick = Schemas['DetailedCandlestick'];
export type EnrichedTx = Schemas['EnrichedTx'];
export type ExchangeStats = Schemas['ExchangeStats'];
export type ExportData = Schemas['ExportData'];
export type Funding = Schemas['Funding'];
export type FundingRate = Schemas['FundingRate'];
export type FundingRates = Schemas['FundingRates'];
export type Fundings = Schemas['Fundings'];
export type L1Metadata = Schemas['L1Metadata'];
export type L1ProviderInfo = Schemas['L1ProviderInfo'];
export type LiqTrade = Schemas['LiqTrade'];
export type Liquidation = Schemas['Liquidation'];
export type LiquidationInfo = Schemas['LiquidationInfo'];
export type LiquidationInfos = Schemas['LiquidationInfos'];
export type MarketInfo = Schemas['MarketInfo'];
export type NextNonce = Schemas['NextNonce'];
export type Order = Schemas['Order'];
export type OrderBook = Schemas['OrderBook'];
export type OrderBookDepth = Schemas['OrderBookDepth'];
export type OrderBookDetail = Schemas['OrderBookDetail'];
export type OrderBookDetails = Schemas['OrderBookDetails'];
export type OrderBookOrders = Schemas['OrderBookOrders'];
export type OrderBookStats = Schemas['OrderBookStats'];
export type OrderBooks = Schemas['OrderBooks'];
export type Orders = Schemas['Orders'];
export type PnLEntry = Schemas['PnLEntry'];
export type PositionFunding = Schemas['PositionFunding'];
export type PositionFundings = Schemas['PositionFundings'];
export type PriceLevel = Schemas['PriceLevel'];
export type PublicPool = Schemas['PublicPool'];
export type PublicPoolInfo = Schemas['PublicPoolInfo'];
export type PublicPoolMetadata = Schemas['PublicPoolMetadata'];
export type PublicPoolShare = Schemas['PublicPoolShare'];
export type PublicPools = Schemas['PublicPools'];
export type ReferralPointEntry = Schemas['ReferralPointEntry'];
export type ReferralPoints = Schemas['ReferralPoints'];
export type ReqAckNotif = Schemas['ReqAckNotif'];
export type ReqChangeAccountTier = Schemas['ReqChangeAccountTier'];
export type ReqExportData = Schemas['ReqExportData'];
export type ReqGetAccount = Schemas['ReqGetAccount'];
export type ReqGetAccountActiveOrders = Schemas['ReqGetAccountActiveOrders'];
export type ReqGetAccountApiKeys = Schemas['ReqGetAccountApiKeys'];
export type ReqGetAccountByL1Address = Schemas['ReqGetAccountByL1Address'];
export type ReqGetAccountInactiveOrders = Schemas['ReqGetAccountInactiveOrders'];
export type ReqGetAccountLimits = Schemas['ReqGetAccountLimits'];
export type ReqGetAccountMetadata = Schemas['ReqGetAccountMetadata'];
export type ReqGetAccountPnL = Schemas['ReqGetAccountPnL'];
export type ReqGetAccountTxs = Schemas['ReqGetAccountTxs'];
export type ReqGetBlock = Schemas['ReqGetBlock'];
export type ReqGetBlockTxs = Schemas['ReqGetBlockTxs'];
export type ReqGetByAccount = Schemas['ReqGetByAccount'];
export type ReqGetCandlesticks = Schemas['ReqGetCandlesticks'];
export type ReqGetDepositHistory = Schemas['ReqGetDepositHistory'];
export type ReqGetExchangeStats = Schemas['ReqGetExchangeStats'];
export type ReqGetFastWithdrawInfo = Schemas['ReqGetFastWithdrawInfo'];
export type ReqGetFundings = Schemas['ReqGetFundings'];
export type ReqGetL1Metadata = Schemas['ReqGetL1Metadata'];
export type ReqGetL1Tx = Schemas['ReqGetL1Tx'];
export type ReqGetLatestDeposit = Schemas['ReqGetLatestDeposit'];
export type ReqGetLiquidationInfos = Schemas['ReqGetLiquidationInfos'];
export type ReqGetNextNonce = Schemas['ReqGetNextNonce'];
export type ReqGetOrderBookDetails = Schemas['ReqGetOrderBookDetails'];
export type ReqGetOrderBookOrders = Schemas['ReqGetOrderBookOrders'];
export type ReqGetOrderBooks = Schemas['ReqGetOrderBooks'];
export type ReqGetPositionFunding = Schemas['ReqGetPositionFunding'];
export type ReqGetPublicPools = Schemas['ReqGetPublicPools'];
export type ReqGetPublicPoolsMetadata = Schemas['ReqGetPublicPoolsMetadata'];
export type ReqGetRangeWithCursor = Schemas['ReqGetRangeWithCursor'];
export type ReqGetRangeWithIndex = Schemas['ReqGetRangeWithIndex'];
export type ReqGetRangeWithIndexSortable = Schemas['ReqGetRangeWithIndexSortable'];
export type ReqGetRecentTrades = Schemas['ReqGetRecentTrades'];
export type ReqGetReferralPoints = Schemas['ReqGetReferralPoints'];
export type ReqGetTrades = Schemas['ReqGetTrades'];
export type ReqGetTransferFeeInfo = Schemas['ReqGetTransferFeeInfo'];
export type ReqGetTransferHistory = Schemas['ReqGetTransferHistory'];
export type ReqGetTx = Schemas['ReqGetTx'];
export type ReqGetWithdrawHistory = Schemas['ReqGetWithdrawHistory'];
export type ReqSendTx = Schemas['ReqSendTx'];
export type ReqSendTxBatch = Schemas['ReqSendTxBatch'];
export type RespChangeAccountTier = Schemas['RespChangeAccountTier'];
export type RespGetFastBridgeInfo = Schemas['RespGetFastBridgeInfo'];
export type RespPublicPoolsMetadata = Schemas['RespPublicPoolsMetadata'];
export type RespSendTx = Schemas['RespSendTx'];
export type RespSendTxBatch = Schemas['RespSendTxBatch'];
export type RespWithdrawalDelay = Schemas['RespWithdrawalDelay'];
export type ResultCode = Schemas['ResultCode'];
export type RiskInfo = Schemas['RiskInfo'];
export type RiskParameters = Schemas['RiskParameters'];
export type SharePrice = Schemas['SharePrice'];
export type SimpleOrder = Schemas['SimpleOrder'];
export type Status = Schemas['Status'];
export type SubAccounts = Schemas['SubAccounts'];
export type Ticker = Schemas['Ticker'];
export type Trade = Schemas['Trade'];
export type Trades = Schemas['Trades'];
export type TransferFeeInfo = Schemas['TransferFeeInfo'];
export type TransferHistory = Schemas['TransferHistory'];
export type TransferHistoryItem = Schemas['TransferHistoryItem'];
export type Tx = Schemas['Tx'];
export type TxHash = Schemas['TxHash'];
export type TxHashes = Schemas['TxHashes'];
export type Txs = Schemas['Txs'];
export type ValidatorInfo = Schemas['ValidatorInfo'];
export type WithdrawHistory = Schemas['WithdrawHistory'];
export type WithdrawHistoryItem = Schemas['WithdrawHistoryItem'];
export type ZkLighterInfo = Schemas['ZkLighterInfo'];

/**
 * Custom L1 bridge and transaction parameter types not covered by the OpenAPI schema.
 */
export interface TransferParams {
  toAccountIndex: number;
  usdcAmount: number;
  fee: number;
  memo: string;
  ethPrivateKey: string;
  nonce?: number;
}

export interface WithdrawParams {
  usdcAmount: number;
  nonce?: number;
}

export interface L1DepositParams {
  ethPrivateKey: string;
  usdcAmount: number;
  l2AccountIndex: number;
  rpcUrl?: string;
  gasPrice?: string;
  gasLimit?: number;
}

export interface L1DepositResult {
  l1TxHash: string;
  l2AccountIndex: number;
  amount: string;
  status: 'pending' | 'completed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
}

export interface L1BridgeConfig {
  l1BridgeContract: string;
  usdcContract: string;
  rpcUrl: string;
  chainId: number;
}