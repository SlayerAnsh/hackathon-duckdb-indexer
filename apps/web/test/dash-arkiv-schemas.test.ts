import { expect, test } from 'bun:test'
import { DashboardSchema, LinkSchema, WidgetSchema } from '../lib/dash/arkiv-schemas'
test('Rabdi schemas index exactly the filtered attributes and store JSON as unindexed bytes', () => {
 for (const [schema, indexed] of [[WidgetSchema, ['project', 'type', 'user']], [DashboardSchema, ['project', 'type', 'user']], [LinkSchema, ['dashboard', 'project', 'type', 'user', 'widget']]] as const) {
  expect(Object.entries(schema.columns).filter(([, c]) => c.isIndexed).map(([name]) => name).sort()).toEqual([...indexed])
  expect(schema.columns.payload.type).toBe('bytes')
  expect(schema.columns.payload.isIndexed).toBe(false)
  expect(schema.tag).toBeUndefined()
 }
})
