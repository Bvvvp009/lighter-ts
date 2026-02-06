/**
 * Runtime Environment Detection Utility
 * 
 * Uses detect-browser-es to determine if code is running in:
 * - Browser (Chrome, Firefox, Safari, etc.)
 * - Node.js
 * - Test environments (Vitest, Jest, jsdom, Happy DOM)
 * - Deno
 * 
 * This enables environment-specific testing and code paths.
 */

import { detect } from 'detect-browser-es';

/**
 * Runtime environment information
 */
export interface RuntimeEnvironment {
  name: 'browser' | 'node' | 'test' | 'deno' | 'unknown';
  isBrowser: boolean;
  isNode: boolean;
  isTest: boolean;
  isDeno: boolean;
  browserName?: string | null; // 'chrome', 'firefox', 'safari', 'edge', etc.
  browserVersion?: string | null;
  testRunner?: string | null; // 'vitest', 'jest', 'mocha', etc.
  jsdomVersion?: string | null;
  platform?: string | null; // 'windows', 'macos', 'linux'
}

/**
 * Detect the current runtime environment
 */
export function detectEnvironment(): RuntimeEnvironment {
  const detected = detect() as any;
  
  // Determine if we're in a test environment
  const isJest = typeof (global as any).jest !== 'undefined';
  const isVitest = typeof (global as any).__vitest__ !== 'undefined';
  const isJsdom = (global as any).document && (global as any).document.implementation?.createDocument;
  const isHappyDom = typeof (global as any).document !== 'undefined' && (global as any).document.constructor?.name === 'Document';
  
  const testRunner = isJest ? 'jest' : isVitest ? 'vitest' : undefined;
  const isTest = isJest || isVitest || isJsdom || isHappyDom;
  
  // Check for Node.js environment
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  
  // Determine runtime - check for browser indicators
  let runtime: RuntimeEnvironment['name'] = 'unknown';
  let isBrowser = false;
  
  // Detect if in real browser (not jsdom/Happy DOM simulation)
  const hasBrowserAPIs = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof fetch !== 'undefined';
  const notFakeBrowser = !isTest || (isTest && !isNode); // If isTest and has isNode, it's Node.js test env
  
  if (isTest && isNode) {
    // Node.js test environment (Jest/Vitest with jsdom)
    runtime = 'test';
  } else if (isNode && !isTest) {
    // Pure Node.js
    runtime = 'node';
  } else if (detected?.name === 'deno') {
    runtime = 'deno';
  } else if (hasBrowserAPIs && !isNode) {
    // Real browser environment
    runtime = 'browser';
    isBrowser = true;
  } else if (detected?.name && typeof detected.name === 'string' && !isNode) {
    // Fallback: if detect-browser-es identified something as browser
    runtime = 'browser';
    isBrowser = true;
  }
  
  return {
    name: runtime,
    isBrowser,
    isNode: !!isNode,
    isTest,
    isDeno: detected?.name === 'deno',
    browserName: (detected?.name as string) ?? null,
    browserVersion: detected?.version ?? null,
    testRunner: testRunner ?? null,
    jsdomVersion: isJsdom ? 'present' : null,
    platform: (detected?.platform as string) ?? null,
  };
}

/**
 * Check if running in a browser environment
 */
export function isBrowserEnv(): boolean {
  const env = detectEnvironment();
  return env.isBrowser && !env.isTest;
}

/**
 * Check if running in Node.js environment
 */
export function isNodeEnv(): boolean {
  const env = detectEnvironment();
  return env.isNode && !env.isTest;
}

/**
 * Check if running in a test environment
 */
export function isTestEnv(): boolean {
  const env = detectEnvironment();
  return env.isTest;
}

/**
 * Check if running in a real browser (not jsdom/Happy DOM)
 */
export function isRealBrowser(): boolean {
  const env = detectEnvironment();
  return env.isBrowser && !env.isTest;
}

/**
 * Get browser name (if in browser)
 */
export function getBrowserName(): string | null | undefined {
  const env = detectEnvironment();
  return env.browserName;
}

/**
 * Skip test if not in specified environment
 */
export function requireEnvironment(env: RuntimeEnvironment['name']) {
  const current = detectEnvironment();
  if (current.name !== env) {
    throw new Error(
      `This test requires ${env} environment, but running in ${current.name}` +
      (current.browserName ? ` (${current.browserName})` : '')
    );
  }
}

/**
 * Skip test if running in specified environment
 */
export function skipEnvironment(env: RuntimeEnvironment['name']) {
  const current = detectEnvironment();
  if (current.name === env) {
    throw new Error(
      `This test should not run in ${env} environment` +
      (current.browserName ? ` (${current.browserName})` : '')
    );
  }
}
