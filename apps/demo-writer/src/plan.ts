export type Ticket = { key: string; status: 'open' | 'pending' | 'closed'; assignee: string | null };
export type Action =
  | { kind: 'open_ticket'; title: string; priority: number; comment: string }
  | { kind: 'comment'; ticket: string; text: string }
  | { kind: 'set_status'; ticket: string; status: Ticket['status'] }
  | { kind: 'assign'; ticket: string; agent: string }
  | { kind: 'heartbeat' };

export const EXPIRY_SECONDS = { ticket: 7 * 86400, comment: 86400, heartbeat: 600 };

export function mulberry32(seed: number): () => number {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextAction(state: { tickets: Ticket[]; agents: string[] }, rand: () => number): Action {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
  const open = (): Action => ({ kind: 'open_ticket',
    title: `${pick(['Amber', 'Blue', 'Coral', 'Silver'])} ${pick(['beacon', 'console', 'widget', 'portal'])}`,
    priority: 1 + Math.floor(rand() * 3), comment: 'Synthetic support request for the demo console.' });
  if (!state.tickets.length) return open();
  const choice = rand() * 100;
  // Ownership has left the writer after assignment, so only unassigned tickets are mutable.
  const owned = state.tickets.filter(t => t.assignee === null);
  if (choice < 25) return open();
  if (choice < 60) {
    const tickets = owned.filter(t => t.status !== 'closed');
    return tickets.length ? { kind: 'comment', ticket: pick(tickets).key, text: 'Synthetic diagnostic check completed.' } : open();
  }
  if (choice < 75) return owned.length
    ? { kind: 'set_status', ticket: pick(owned).key, status: pick(['open', 'pending', 'closed'] as const) } : open();
  if (choice < 85) return owned.length && state.agents.length
    ? { kind: 'assign', ticket: pick(owned).key, agent: pick(state.agents) } : open();
  return { kind: 'heartbeat' };
}
