import * as dotenv from 'dotenv';
import { InfoApi, BridgeApi, ApiClient } from '../src';

dotenv.config();

async function main() {
  const apiClient = new ApiClient({ host: process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai' });
  const infoApi = new InfoApi(apiClient);
  const bridgeApi = new BridgeApi(apiClient);

  console.log('Getting synthetic spot info...');
  try {
    const result = await infoApi.syntheticSpotInfo('ETH');
    console.log('Synthetic spot info:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting synthetic spot info:', error instanceof Error ? error.message : error);
  }

  console.log('Getting L1 basic info...');
  try {
    const result = await infoApi.layer1BasicInfo();
    console.log('L1 basic info:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting L1 basic info:', error instanceof Error ? error.message : error);
  }

  console.log('Getting deposit networks...');
  try {
    const result = await bridgeApi.depositNetworks();
    console.log('Deposit networks:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting deposit networks:', error instanceof Error ? error.message : error);
  }

  console.log('Getting latest deposit...');
  try {
    const result = await bridgeApi.depositLatest(process.env.ETH_ADDRESS || '0x0000000000000000000000000000000000000000');
    console.log('Latest deposit:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting latest deposit:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
