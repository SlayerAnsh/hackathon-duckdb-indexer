import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { EmptyState } from '../components/widgets/EmptyState'

test('empty state renders title, body, actions and status role with token colors only', () => {
 const html = render(<EmptyState icon="dashboard" title="No dashboards yet" body="Body copy" actions={<a href="/x">Go</a>}/>)
 for (const text of ['No dashboards yet', 'Body copy', 'role="status"', 'href="/x"', 'class="empty-state"', '<svg']) expect(html).toContain(text)
 expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
 expect(render(<EmptyState compact icon="activity" title="T" body="B"/>)).toContain('empty-state-compact')
 expect(render(<EmptyState icon="search" title="T" body="B"/>)).not.toContain('empty-state-actions')
})
