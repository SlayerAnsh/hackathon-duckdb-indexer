import c from './chrome.module.css'
import { cx } from './cx'
const TONE: Record<string, string | undefined> = { live: c.live, behind: c.behind, stale: c.stale, disk: c.disk, unknown: c.unknown }
export function StateChip({state,label}:{state:string;label?:string}) { return <span className={cx(c.state, TONE[state] ?? '')} data-state={state}><span className={c.dot} aria-hidden="true"/>{label??state}</span> }
