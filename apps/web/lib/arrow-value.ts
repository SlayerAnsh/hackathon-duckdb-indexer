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

export function fieldConverter(type: { typeId?: number; scale?: number } | undefined): (value: unknown) => unknown {
 return type?.typeId === DECIMAL ? value => decimalValue(value, type.scale ?? 0) : value => value
}
