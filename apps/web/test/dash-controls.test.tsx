import React from 'react'
import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { ChartPicker, CHART_LABELS, pickerIndex } from '../components/widgets/ChartPicker'
import { ChartIcon } from '../components/widgets/ChartIcon'
import { TimeLeft } from '../components/widgets/TimeLeft'
import { ExtendButton, extendStep } from '../components/widgets/ExtendButton'
import { ExtendDialog } from '../components/widgets/ExtendDialog'
import { SyncChip } from '../components/widgets/SyncChip'
import { BLOCKS_PER_DAY as DAY, CHART_TYPES } from '../lib/dash/schema'

test('chart picker labels, selection and keyboard navigation', () => {
 const html = render(<ChartPicker value="bar" onChange={() => {}}/> )
 expect(html).toContain('role="radiogroup" aria-label="Chart type"')
 expect(html.match(/role="radio"/g)).toHaveLength(9)
 expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
 expect(html.match(/tabindex="0"/g)).toHaveLength(1)
 for (const type of CHART_TYPES) { expect(html).toContain(CHART_LABELS[type]); expect(render(<ChartIcon type={type}/>)).toContain('stroke-width="1.6"') }
 for (const key of ['ArrowRight', 'ArrowDown']) expect(pickerIndex(key, 8)).toBe(0)
 for (const key of ['ArrowLeft', 'ArrowUp']) expect(pickerIndex(key, 0)).toBe(8)
 expect(pickerIndex('Home', 3)).toBe(0)
 expect(pickerIndex('End', 3)).toBe(8)
 expect(pickerIndex('Enter', 3)).toBe(3)
})
test('expiry chips use the required tones', () => {
 for (const [expiresAt, text, cls] of [[7 * DAY, '7d 0h left', 'quiet-chip'], [5400, 'Expires in 3h', 'state state-behind'], [1200, 'Expires in 40m', 'state state-behind'], [0, 'Expired', 'state state-stale']] as const) {
  const html = render(<TimeLeft expiresAt={expiresAt} head={0}/> )
  expect(html).toContain(text); expect(html).toContain(`class="${cls}"`)
 }
})
test('extend state machine keeps failures in the dialog', () => {
 expect(extendStep('idle', 'click')).toBe('confirm')
 for (const event of ['cancel', 'escape', 'timeout'] as const) expect(extendStep('confirm', event)).toBe('idle')
 expect(extendStep('confirm', 'confirm')).toBe('extending')
 expect(extendStep('extending', 'success')).toBe('done')
 expect(extendStep('extending', 'rejected')).toBe('confirm')
 expect(extendStep('extending', 'failure')).toBe('error')
 expect(extendStep('error', 'confirm')).toBe('extending')
 expect(extendStep('done', 'settled')).toBe('idle')
 expect(extendStep('extending', 'confirm')).toBe('extending')
})
test('extend dialog copy and progress', () => {
 const props = { name: 'Top 10 creators', expiresAt: 7 * DAY, head: 0, lifetimeDays: 7 as const, onCancel() {}, onConfirm() {} }
 const html = render(<ExtendDialog {...props} phase="confirm"/> )
 for (const text of ['role="dialog"', 'aria-modal="true"', 'Extend “Top 10 creators”?', 'Adds 7 days', 'New expiry: in 14d 0h.', 'Your wallet signs and pays a small network fee.', '>Cancel<', '>Extend<']) expect(html).toContain(text)
 expect(render(<ExtendDialog {...props} lifetimeDays={1} phase="confirm"/>)).toContain('Adds 1 day.')
 expect(render(<ExtendDialog {...props} phase="extending"/>)).toContain('Waiting for wallet…')
 expect(render(<ExtendDialog {...props} phase="error"/>)).toContain('Your wallet couldn&#x27;t sign. Try again.')
})
test('extend availability and cap', () => {
 const props = { widgetKey: '0x' + 'a'.repeat(64), expiresAt: 7 * DAY, head: 0, lifetimeDays: 7 as const, canExtend: true }
 expect(render(<ExtendButton {...props} canExtend={false}/>)).toBe('')
 expect(render(<ExtendButton {...props} expiresAt={0}/>)).toBe('')
 expect(render(<ExtendButton {...props} expiresAt={90 * DAY}/>)).toContain('title="Already at the 90 day maximum" disabled=""')
 expect(render(<ExtendButton {...props}/>)).toContain('>Extend<')
})
test('sync chip only shows a pending write', () => {
 expect(render(<SyncChip version={0}/>)).toBe('')
 expect(render(<SyncChip version={0} write={{key: '0x' + 'a'.repeat(64), kind: 'widget', op: 'upsert', at: 0, afterBlock: 1}}/>)).toContain('Syncing')
})

test('extension eligibility excludes app owned, official, expired and anonymous widgets', async () => {
 const { canExtendWidget } = await import('../lib/dash/widget-actions')
 const { U, OTHER, W } = await import('./dash-fakes')
 const w = { owner: U, expiresAt: 2000, official: false }
 expect(canExtendWidget(w, 1000, OTHER, W)).toBe(true)
 expect(canExtendWidget({ ...w, owner: W.toUpperCase() }, 1000, U, W)).toBe(false)
 expect(canExtendWidget({ ...w, official: true }, 1000, U, W)).toBe(false)
 expect(canExtendWidget(w, 1000, null, W)).toBe(false)
 expect(canExtendWidget({ ...w, expiresAt: 900 }, 1000, U, W)).toBe(false)
 expect(canExtendWidget(w, undefined, U, W)).toBe(true)
 const error = 'Not enough GLM to pay the network fee. Fund your wallet and try again.'
 const html = render(<ExtendDialog expiresAt={2000} head={1000} lifetimeDays={7} phase="error" error={error} onCancel={() => {}} onConfirm={() => {}}/>)
 expect(html).toContain(error); expect(html).toContain('role="alert"')
})

test('extension disabled reason disables signing with an explanatory title', () => {
 const html = render(<ExtendButton widgetKey={'0x' + 'a'.repeat(64)} expiresAt={7 * DAY} head={0} lifetimeDays={7} canExtend disabledReason="Fund your wallet to sign"/>)
 expect(html).toContain('title="Fund your wallet to sign" disabled=""')
})
