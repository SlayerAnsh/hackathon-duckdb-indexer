import { Tooltip } from './Tooltip'
export function NotInArkivQueryBadge({reason}:{reason?:string}) { return reason?<Tooltip text={'arkiv_query cannot express '+reason}><span className="cant">{reason}</span></Tooltip>:null }
