import { formatMs } from '../../lib/format'
import { Tooltip } from './Tooltip'
export function RunBadge({ms,rows}:{ms?:number;rows?:number}) { return <Tooltip text="Measured in this tab with performance.now() around DuckDB WASM, including the worker round trip"><span className="run"><span aria-hidden="true">ϟ</span><b>{ms===undefined?'…':formatMs(ms)}</b>{rows!==undefined&&<span className="run-rows">{rows} rows</span>}</span></Tooltip> }
