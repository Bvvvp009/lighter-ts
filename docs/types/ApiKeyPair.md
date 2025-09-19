# ApiKeyPair

Structure representing a generated API key pair.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `privateKey` | `string` | The private key for the API key |
| `publicKey` | `string` | The public key for the API key |

## Example

```typescript
import { SignerClient } from '@lighter/typescript-sdk';

const client = new SignerClient(config);
await client.initialize();
await client.ensureWasmClient();

const apiKeyPair = await client.generateAPIKey();
if (apiKeyPair) {
  console.log('Private Key:', apiKeyPair.privateKey);
  console.log('Public Key:', apiKeyPair.publicKey);
}
```

## Notes

- The `privateKey` should be kept secure and not shared
- The `publicKey` can be used for verification purposes
- Both keys are returned as hexadecimal strings
- The `generateAPIKey()` method returns `null` if generation fails
