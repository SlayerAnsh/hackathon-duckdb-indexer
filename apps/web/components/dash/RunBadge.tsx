import { formatMs } from '../../lib/format'
import { Tooltip } from './Tooltip'
import d from './data.module.css'
import { cx } from './cx'
const Bolt = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/></svg>
export function RunBadge({ms,rows}:{ms?:number;rows?:number}) { return <Tooltip text="Measured in this tab with performance.now() around DuckDB WASM, including the worker round trip"><span className={cx('run', d.run)}><Bolt/><b>{ms===undefined?'…':formatMs(ms)}</b>{rows!==undefined&&<span className={d.runRows}>{rows.toLocaleString('en-US')} {rows===1?'row':'rows'}</span>}</span></Tooltip> }
