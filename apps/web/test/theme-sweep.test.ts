import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const root = join(import.meta.dir, '..')
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]) }
const clean = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
test('theme colors come only from tokens', () => {
 for (const file of [...files(join(root, 'components')), ...files(join(root, 'app'))].filter(f => /\.(css|tsx)$/.test(f) && !/\/app\/(theme.css|layout.tsx)$/.test(f))) {
  expect(clean(readFileSync(file, 'utf8')).match(/#[0-9a-fA-F]{3,8}\b|rgba\(/g), file).toBeNull()
 }
})
test('styles use defined theme or local custom properties', () => {
 const theme = readFileSync(join(root, 'app/theme.css'), 'utf8')
 for (const file of [...files(join(root, 'components')).filter(f => f.endsWith('.css')), join(root, 'app/globals.css')]) {
  const css = clean(readFileSync(file, 'utf8'))
  const defined = new Set([...`${theme}\n${css}`.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]))
  for (const name of ['--lg','--md','--sm','--span']) defined.add(name)
  for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) expect(defined.has(name), `${file}: ${name}`).toBe(true)
 }
})
