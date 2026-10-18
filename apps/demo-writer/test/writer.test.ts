import { expect, test } from 'bun:test';
import { ExpirationTime } from '@arkiv-network/sdk';
import { addr, key, u64 } from '@arkiv-network/sdk/attr';
import { perform, type WriterClient, type WriterState } from '../src/writer';

const ticket = `0x${'11'.repeat(32)}` as const;
const comment = `0x${'22'.repeat(32)}` as const;
const agent = `0x${'33'.repeat(20)}` as const;
function fixture() {
  const calls: { method: string; data: any }[] = [];
  const record = (method: string) => async (data: any) => {
    calls.push({ method, data });
    return { txHash: '0x1234', entityKey: comment, createdEntities: [ticket, comment], expiresAt: 10n };
  };
  const client = {
    account: { address: agent },
    predictEntityKeys: async () => [{ key: ticket, salt: 1n }, { key: comment, salt: 2n }],
    executeBatch: record('batch'), createEntity: record('create'), extendEntity: record('extend'),
    patchEntity: record('patch'), changeOwnership: record('transfer'),
  } as unknown as WriterClient;
  const state: WriterState = { tickets: [], agents: [agent], log: () => {} };
  return { client, state, calls };
}

test('opening uses one atomic batch with predicted salts and typed relationship', async () => {
  const { client, state, calls } = fixture();
  await perform(client, { kind: 'open_ticket', title: 'Blue widget', priority: 2, comment: 'Synthetic' }, state);
  expect(calls.map(c => c.method)).toEqual(['batch']);
  const [a, b] = calls[0]!.data.creates;
  expect(a.attributes).toEqual({ type: 'ticket', project: 'arkiv-sql-indexer-demo', title: 'Blue widget', status: 'open', priority: u64(2) });
  expect(a.salt).toBe(1n);
  expect(b.salt).toBe(2n);
  expect(b.attributes.ticket).toEqual(key(ticket));
  expect(b.attributes.project).toBe('arkiv-sql-indexer-demo');
  expect(new TextDecoder().decode(b.payload)).toBe('Synthetic');
  expect(a.expires).toEqual(ExpirationTime.fromSeconds(604800));
  expect(b.expires).toEqual(ExpirationTime.fromSeconds(86400));
  expect(state.tickets).toEqual([{ key: ticket, status: 'open', assignee: null }]);
});

test('comments renew ticket and heartbeat has short expiry', async () => {
  const { client, state, calls } = fixture();
  await perform(client, { kind: 'comment', ticket, text: 'Diagnostic' }, state);
  await perform(client, { kind: 'heartbeat' }, state);
  expect(calls.map(c => c.method)).toEqual(['create', 'extend', 'create']);
  expect(calls[1]!.data).toEqual({ entityKey: ticket, expires: ExpirationTime.fromSeconds(604800) });
  expect(calls[2]!.data.expires).toEqual(ExpirationTime.fromSeconds(600));
  expect(calls[2]!.data.attributes).toEqual({ type: 'heartbeat', project: 'arkiv-sql-indexer-demo' });
});

test('status patches preserve attributes and assignment patches before transfer', async () => {
  const { client, state, calls } = fixture();
  state.tickets.push({ key: ticket, status: 'open', assignee: null });
  await perform(client, { kind: 'set_status', ticket, status: 'pending' }, state);
  expect(state.tickets[0]!.status).toBe('pending');
  await perform(client, { kind: 'assign', ticket, agent }, state);
  expect(calls.map(c => c.method)).toEqual(['patch', 'patch', 'transfer']);
  expect(calls[0]!.data).toEqual({ entityKey: ticket, set: { status: 'pending' } });
  expect(calls[1]!.data.set).toEqual({ assignee: addr(agent) });
  expect(state.tickets[0]!.assignee).toBe(agent);
});

test('expired mutations drop local ticket, other errors retain it', async () => {
  const { client, state } = fixture();
  state.tickets.push({ key: ticket, status: 'open', assignee: null });
  client.patchEntity = async () => { throw new Error('insufficient funds'); };
  await expect(perform(client, { kind: 'set_status', ticket, status: 'closed' }, state)).rejects.toThrow('insufficient');
  expect(state.tickets).toHaveLength(1);
  client.patchEntity = async () => { throw new Error('EntityExpired'); };
  await expect(perform(client, { kind: 'set_status', ticket, status: 'closed' }, state)).rejects.toThrow('EntityExpired');
  expect(state.tickets).toHaveLength(0);
});

test('expired extension drops ticket after the comment transaction succeeds', async () => {
  const { client, state, calls } = fixture();
  state.tickets.push({ key: ticket, status: 'open', assignee: null });
  client.extendEntity = async () => { throw new Error('mutation failed', { cause: new Error('EntityNotFound') }); };
  await expect(perform(client, { kind: 'comment', ticket, text: 'Synthetic' }, state)).rejects.toThrow('mutation failed');
  expect(calls.map(c => c.method)).toEqual(['create']);
  expect(state.tickets).toHaveLength(0);
});

test('failed batch never adds a local ticket and successful writes log hashes and keys', async () => {
  const { client, state } = fixture();
  const messages: string[] = [];
  state.log = message => messages.push(message);
  await perform(client, { kind: 'heartbeat' }, state);
  expect(messages[0]).toContain('heartbeat tx=0x1234 entity=' + comment);
  client.executeBatch = async () => { throw new Error('revert'); };
  await expect(perform(client, { kind: 'open_ticket', title: 'Blue widget', priority: 1, comment: 'Synthetic' }, state)).rejects.toThrow('revert');
  expect(state.tickets).toHaveLength(0);
});
