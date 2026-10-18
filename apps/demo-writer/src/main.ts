import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { http, isAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mulberry32, nextAction, type Action } from './plan';
import { perform, type WriterState } from './writer';

export function readConfig(env: Record<string, string | undefined>) {
  const privateKey = env.DEMO_PRIVATE_KEY;
  if (!privateKey) throw new Error('DEMO_PRIVATE_KEY is required');
  if (!/^0x[\da-f]{64}$/i.test(privateKey)) throw new Error('DEMO_PRIVATE_KEY must be a 32 byte hex key');
  const agents = (env.DEMO_AGENT_ADDRESSES ?? '').split(',').map(a => a.trim()).filter(Boolean);
  if (agents.some(a => !isAddress(a) || /^0x0{40}$/i.test(a))) throw new Error('DEMO_AGENT_ADDRESSES must contain valid nonzero addresses');
  const intervalMs = Number(env.DEMO_INTERVAL_MS ?? 8000);
  const seed = Number(env.DEMO_SEED ?? 1);
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) throw new Error('DEMO_INTERVAL_MS must be a positive integer');
  if (!Number.isSafeInteger(seed)) throw new Error('DEMO_SEED must be an integer');
  return { privateKey: privateKey as Hex, agents, intervalMs, seed };
}

export async function runLoop(state: WriterState, rand: () => number, intervalMs: number, options: {
  perform: (action: Action) => Promise<void>;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<unknown>;
  error?: (message: string) => void;
}): Promise<void> {
  while (!options.signal?.aborted) {
    const action = nextAction(state, rand);
    try { await options.perform(action); }
    catch (error) { (options.error ?? console.error)(`${action.kind} failed: ${error instanceof Error ? error.message : 'Unknown error'}`); }
    if (!options.signal?.aborted) await (options.sleep ?? Bun.sleep)(intervalMs);
  }
}

export async function main(): Promise<void> {
  const config = readConfig(process.env);
  let account;
  try { account = privateKeyToAccount(config.privateKey); }
  catch { throw new Error('DEMO_PRIVATE_KEY is not a valid signing key'); }
  const wallet = createWalletClient({ chain: tiramisu, account, transport: http() });
  const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
  const client = { ...wallet, predictEntityKeys: publicClient.predictEntityKeys };
  const state: WriterState = { tickets: [], agents: config.agents };
  await runLoop(state, mulberry32(config.seed), config.intervalMs, {
    perform: action => perform(client, action, state),
    // Never emit private key material, including if a provider echoes request data.
    error: message => console.error(message.replaceAll(config.privateKey, '[redacted]').replaceAll(config.privateKey.slice(2), '[redacted]')),
  });
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Demo writer failed to start');
    process.exitCode = 1;
  });
}
