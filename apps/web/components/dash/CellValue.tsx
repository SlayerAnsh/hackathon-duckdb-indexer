import { cellText } from '../../lib/csv'
import { isAddress } from '../../lib/explorer'
import { formatCell } from '../../lib/table'
import { AddressLink } from './AddressLink'
import { TypeTag } from './TypeTag'
import d from './data.module.css'

/** Display of one query cell: type tags, explorer links for addresses, formatted numbers, short hex otherwise. NULL is shown muted. */
export function CellValue({ column, value }: { column: string; value: unknown }) {
 if (value === null || value === undefined) return <span className={d.null}>NULL</span>
 if (column === 'type' || column === 'label') return <TypeTag value={cellText(value)}/>
 if (typeof value === 'string' && isAddress(value)) return <AddressLink address={value}/>
 return <>{formatCell(column, value)}</>
}
