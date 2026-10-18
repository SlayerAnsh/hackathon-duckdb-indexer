import { cellText } from '../../lib/csv'
import { shortHex } from '../../lib/format'
import { TypeTag } from './TypeTag'
export type TableData={columns:string[];rows:unknown[][]}
export function DataTable({data}:{data:TableData}) { if(!data.rows.length)return <p className="empty">No rows yet</p>;return <div className="tbl-wrap"><table className="tbl"><thead><tr>{data.columns.map((c,i)=><th key={i}>{c}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className={typeof v==='number'||typeof v==='bigint'?'num':'mono'} title={cellText(v)}>{['type','label'].includes(data.columns[j])?<TypeTag value={cellText(v)}/>:shortHex(cellText(v))}</td>)}</tr>)}</tbody></table></div> }
