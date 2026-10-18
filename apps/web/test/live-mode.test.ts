import { test, expect } from 'bun:test'
import { readMode, writeMode, pausedNote, headBlock, LIVE_MODE_KEY } from '../components/showcase/use-live-mode'
import { runKey } from '../lib/use-query'

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m } }
const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }

test('mode defaults to live and round trips through storage', () => {
 const s = memory()
 expect(readMode(s)).toBe('live')
 writeMode(s, 'paused')
 expect(s.m.get(LIVE_MODE_KEY)).toBe('paused')
 expect(readMode(s)).toBe('paused')
 s.m.set(LIVE_MODE_KEY, 'garbage')
 expect(readMode(s)).toBe('live')
})

test('blocked or missing storage falls back to live without throwing', () => {
 expect(readMode(broken)).toBe('live')
 expect(() => writeMode(broken, 'paused')).not.toThrow()
 expect(readMode(undefined)).toBe('live')
 expect(() => writeMode(undefined, 'live')).not.toThrow()
})

test('head block prefers the live head, then the delta, then the manifest', () => {
 expect(headBlock({ status: 'ready', liveHead: 30, deltaTo: 20, manifest: { headBlock: 10 } as never })).toBe(30)
 expect(headBlock({ status: 'ready', deltaTo: 20, manifest: { headBlock: 10 } as never })).toBe(20)
 expect(headBlock({ status: 'ready', manifest: { headBlock: 10 } as never })).toBe(10)
 expect(headBlock({ status: 'loading' })).toBeUndefined()
})

test('paused note names the block and how far the index moved since', () => {
 expect(pausedNote(749516, 749516)).toBe('Paused at block 749,516')
 expect(pausedNote(749516, 749528)).toBe('Paused at block 749,516 · 12 blocks since')
 expect(pausedNote(749516, 749517)).toBe('Paused at block 749,516 · 1 block since')
 expect(pausedNote(undefined, 5)).toBe('Paused')
})

test('run key follows the data while live and holds the last run while paused', () => {
 expect(runKey('v2', 'v1', false)).toBe('v2')
 expect(runKey('v2', 'v1', true)).toBe('v1')
 expect(runKey('v2', undefined, true)).toBe('v2')
})
