# Proxy Support

The Lighter TypeScript SDK supports HTTP, HTTPS, and SOCKS proxy configurations for both HTTP API requests and WebSocket connections. This enables the SDK to work in enterprise environments, behind firewalls, or with proxy services.

## Features

- **HTTP/HTTPS Proxy Support**: Route HTTP API requests through proxy servers
- **WebSocket Proxy Support**: Connect WebSocket streams through proxies
- **SOCKS4/SOCKS5 Support**: Use SOCKS proxies for enhanced privacy
- **Proxy Authentication**: Support for username/password authentication
- **Optional Dependencies**: Proxy agent libraries are optional (install only if needed)

## Installation

### For HTTP/HTTPS Proxies

```bash
npm install https-proxy-agent
```

### For SOCKS Proxies

```bash
npm install socks-proxy-agent
```

### For Both

```bash
npm install https-proxy-agent socks-proxy-agent
```

## Configuration

### Proxy Configuration Type

```typescript
interface ProxyConfig {
  host: string;              // Proxy server hostname or IP
  port: number;              // Proxy server port
  protocol?: 'http' | 'https' | 'socks4' | 'socks5';  // Default: 'http'
  auth?: {
    username: string;        // Optional: Proxy username
    password: string;        // Optional: Proxy password
  };
}
```

## Usage Examples

### HTTP API with Proxy

```typescript
import { ApiClient, OrderApi } from 'lighter-ts-sdk';

// Create API client with proxy configuration
const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: {
    host: 'proxy.example.com',
    port: 8080,
    protocol: 'http',
    auth: {
      username: 'proxy-user',
      password: 'proxy-password'
    }
  }
});

const orderApi = new OrderApi(apiClient);

// All API requests will go through the proxy
const orderBooks = await orderApi.getOrderBooks();
```

### WebSocket with Proxy

```typescript
import { WsClient } from 'lighter-ts-sdk';

// Create WebSocket client with proxy
const wsClient = new WsClient({
  url: 'wss://mainnet.zklighter.elliot.ai/stream',
  proxy: {
    host: 'proxy.example.com',
    port: 8080,
    protocol: 'http',
    auth: {
      username: 'proxy-user',
      password: 'proxy-password'
    }
  },
  onOpen: () => console.log('Connected'),
  onMessage: (message) => console.log('Message:', message)
});

await wsClient.connect();
```

### SOCKS5 Proxy

```typescript
import { ApiClient } from 'lighter-ts-sdk';

const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: {
    host: 'socks-proxy.example.com',
    port: 1080,
    protocol: 'socks5',
    auth: {
      username: 'socks-user',
      password: 'socks-password'
    }
  }
});
```

### Proxy Without Authentication

```typescript
import { ApiClient } from 'lighter-ts-sdk';

const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: {
    host: 'proxy.example.com',
    port: 8080,
    protocol: 'https'
    // No auth field needed
  }
});
```

## Use Cases

### Enterprise Networks

Many enterprise networks require all outbound traffic to go through a corporate proxy:

```typescript
const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: {
    host: process.env.CORPORATE_PROXY_HOST || 'corp-proxy.company.com',
    port: parseInt(process.env.CORPORATE_PROXY_PORT || '8080'),
    protocol: 'http',
    auth: {
      username: process.env.PROXY_USER || '',
      password: process.env.PROXY_PASS || ''
    }
  }
});
```

### Geographic Access

Use location-specific proxies to access services from different regions:

```typescript
const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: {
    host: 'us-proxy.example.com',
    port: 8080,
    protocol: 'http'
  }
});
```

### Security and Privacy

Route traffic through SOCKS5 proxies for enhanced privacy:

```typescript
const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: {
    host: 'socks5-proxy.example.com',
    port: 1080,
    protocol: 'socks5',
    auth: {
      username: 'user',
      password: 'pass'
    }
  }
});
```

### Development and Testing

Use proxy tools like Burp Suite or Charles Proxy for debugging:

```typescript
const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: {
    host: '127.0.0.1',
    port: 8080,
    protocol: 'http'
  }
});
```

## Environment Variables

You can also configure proxies using environment variables (requires custom implementation):

```typescript
const getProxyFromEnv = (): ProxyConfig | undefined => {
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (!proxyUrl) return undefined;

  const url = new URL(proxyUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port),
    protocol: url.protocol.replace(':', '') as 'http' | 'https',
    auth: url.username && url.password
      ? { username: url.username, password: url.password }
      : undefined
  };
};

const apiClient = new ApiClient({
  host: 'https://mainnet.zklighter.elliot.ai',
  proxy: getProxyFromEnv()
});
```

## Error Handling

If proxy agent libraries are not installed, the SDK will throw a descriptive error:

```typescript
try {
  const wsClient = new WsClient({
    url: 'wss://mainnet.zklighter.elliot.ai/stream',
    proxy: { host: 'proxy.example.com', port: 8080 }
  });
  await wsClient.connect();
} catch (error) {
  if (error.message.includes('Proxy agent library not found')) {
    console.error('Install https-proxy-agent: npm install https-proxy-agent');
  }
}
```

## Notes

1. **HTTP/HTTPS Proxies**: Use `https-proxy-agent` package for HTTP and HTTPS proxy support
2. **SOCKS Proxies**: Use `socks-proxy-agent` package for SOCKS4 and SOCKS5 support
3. **WebSocket Proxies**: WebSocket connections require the appropriate proxy agent library
4. **Performance**: Proxies add latency to requests. Consider this for high-frequency trading applications
5. **Security**: Always use HTTPS or SOCKS5 for production environments when transmitting sensitive data

## Troubleshooting

### Proxy Connection Fails

1. Verify proxy host and port are correct
2. Check if proxy requires authentication
3. Ensure proxy agent library is installed
4. Test proxy connectivity independently

### WebSocket Proxy Issues

1. Ensure `https-proxy-agent` or `socks-proxy-agent` is installed
2. Verify proxy supports WebSocket connections (CONNECT method)
3. Check firewall rules allow WebSocket upgrade requests

### Authentication Errors

1. Verify username and password are correct
2. Check if proxy requires different authentication method
3. Some proxies may require domain prefix in username (e.g., `DOMAIN\\user`)
















