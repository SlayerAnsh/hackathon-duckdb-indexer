import { cellText } from '../../lib/csv'
import { isAddress } from '../../lib/explorer'
import { formatCell } from '../../lib/table'
import { AddressLink } from './AddressLink'
import { TypeTag } from './TypeTag'

/** Display of one query cell: type tags, explorer links for addresses, formatted numbers, short hex otherwise. */
export function CellValue({ column, value }: { column: string; value: unknown }) {
 if (column === 'type' || column === 'label') return <TypeTag value={cellText(value)}/>
 if (typeof value === 'string' && isAddress(value)) return <AddressLink address={value}/>
 return <>{formatCell(column, value)}</>
}
