//Get account index and balance from the client

import { Account } from "../src/api/account-api";
import { ApiClient } from "../src/api/api-client";

async function main(): Promise<void> {
  const client = new ApiClient();
  const reponse = await client.get<Account>('/api/v1/account', { by: 'l1_address', value: process.env.L1_ADDRESS });
  console.log(reponse.data);
}

main();