import { cellText } from '../../lib/csv'
import { numericColumns } from '../../lib/table'
import { CellValue } from './CellValue'
import d from './data.module.css'
import { cx } from './cx'
export type TableData={columns:string[];rows:unknown[][]}
export function DataTable({data}:{data:TableData}) {
 if(!data.rows.length)return <p className={cx('empty', d.empty)}>No rows yet</p>
 const num=numericColumns(data.columns,data.rows)
 return <div className={cx('tbl-wrap', d.wrap)}><table className={cx('tbl', d.table)}><thead><tr>{data.columns.map((c,i)=><th key={i} className={num[i]?'num':undefined}>{c}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className={num[j]?'num':'mono'} title={cellText(v)}><CellValue column={data.columns[j]} value={v}/></td>)}</tr>)}</tbody></table></div>
}
