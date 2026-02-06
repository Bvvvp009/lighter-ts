#!/usr/bin/env node
/**
 * WASM HTTP Server
 * 
 * Serves WASM files via HTTP for browser testing.
 * This is required because browsers cannot load WASM from file:// URLs.
 * 
 * Usage:
 *   node scripts/serve-wasm.js [port]
 *   node scripts/serve-wasm.js 8080
 * 
 * Default port: 8080
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.argv[2] || '8080');
const WASM_DIR = path.join(__dirname, '../wasm/rust-web');

// MIME types for different file extensions
const MIME_TYPES = {
  '.wasm': 'application/wasm',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.ts': 'text/typescript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
};

/**
 * Create HTTP server
 */
const server = http.createServer((req, res) => {
  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(WASM_DIR, url.pathname);
  
  // Prevent directory traversal
  if (!filePath.startsWith(WASM_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Handle requests
  if (req.method === 'OPTIONS') {
    // CORS preflight
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }
  
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }
  
  // Get file stats
  const stats = fs.statSync(filePath);
  
  if (stats.isDirectory()) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden - Directory');
    return;
  }
  
  // Get MIME type
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
  
  // Set response headers
  const headers = {
    'Content-Type': mimeType,
    'Content-Length': stats.size,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  
  // Handle range requests for WASM streaming
  if (req.headers.range) {
    const ranges = req.headers.range.replace(/bytes=/, '').split('-');
    const start = parseInt(ranges[0], 10);
    const end = ranges[1] ? parseInt(ranges[1], 10) : stats.size - 1;
    
    if (start >= 0 && end < stats.size && start <= end) {
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      headers['Content-Length'] = (end - start + 1);
      
      res.writeHead(206, headers);
      
      if (req.method === 'GET') {
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.end();
      }
      return;
    }
  }
  
  res.writeHead(200, headers);
  
  if (req.method === 'GET') {
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.end();
  }
});

/**
 * Error handling
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.error('   Try: node scripts/serve-wasm.js 8081');
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

/**
 * Start server
 */
server.listen(PORT, () => {
  console.log('');
  console.log('🚀 WASM HTTP Server');
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   WASM Directory: ${WASM_DIR}`);
  console.log('');
  console.log('📦 Available files:');
  
  const files = fs.readdirSync(WASM_DIR);
  for (const file of files) {
    const filePath = path.join(WASM_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const size = (stat.size / 1024).toFixed(1);
      console.log(`   http://localhost:${PORT}/${file} (${size} KB)`);
    }
  }
  
  console.log('');
  console.log('✓ Press Ctrl+C to stop');
  console.log('');
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n✓ Stopping WASM HTTP server...');
  server.close(() => {
    console.log('✓ Server stopped');
    process.exit(0);
  });
});

module.exports = server;
