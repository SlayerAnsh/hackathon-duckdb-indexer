import { Tooltip } from './Tooltip'
import d from './data.module.css'
export function NotInArkivQueryBadge({reason}:{reason?:string}) { return reason?<Tooltip text={'arkiv_query cannot express '+reason}><span className={d.cant}>{reason}</span></Tooltip>:null }
