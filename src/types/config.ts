/**
 * Configuration-related type definitions
 * Types for SDK configuration and settings
 */

// Main Configuration
export interface Configuration {
  host: string;
  apiKey?: string;
  secretKey?: string;
  timeout?: number;
  userAgent?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

// Pagination Types
export interface PaginationParams {
  index?: number;
  limit?: number;
}

// WebSocket Configuration
export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onOpen?: () => void;
  onMessage?: (message: any) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

export interface WebSocketSubscription {
  channel: string;
  params: Record<string, any>;
  callback?: (data: any) => void;
}

// Signer Configuration
export interface SignerConfig {
  url: string;
  privateKey: string;
  accountIndex: number;
  apiKeyIndex: number;
  wasmConfig?: WasmSignerConfig;
  enableWebSocket?: boolean;
  enableOptimizations?: boolean;
}

export interface WasmSignerConfig {
  wasmPath?: string;
  wasmExecPath?: string;
}

// API Key Configuration
export interface ApiKeyConfig {
  privateKey: string;
  publicKey: string;
  accountIndex: number;
  apiKeyIndex: number;
}

// Change API Key Parameters
export interface ChangeApiKeyParams {
  ethPrivateKey: string;
  newPubkey: string;
  newPrivateKey: string; // Private key corresponding to newPubkey
  newApiKeyIndex?: number;
}
