import { RowActions as PayloadAction } from '../RowActions'
import { VerifyChip } from './VerifyChip'
export function RowActions({entityKey,rpcUrl,busy,onVerify,status,detail}:{entityKey:string;rpcUrl:string;busy:boolean;onVerify:()=>void;status?:string;detail?:string}) { return <div className="acts"><PayloadAction entityKey={entityKey} rpcUrl={rpcUrl}/><button className="mini" disabled={busy} onClick={onVerify}>Verify</button><VerifyChip status={status} detail={detail}/></div> }
