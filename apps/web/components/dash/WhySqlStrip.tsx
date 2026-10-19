import Link from 'next/link'
// Clauses arkiv_query cannot express, each linking to the public dashboards.
export const WHY_SQL = [
 { view: 'creators', clause: 'JOIN', label: 'connect entities' },
 { view: 'attributes', clause: 'GROUP BY', label: 'aggregate anything' },
 { view: 'expiry', clause: 'ORDER BY', label: 'sort any attribute' },
 { view: 'activity', clause: 'OVER', label: 'window functions' },
] as const
export function WhySqlStrip({ className }: { className?: string }) { return <ul className={'why-list ' + (className ?? '')} aria-label="Beyond arkiv_query">{WHY_SQL.map(w => <li key={w.view}><Link href={'/explore'}><code>{w.clause}</code>{w.label}</Link></li>)}</ul> }
