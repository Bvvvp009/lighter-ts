/**
 * Environment Detection Utilities
 * Provides isomorphic/universal detection for browser, Node.js, and other environments
 */

/**
 * Detect if code is running in a browser environment
 */
export const isBrowser = (): boolean => {
  if (typeof globalThis !== 'undefined') {
    return typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined';
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return true;
  }
  return false;
};

/**
 * Detect if code is running in Node.js environment
 */
export const isNodeJS = (): boolean => {
  if (typeof globalThis !== 'undefined') {
    return typeof globalThis.process !== 'undefined' && globalThis.process?.versions?.node !== undefined;
  }
  if (typeof process !== 'undefined' && process?.versions?.node) {
    return true;
  }
  return false;
};

/**
 * Detect if code is running in a Deno environment
 */
export const isDeno = (): boolean => {
  if (typeof globalThis !== 'undefined') {
    return typeof (globalThis as any).Deno !== 'undefined';
  }
  return false;
};

/**
 * Detect if code is running in a Worker environment (Web Worker, Service Worker, etc.)
 */
export const isWorker = (): boolean => {
  if (typeof globalThis !== 'undefined') {
    return typeof (globalThis as any).importScripts === 'function';
  }
  return false;
};

/**
 * Detect if code is running in Next.js environment
 */
export const isNextJS = (): boolean => {
  try {
    if (typeof globalThis !== 'undefined') {
      return typeof (globalThis as any).__NEXT_DATA__ !== 'undefined';
    }
  } catch (e) {
    // Ignore errors
  }
  return false;
};

/**
 * Detect if code is running on the client side in Next.js
 */
export const isNextJSClient = (): boolean => {
  return isNextJS() && isBrowser();
};

/**
 * Detect if code is running on the server side in Next.js
 */
export const isNextJSServer = (): boolean => {
  return isNextJS() && !isBrowser();
};

/**
 * Detect if code is running in React Native
 */
export const isReactNative = (): boolean => {
  try {
    if (typeof globalThis !== 'undefined') {
      return typeof (globalThis as any).HermesInternal !== 'undefined' ||
             (typeof navigator !== 'undefined' && navigator.product === 'ReactNative');
    }
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      return true;
    }
  } catch (e) {
    // Ignore errors
  }
  return false;
};

/**
 * Get the current runtime environment name
 */
export enum RuntimeEnvironment {
  Browser = 'browser',
  NodeJS = 'nodejs',
  NextJSClient = 'nextjs-client',
  NextJSServer = 'nextjs-server',
  Deno = 'deno',
  ReactNative = 'react-native',
  Worker = 'worker',
  Unknown = 'unknown'
}

/**
 * Detect the current runtime environment
 */
export const detectEnvironment = (): RuntimeEnvironment => {
  if (isNextJSClient()) return RuntimeEnvironment.NextJSClient;
  if (isNextJSServer()) return RuntimeEnvironment.NextJSServer;
  if (isDeno()) return RuntimeEnvironment.Deno;
  if (isReactNative()) return RuntimeEnvironment.ReactNative;
  if (isWorker()) return RuntimeEnvironment.Worker;
  if (isBrowser()) return RuntimeEnvironment.Browser;
  if (isNodeJS()) return RuntimeEnvironment.NodeJS;
  return RuntimeEnvironment.Unknown;
};

/**
 * Get appropriate WebSocket constructor for current environment
 */
export const getWebSocketConstructor = (): typeof WebSocket | null => {
  if (isBrowser() || isWorker()) {
    // Browser and Web Worker environments have native WebSocket
    if (typeof WebSocket !== 'undefined') {
      return WebSocket;
    }
  }
  
  if (isNodeJS() && !isBrowser()) {
    try {
      // Try to require 'ws' package in Node.js
      const ws = require('ws');
      return ws as typeof WebSocket;
    } catch (e) {
      // 'ws' package not available
    }
  }
  
  return null;
};

/**
 * Check if crypto API is available (for hashing, etc.)
 */
export const hasCryptoSupport = (): boolean => {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined') {
      return true;
    }
    if (typeof crypto !== 'undefined') {
      return true;
    }
  } catch (e) {
    // Ignore errors
  }
  return false;
};

/**
 * Check if localStorage is available
 */
export const hasLocalStorageSupport = (): boolean => {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      return true;
    }
    if (typeof localStorage !== 'undefined') {
      return true;
    }
  } catch (e) {
    // Ignore errors
  }
  return false;
};

/**
 * Check if IndexedDB is available
 */
export const hasIndexedDBSupport = (): boolean => {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined') {
      return true;
    }
    if (typeof indexedDB !== 'undefined') {
      return true;
    }
  } catch (e) {
    // Ignore errors
  }
  return false;
};
