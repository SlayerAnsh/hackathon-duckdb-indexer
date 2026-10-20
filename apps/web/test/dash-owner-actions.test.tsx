import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { BalanceNotice, signDisabledReason } from '../components/widgets/BalanceNotice'
import { WidgetActionDialog, actionStep, type ActionPhase } from '../components/widgets/WidgetActionDialog'
import { shortHex } from '../lib/format'

const U = '0x' + 'ef'.repeat(20)
test('balance notice warns below 0.1 GLM and hides unknown and sufficient balances', () => {
 const html = render(<BalanceNotice address={U} wei={BigInt(40000000000000000)} level="low"/>)
 for (const text of ['Low balance: 0.04 GLM.', 'needs at least 0.1 GLM on Tiramisu', shortHex(U), 'role="status"', 'notice notice-warn', 'Copy address']) expect(html).toContain(text)
 expect(render(<BalanceNotice address={U} wei={BigInt(1)} level="low" initialCopied/>)).toContain('✓ Copied')
 expect(render(<BalanceNotice address={U} wei={BigInt(0)} level="empty"/>)).toContain('Your wallet has no GLM.')
 for (const level of ['ok', 'unknown'] as const) expect(render(<BalanceNotice address={U} wei={null} level={level}/>)).toBe('')
 expect(signDisabledReason('empty')).toBe('Fund your wallet to sign')
 for (const level of ['low', 'ok', 'unknown'] as const) expect(signDisabledReason(level)).toBeUndefined()
})
test('owner action reducer handles confirmation, rejection, errors and cancellation', () => {
 expect(actionStep('idle', 'open')).toBe('confirm')
 for (const phase of ['confirm', 'error'] as const) {
  expect(actionStep(phase, 'confirm')).toBe('signing')
  expect(actionStep(phase, 'cancel')).toBe('idle')
 }
 expect(actionStep('signing', 'success')).toBe('idle')
 expect(actionStep('signing', 'rejected')).toBe('confirm')
 expect(actionStep('signing', 'failure')).toBe('error')
 for (const phase of ['idle', 'confirm', 'signing', 'error'] as ActionPhase[]) expect(actionStep(phase, 'open')).toBe(phase === 'idle' ? 'confirm' : phase)
 expect(actionStep('signing', 'cancel')).toBe('signing')
})
test('owner dialogs use accessible shell and exact delete and transfer copy', () => {
 const props = { name: 'Top 10 creators', phase: 'confirm' as const, address: U, onCancel() {}, onConfirm() {} }
 const html = render(<WidgetActionDialog {...props} kind="delete"/>)
 for (const text of ['role="dialog"', 'aria-modal="true"', 'Delete “Top 10 creators”?', 'It disappears from Arkiv now. Dashboards that use it show it as expired. Your wallet signs and pays a small network fee.', '>Cancel<', '>Delete<']) expect(html).toContain(text)
 const transfer = render(<WidgetActionDialog {...props} kind="transfer"/>)
 for (const text of ['Transfer “Top 10 creators”?', 'The new owner can extend, transfer or delete it. You stay the author, but you can no longer delete it or save new versions.', 'New owner address', 'placeholder="0x…"', '>Transfer<']) expect(transfer).toContain(text)
 const id = transfer.match(/<input[^>]*\sid="([^"]+)"/)![1]
 expect(transfer).toContain(`for="${id}"`)
 const busy = render(<WidgetActionDialog {...props} kind="transfer" phase="signing"/>)
 expect(busy).toContain('Waiting for wallet…')
 expect(busy.match(/<button[^>]*disabled=""/g)).toHaveLength(3)
 expect(render(<WidgetActionDialog {...props} kind="delete" phase="error" error="Safe error"/>)).toContain('role="alert">Safe error')
})
