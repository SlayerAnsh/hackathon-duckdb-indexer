// Arrow returns DECIMAL (and HUGEINT, which DuckDB exports as DECIMAL(38,0)) as an unscaled big number object.
// Convert it to a plain number, or a bigint when an integer exceeds the safe range, so tables and CSV show digits.
export function decimalValue(value: unknown, scale: number): unknown {
 if (value == null || typeof value !== 'object') return value
 const digits = String(value)
 if (!/^-?\d+$/.test(digits)) return value
 if (scale === 0) { const n = Number(digits); return Number.isSafeInteger(n) ? n : BigInt(digits) }
 return Number(digits) / 10 ** scale
}

const DECIMAL = 7
const INT = 2, FLOAT = 3, UTF8 = 5, BOOL = 6, DATE = 8, TIME = 9, TIMESTAMP = 10, LARGE_UTF8 = 20

export function arrowTypeName(type: { typeId?: number; toString(): string }): string {
 switch (type.typeId) {
  case UTF8: case LARGE_UTF8: return 'text'
  case INT: return 'integer'
  case FLOAT: return 'float'
  case DECIMAL: return 'decimal'
  case BOOL: return 'boolean'
  case TIMESTAMP: return 'timestamp'
  case DATE: return 'date'
  case TIME: return 'time'
  default: return 'other'
 }
}

export function fieldConverter(type: { typeId?: number; scale?: number } | undefined): (value: unknown) => unknown {
 return type?.typeId === DECIMAL ? value => decimalValue(value, type.scale ?? 0) : value => value
}
