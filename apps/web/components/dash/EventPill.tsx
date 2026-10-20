import c from './chrome.module.css'
import { cx } from './cx'
const TONE: Record<string, string | undefined> = { Created: c.created, Patched: c.patched, Extended: c.extended, Transferred: c.transferred, Deleted: c.deleted }
export function EventPill({kind}:{kind:string}) {return <span className={cx(c.pill, TONE[kind] ?? c.patched)}>{kind}</span>}
