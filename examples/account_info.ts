//Get account index and balance from the client

import { Account } from "../src/api/account-api";
import { ApiClient } from "../src/api/api-client";
import dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  console.log(process.env['L1_ADDRESS']); 
  const client = new ApiClient();
  const response = await client.get<Account>('/api/v1/account', { by: 'l1_address', value: process.env['L1_ADDRESS'] });
  console.log(response.data);
}

main();