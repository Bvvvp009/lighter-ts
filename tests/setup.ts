// Jest setup file
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock WebSocket for tests
global.WebSocket = require('ws') as any;