import { expect, test } from 'bun:test';
import { EXPIRY_SECONDS, mulberry32, nextAction } from '../src/plan';

test('empty state opens a synthetic ticket', () => {
  const action = nextAction({ tickets: [], agents: [] }, mulberry32(7));
  expect(action.kind).toBe('open_ticket');
  expect(EXPIRY_SECONDS).toEqual({ ticket: 604800, comment: 86400, heartbeat: 600 });
});

test('seeded planner covers every kind and respects ticket eligibility', () => {
  const state = { tickets: [
    { key: 'a', status: 'open' as const, assignee: null },
    { key: 'b', status: 'closed' as const, assignee: 'agent' },
  ], agents: ['agent'] };
  const rand = mulberry32(42);
  const kinds = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const action = nextAction(state, rand);
    kinds.add(action.kind);
    if (action.kind === 'assign' || action.kind === 'comment') expect(action.ticket).toBe('a');
    if (action.kind === 'open_ticket') expect(action.title).toMatch(/^(Amber|Blue|Coral|Silver) (beacon|console|widget|portal)$/);
  }
  expect([...kinds].sort()).toEqual(['assign', 'comment', 'heartbeat', 'open_ticket', 'set_status']);
});

test('ineligible comment and assignment choices safely fall back', () => {
  const state = { tickets: [{ key: 'b', status: 'closed' as const, assignee: 'agent' }], agents: [] };
  expect(nextAction(state, () => 0.3).kind).toBe('open_ticket');
  expect(nextAction(state, () => 0.8).kind).toBe('open_ticket');
});

test('assigned active tickets allow comments but never status patches or reassignment', () => {
  for (const status of ['open', 'pending'] as const) {
    const state = { tickets: [{ key: 'assigned', status, assignee: 'agent' }], agents: ['agent'] };
    expect(nextAction(state, () => 0.3).kind).toBe('comment');
    expect(nextAction(state, () => 0.65).kind).toBe('open_ticket');
    expect(nextAction(state, () => 0.8).kind).toBe('open_ticket');
  }
});

test('seeded output is reproducible and weight boundaries are exact', () => {
  const state = { tickets: [{ key: 'a', status: 'open' as const, assignee: null }], agents: ['agent'] };
  const a = mulberry32(9), b = mulberry32(9);
  expect(Array.from({ length: 100 }, () => nextAction(state, a))).toEqual(Array.from({ length: 100 }, () => nextAction(state, b)));
  expect([0, 0.25, 0.6, 0.75, 0.85].map(n => nextAction(state, () => n).kind))
    .toEqual(['open_ticket', 'comment', 'set_status', 'assign', 'heartbeat']);
});
