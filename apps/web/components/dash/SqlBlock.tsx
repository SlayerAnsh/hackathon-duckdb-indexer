'use client'
import { useState } from 'react'
import d from './data.module.css'
import { cx } from './cx'
const KW = /('[^']*'|\b(?:SELECT|FROM|WHERE|JOIN|LEFT|ON|GROUP|BY|ORDER|AS|WITH|CASE|WHEN|THEN|ELSE|END|LIMIT|OVER|PARTITION|DESC|ASC|AND|OR|DISTINCT|IS|NOT|NULL|FILTER|HAVING|UNION|ALL|IN|BETWEEN|COALESCE)\b)/gi
export function SqlBlock({sql}:{sql:string}) {
 const [message,setMessage]=useState('Copy')
 async function copy(){try{await navigator.clipboard.writeText(sql);setMessage('Copied');setTimeout(()=>setMessage('Copy'),1600)}catch{setMessage('Copy unavailable')}}
 return <div className={cx('sqlpane', d.sql)}><pre><code>{sql.split(KW).map((part,i)=><span key={i} className={i%2?(part.startsWith("'")?'sx-str':'sx-kw'):undefined}>{part}</span>)}</code></pre><button type="button" className={cx('btn', 'btn-outline', 'btn-sm', d.copy)} onClick={()=>void copy()} aria-live="polite">{message==='Copied'?<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>:<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>}{message}</button></div>
}
