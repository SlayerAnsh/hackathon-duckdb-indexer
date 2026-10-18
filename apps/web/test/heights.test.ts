import { test, expect } from 'bun:test'
import { describeHeights } from '../lib/heights'
test('freshness thresholds, missing chain and serving heights', () => {
 expect(describeHeights({chain:100,stored:91}).state).toBe('live')
 expect(describeHeights({chain:100,stored:91}).lagText).toBe('9 blocks (18 s)')
 expect(describeHeights({chain:100,stored:80}).state).toBe('behind')
 expect(describeHeights({chain:10000,stored:1}).state).toBe('stale')
 expect(describeHeights({stored:10}).state).toBe('unknown')
 expect(describeHeights({chain:100,stored:1,serving:99}).state).toBe('live')
 expect(describeHeights({stored:1,serving:1}).items.map(i=>i.label)).toEqual(['stored'])
 expect(describeHeights({chain:100,stored:1,serving:99}).items.map(i=>i.label)).toEqual(['stored','serving','chain'])
 expect(describeHeights({chain:100}).state).toBe('unknown')
})
