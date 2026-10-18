import { cellText } from '../../lib/csv'
import { numericColumns } from '../../lib/table'
import { CellValue } from './CellValue'
export type TableData={columns:string[];rows:unknown[][]}
export function DataTable({data}:{data:TableData}) {
 if(!data.rows.length)return <p className="empty">No rows yet</p>
 const num=numericColumns(data.columns,data.rows)
 return <div className="tbl-wrap"><table className="tbl"><thead><tr>{data.columns.map((c,i)=><th key={i} className={num[i]?'num':undefined}>{c}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className={num[j]?'num':'mono'} title={cellText(v)}><CellValue column={data.columns[j]} value={v}/></td>)}</tr>)}</tbody></table></div>
}
