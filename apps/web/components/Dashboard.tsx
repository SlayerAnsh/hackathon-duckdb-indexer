'use client'
import { TILES } from '../lib/tiles'
import type { IndexDb } from '../lib/indexdb'
import { Tile } from './Tile'
export function Dashboard({ db, block, onSql }: { db: IndexDb; block?: number; onSql: (sql: string) => void }) { return <section className="grid" aria-label="Dashboard">{TILES.map(tile => <Tile key={tile.id} tile={tile} db={db} block={block} onSql={onSql}/>)}</section> }
