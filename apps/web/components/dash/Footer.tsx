import Link from 'next/link'
import c from './chrome.module.css'
import { cx } from './cx'
export function Footer() { return <footer className={cx('foot', c.foot)}><div className={cx('wrap', c.footIn)}><p className={c.footText}><span className={c.brand}>Arkiv <b>SQL</b></span><span>Open source, self hostable indexer (MIT). Read only: expiry is enforced at the live chain head, so entities leave SQL when their expiry block is reached.</span></p><nav className={c.footNav} aria-label="Footer"><Link href="/">Home</Link><Link href="/explore">Explore</Link><Link href="/playground">Playground</Link><Link href="/about">About</Link><a href="https://github.com/SlayerAnsh/hackathon-duckdb-indexer" target="_blank" rel="noreferrer">Source</a></nav></div></footer> }
