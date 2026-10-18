import { expect, test } from 'bun:test';
import { readConfig, runLoop } from '../src/main';

test('configuration rejects missing secrets without revealing input', () => {
  expect(() => readConfig({})).toThrow('DEMO_PRIVATE_KEY is required');
  expect(() => readConfig({ DEMO_PRIVATE_KEY: 'secret' })).toThrow('DEMO_PRIVATE_KEY must be a 32 byte hex key');
  const config = readConfig({ DEMO_PRIVATE_KEY: `0x${'01'.repeat(32)}`, DEMO_AGENT_ADDRESSES: ' 0x3333333333333333333333333333333333333333, ', DEMO_SEED: '42' });
  expect(config.intervalMs).toBe(8000);
  expect(config.seed).toBe(42);
  expect(config.agents).toHaveLength(1);
});

test('loop logs failures and continues with a delay', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const errors: string[] = [];
  const delays: number[] = [];
  await runLoop({ tickets: [], agents: [] }, () => 0, 8000, {
    signal: controller.signal,
    perform: async () => { if (++attempts === 1) throw new Error('insufficient funds'); controller.abort(); },
    error: message => errors.push(message),
    sleep: async ms => { delays.push(ms); },
  });
  expect(attempts).toBe(2);
  expect(errors[0]).toContain('insufficient funds');
  expect(delays).toEqual([8000]);
});
