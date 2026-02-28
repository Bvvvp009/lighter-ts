// Jest setup file
import { TextEncoder, TextDecoder } from 'util';

(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Mock WebSocket for tests
(global as any).WebSocket = require('ws');