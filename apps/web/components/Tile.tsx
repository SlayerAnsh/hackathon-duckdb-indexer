'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { IndexDb } from '../lib/indexdb'
import type { TILES } from '../lib/tiles'
import { cellText } from '../lib/csv'
export function Tile({ tile, db, block, onSql }: { tile: typeof TILES[number]; db: IndexDb; block?: number; onSql: (sql: string) => void }) {
 const [rows, setRows] = useState<unknown[][]>([]); const [error, setError] = useState('')
 useEffect(() => { let active = true; void db.run(tile.sql).then(r => { if (active) { setRows(r.rows); setError('') } }).catch(e => { if (active) setError(String(e)) }); return () => { active = false } }, [db, block, tile])
 const data = rows.map(r => ({ label: cellText(r[0]), count: Number(r[1]) }))
 return <article><h2>{tile.title}</h2>{error ? <p role="alert">{error}</p> : tile.kind === 'number' ? <strong className="number">{cellText(rows[0]?.[0]) || '0'}</strong> : tile.kind === 'table' ? <table><tbody>{rows.map((r,i) => <tr key={i}><td><button onClick={() => onSql("SELECT * FROM entities WHERE creator = '" + String(r[0]).replaceAll("'", "''") + "'")}>{cellText(r[0])}</button></td><td>{cellText(r[1])}</td></tr>)}</tbody></table> : <div style={{ height: 200 }}><ResponsiveContainer width="100%" height="100%">{tile.kind === 'bar' ? <BarChart data={data}><XAxis dataKey="label"/><YAxis/><Tooltip/><Bar dataKey="count" fill="#4f8cff"/></BarChart> : <LineChart data={data}><XAxis dataKey="label"/><YAxis/><Tooltip/><Line dataKey="count" stroke="#4f8cff"/></LineChart>}</ResponsiveContainer></div>}<button onClick={() => onSql(tile.sql)}>View SQL</button></article>
}
