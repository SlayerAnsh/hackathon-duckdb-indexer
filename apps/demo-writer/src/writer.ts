import { ExpirationTime, type WalletArkivClient, type PublicArkivClient } from '@arkiv-network/sdk';
import { addr, key, u64 } from '@arkiv-network/sdk/attr';
import type { Hex } from 'viem';
import { EXPIRY_SECONDS, type Action, type Ticket } from './plan';

export type WriterClient = Pick<WalletArkivClient,
  'account' | 'executeBatch' | 'createEntity' | 'extendEntity' | 'patchEntity' | 'changeOwnership'>
  & Pick<PublicArkivClient, 'predictEntityKeys'>;
export type WriterState = { tickets: Ticket[]; agents: string[]; log?: (message: string) => void };
const project = 'arkiv-sql-indexer-demo';
const contents = (type: keyof typeof EXPIRY_SECONDS, text = '') => ({
  attributes: { type, project }, payload: new TextEncoder().encode(text), contentType: 'text/plain',
  expires: ExpirationTime.fromSeconds(EXPIRY_SECONDS[type]),
});

function isGone(error: unknown): boolean {
  // SDK mutation errors wrap viem reverts in a cause; inspect that chain too.
  const seen = new Set<unknown>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    const data = (error as Error & { data?: { errorName?: string } }).data;
    if (['EntityNotFound', 'EntityExpired'].includes(data?.errorName ?? '') ||
      /EntityNotFound|EntityExpired|No live entity with key|no entity 0x|entity 0x[\da-f]+ expired at block/i.test(error.message)) return true;
    error = error.cause;
  }
  return false;
}

export async function perform(client: WriterClient, action: Action, state: WriterState): Promise<void> {
  const log = (result: { txHash: string }, entityKey: string) =>
    (state.log ?? console.log)(`${action.kind} tx=${result.txHash} entity=${entityKey}`);
  const ticket = 'ticket' in action ? state.tickets.find(t => t.key === action.ticket) : undefined;
  try {
    switch (action.kind) {
      case 'open_ticket': {
        if (!client.account) throw new Error('Writer account is required');
        const [parent, child] = await client.predictEntityKeys({ owner: client.account.address, count: 2 });
        const result = await client.executeBatch({ creates: [
          { ...contents('ticket'), flags: { permissionlessExtension: true }, salt: parent.salt, attributes: { type: 'ticket', project,
            title: action.title, status: 'open', priority: u64(action.priority) } },
          { ...contents('comment', action.comment), salt: child.salt,
            attributes: { type: 'comment', project, ticket: key(parent.key) } },
        ] });
        const entityKey = result.createdEntities[0];
        if (!entityKey) throw new Error('Batch returned no ticket key');
        state.tickets.push({ key: entityKey, status: 'open', assignee: null });
        for (const created of result.createdEntities) log(result, created);
        break;
      }
      case 'comment': {
        const result = await client.createEntity({ ...contents('comment', action.text),
          attributes: { type: 'comment', project, ticket: key(action.ticket as Hex) } });
        log(result, result.entityKey);
        const extension = await client.extendEntity({ entityKey: action.ticket as Hex,
          expires: ExpirationTime.fromSeconds(EXPIRY_SECONDS.ticket) });
        log(extension, action.ticket);
        break;
      }
      case 'set_status': {
        const result = await client.patchEntity({ entityKey: action.ticket as Hex, set: { status: action.status } });
        if (ticket) ticket.status = action.status;
        log(result, action.ticket);
        break;
      }
      case 'assign': {
        // After transfer this wallet cannot patch the ticket, so write the assignee first.
        const patch = await client.patchEntity({ entityKey: action.ticket as Hex, set: { assignee: addr(action.agent as Hex) } });
        log(patch, action.ticket);
        const result = await client.changeOwnership({ entityKey: action.ticket as Hex, newOwner: action.agent as Hex });
        if (ticket) ticket.assignee = action.agent;
        log(result, action.ticket);
        break;
      }
      case 'heartbeat': {
        const result = await client.createEntity(contents('heartbeat'));
        log(result, result.entityKey);
      }
    }
  } catch (error) {
    if ('ticket' in action && isGone(error)) state.tickets = state.tickets.filter(t => t.key !== action.ticket);
    throw error;
  }
}
