import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dialog } from '../components/ui/Dialog'
import { Field } from '../components/ui/Field'

const theme = readFileSync(new URL('../app/theme.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

test('Dialog renders a labelled modal with description, close button and footer', () => {
 const html = renderToStaticMarkup(<Dialog open onClose={() => {}} size="sm" title="New dashboard" description="Name it." footer={<button className="btn btn-primary">Create</button>}><input/></Dialog>)
 expect(html).toContain('role="dialog"')
 expect(html).toContain('aria-modal="true"')
 expect(html).toContain('class="dialog dialog-sm"')
 const labelled = html.match(/aria-labelledby="([^"]+)"/)![1]
 expect(html).toMatch(new RegExp(`<h2 id="${labelled}" class="dialog-title">New dashboard</h2>`))
 const described = html.match(/aria-describedby="([^"]+)"/)![1]
 expect(html).toContain(`<p id="${described}" class="dialog-desc">Name it.</p>`)
 expect(html).toContain('aria-label="Close"')
 expect(html).toMatch(/<div class="dialog-f"><button class="btn btn-primary">Create<\/button><\/div>/)
 expect(html).toContain('class="dialog-b"')
})

test('Dialog renders nothing when closed and omits optional parts', () => {
 expect(renderToStaticMarkup(<Dialog open={false} onClose={() => {}} title="Hidden"/>)).toBe('')
 const html = renderToStaticMarkup(<Dialog open onClose={() => {}} title="Plain"/>)
 expect(html).toContain('class="dialog dialog-md"')
 expect(html).not.toContain('aria-describedby')
 expect(html).not.toContain('"dialog-f"')
 expect(html).not.toContain('"dialog-b"')
})

test('Field wires the label, hint and error to its control', () => {
 const html = renderToStaticMarkup(<Field label="Name" hint="Shown on cards"><input id="n"/></Field>)
 expect(html).toContain('for="n"')
 expect(html).toContain('aria-describedby="n-hint"')
 const bad = renderToStaticMarkup(<Field label="Name" hint="Shown" error="Required"><input id="n"/></Field>)
 expect(bad).toContain('aria-invalid="true"')
 expect(bad).toContain('aria-describedby="n-error"')
 expect(bad).not.toContain('field-hint')
})

test('theme.css defines the shared primitives', () => {
 for (const selector of ['.switch', '.seg', '.field', '.dialog', '.dialog-backdrop', '.dialog-f', '.input-group', '.notice', '.menu', '.mi', '.btn-danger', '.spinner', '.skel', '.card-h', '.has-tip[data-tip]']) {
  expect(theme.includes(`${selector}{`) || theme.includes(`${selector},`), selector).toBe(true)
 }
})

test('theme.css has one .tab and one .tabs block', () => {
 expect(theme.match(/(^|[\s}])\.tab\{/g)).toHaveLength(1)
 expect(theme.match(/(^|[\s}])\.tabs\{/g)).toHaveLength(1)
 expect(theme.match(/(^|[\s}])\.btn\{/g)).toHaveLength(1)
})
