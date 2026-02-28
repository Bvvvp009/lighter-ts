import {
  ApiClient,
  InfoApi,
  OrderApi,
  AccountApi,
  ReferralApi,
  NotificationApi,
  SignerClient,
  TransactionApi,
} from '../src';
import dotenv from 'dotenv';

dotenv.config();

type ProbeStatus = 'ok' | 'unavailable_404' | 'available_strict_params' | 'error';
type TxClass = 'executed' | 'committed' | 'pending' | 'failed' | 'rejected' | 'not-indexed' | 'submit-error';

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw.split('#')[0]!, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEnvFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function classifyProbeError(message: string): ProbeStatus {
  const lowered = message.toLowerCase();
  if (lowered.includes('404') || lowered.includes('not found')) {
    return 'unavailable_404';
  }
  if (lowered.includes('invalid param') || lowered.includes('missing') || lowered.includes('required')) {
    return 'available_strict_params';
  }
  return 'error';
}

function mapTxStatus(status: number): TxClass {
  if (status === SignerClient.TX_STATUS_EXECUTED) {
    return 'executed';
  }
  if (status === SignerClient.TX_STATUS_COMMITTED) {
    return 'committed';
  }
  if (status === SignerClient.TX_STATUS_PENDING || status === SignerClient.TX_STATUS_QUEUED) {
    return 'pending';
  }
  if (status === SignerClient.TX_STATUS_FAILED) {
    return 'failed';
  }
  if (status === SignerClient.TX_STATUS_REJECTED) {
    return 'rejected';
  }
  return 'pending';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const host = process.env.BASE_URL || 'https://testnet.zklighter.elliot.ai';
  const auth = process.env.API_PRIVATE_KEY || '';
  const accountIndex = parseEnvInt('ACCOUNT_INDEX', 0);
  const apiKeyIndex = parseEnvInt('API_KEY_INDEX', 0);
  const marketIndex = parseEnvInt('SMOKE_MARKET_INDEX', 0);
  const baseAmount = parseEnvInt('SMOKE_BASE_AMOUNT_UNITS', 60);
  const maxSlippage = parseEnvFloat('SMOKE_MAX_SLIPPAGE', 0.005);
  const submitTx = (process.env.SMOKE_SUBMIT_TX || '').toLowerCase() === '1';
  const attempts = parseEnvInt('SMOKE_STATUS_ATTEMPTS', 8);
  const baseDelayMs = parseEnvInt('SMOKE_STATUS_BASE_DELAY_MS', 1200);

  if (!auth) {
    throw new Error('API_PRIVATE_KEY is required');
  }

  const api = new ApiClient({ host });
  const info = new InfoApi(api);
  const order = new OrderApi(api);
  const account = new AccountApi(api);
  const referral = new ReferralApi(api);
  const notif = new NotificationApi(api);
  const txApi = new TransactionApi(api);

  console.log(`🌐 Live smoke target: ${host}`);
  console.log(`👤 Account index: ${accountIndex}`);
  console.log(`🧪 Submit transaction: ${submitTx ? 'yes' : 'no (set SMOKE_SUBMIT_TX=1)'}`);

  const probes: Array<[string, () => Promise<unknown>]> = [
    ['systemConfig', async () => info.getSystemConfig(auth)],
    ['exchangeMetrics', async () => order.getExchangeMetrics()],
    ['executeStats', async () => order.getExecuteStats()],
    ['leaseOptions', async () => account.getLeaseOptions({ account_index: accountIndex, auth })],
    ['leases', async () => account.getLeases({ account_index: accountIndex, auth })],
    [
      'userReferrals',
      async () => referral.getUserReferrals({ l1Address: '0x0000000000000000000000000000000000000000', auth }),
    ],
    [
      'pushNotifSettings',
      async () => notif.getPushNotifSettings(accountIndex, 'ExponentPushToken[dev-placeholder]', { auth }),
    ],
  ];

  const probeSummary: Record<string, { status: ProbeStatus; detail: string }> = {};

  console.log('\n== Wrapper probes ==');
  for (const [name, fn] of probes) {
    try {
      const data = await fn();
      const keys = data && typeof data === 'object' ? Object.keys(data as Record<string, unknown>).slice(0, 6) : [];
      const detail = keys.length ? `keys=${keys.join(',')}` : 'primitive/empty';
      probeSummary[name] = { status: 'ok', detail };
      console.log(`OK  ${name.padEnd(18)} ${detail}`);
    } catch (error) {
      const message = normalizeError(error);
      const status = classifyProbeError(message);
      probeSummary[name] = { status, detail: message };
      console.log(`ERR ${name.padEnd(18)} ${status} :: ${message}`);
    }
  }

  const txSummary: {
    submitted: boolean;
    hash?: string;
    classification?: TxClass;
    detail?: string;
    polls?: number;
  } = {
    submitted: false,
  };

  if (submitTx) {
    console.log('\n== Transaction smoke ==');
    const signer = new SignerClient({
      url: host,
      privateKey: auth,
      accountIndex,
      apiKeyIndex,
    });

    try {
      await signer.initialize();
      await signer.ensureWasmClient();

      const [txInfo, txHash, submitError] = await signer.createMarketOrder_maxSlippage({
        marketIndex,
        clientOrderIndex: Date.now(),
        baseAmount,
        maxSlippage,
        isAsk: false,
      });

      if (submitError || !txHash) {
        txSummary.submitted = true;
        txSummary.classification = 'submit-error';
        txSummary.detail = submitError || 'Missing tx hash';
        console.log(`❌ submit-error :: ${txSummary.detail}`);
      } else {
        txSummary.submitted = true;
        txSummary.hash = txHash;
        console.log(`📨 submitted hash=${txHash}`);

        let notFoundCount = 0;
        let finalClass: TxClass = 'pending';
        let finalDetail = 'pending after polling window';

        for (let i = 0; i < attempts; i++) {
          try {
            const tx = await txApi.getTransaction({ by: 'hash', value: txHash });
            const numeric = typeof tx.status === 'number' ? tx.status : Number.parseInt(String(tx.status), 10);
            const mapped = mapTxStatus(numeric);
            finalClass = mapped;
            finalDetail = `status=${numeric} code=${tx.code ?? 'n/a'}`;
            console.log(`  poll#${i + 1} -> ${finalDetail}`);

            if (mapped === 'executed' || mapped === 'committed' || mapped === 'failed' || mapped === 'rejected') {
              break;
            }
          } catch (error) {
            const message = normalizeError(error).toLowerCase();
            if (message.includes('not found') || message.includes('404')) {
              notFoundCount += 1;
              finalClass = 'not-indexed';
              finalDetail = 'transaction not indexed yet';
              console.log(`  poll#${i + 1} -> not-indexed`);
            } else {
              finalClass = 'pending';
              finalDetail = normalizeError(error);
              console.log(`  poll#${i + 1} -> error ${finalDetail}`);
            }
          }

          const delay = Math.min(baseDelayMs * Math.pow(2, i), 10000);
          await sleep(delay);
        }

        if (notFoundCount === attempts) {
          finalClass = 'not-indexed';
          finalDetail = `not indexed after ${attempts} attempts`;
        }

        txSummary.classification = finalClass;
        txSummary.detail = finalDetail;
        txSummary.polls = attempts;
      }
    } finally {
      await signer.close();
    }
  }

  console.log('\n== Smoke summary ==');
  console.log(
    JSON.stringify(
      {
        host,
        accountIndex,
        probes: probeSummary,
        transaction: txSummary,
      },
      null,
      2
    )
  );

  await api.close();
}

const isMain = process.argv[1]?.includes('live_smoke');
if (isMain) {
  run().catch((error) => {
    console.error(`❌ Live smoke failed: ${normalizeError(error)}`);
    process.exit(1);
  });
}

export { run as runLiveSmoke };
