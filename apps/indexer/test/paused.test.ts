import { test, expect, mock } from 'bun:test'
import { bootstrap, servePaused } from '../src/main'
import { loadConfig } from '../src/config'
import { createHandler } from '../src/http'
import { temp, fake, expression } from './helpers'
test('paused config needs no API key and missing store fails without RPC', async () => {
  const config = loadConfig({ BACKFILL_MODE: 'query', INDEX_EXPRESSION: expression, SYNC_PAUSED: '1', DATA_DIR: await temp() })
  expect(config.syncPaused).toBe(true)
  await expect(servePaused(config)).rejects.toThrow('No indexed store found in ' + config.dataDir)
})
test('paused serving resolves bootstrap store without RPC', async () => {
  const config = loadConfig({ BACKFILL_MODE: 'query', INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const query = mock(async () => ({ data: [], blockNumber: 100 }))
  const first = await bootstrap(config, fake(query)); first.store.close(); query.mockClear()
  const result = await servePaused({ ...config, syncPaused: true }, () => {})
  expect(result.dir).toBe(first.dir)
  const response = await createHandler(result.dir, () => ({}))(new Request('http://local/manifest.json'))
  expect((await response.json()).headBlock).toBe(100)
  expect(query).not.toHaveBeenCalled()
})
test('paused serving follows active generation pointer', async () => {
  const { rename, mkdir, writeFile } = await import('node:fs/promises')
  const config = loadConfig({ BACKFILL_MODE: 'query', INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const first = await bootstrap(config, fake(async () => ({ data: [], blockNumber: 100 })))
  first.store.close()
  await rename(first.dir, first.dir + '-g1')
  await mkdir(first.dir)
  await writeFile(first.dir + '/active-generation.json', '1')
  expect((await servePaused({ ...config, syncPaused: true }, () => {})).dir).toBe(first.dir + '-g1')
})
