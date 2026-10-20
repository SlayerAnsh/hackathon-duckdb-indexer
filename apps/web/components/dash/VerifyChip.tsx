import { Tooltip } from './Tooltip'
import d from './data.module.css'
import { cx } from './cx'
export function VerifyChip({status,detail}:{status?:string;detail?:string}) {
 const tone=!status?d.vNone:status==='ok'?d.vOk:['deleted','expired','error'].includes(status)?d.vBad:d.vStale
 return <Tooltip text={detail??'Verify re-reads this entity from the configured RPC. This is a consistency check, not a cryptographic proof.'}><span className={cx(d.vchip, tone)}>{status??'not checked'}</span></Tooltip>
}
