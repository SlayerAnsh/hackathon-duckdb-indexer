/** A query failure split for display: DuckDB's exception type (Parser, Binder, Catalog…) and a readable message. */
export type QueryError = { type?: string; message: string }

/**
 * DuckDB WASM reports some errors as a JSON object, for example
 * `{"exception_type":"Parser","exception_message":"syntax error at or near \"selec\"\n\nLINE 1: …"}`.
 * Parsing it turns the escaped `\n` into real newlines, so the caret under LINE lines up in a `<pre>`.
 * Any other text passes through unchanged.
 */
export function parseQueryError(text: string): QueryError {
 const start = text.indexOf('{')
 if (start >= 0) {
  try {
   const value = JSON.parse(text.slice(start)) as { exception_type?: unknown; exception_message?: unknown }
   if (value && typeof value.exception_message === 'string') return { type: typeof value.exception_type === 'string' && value.exception_type ? value.exception_type : undefined, message: value.exception_message.trim() }
  } catch { /* Not JSON: show the text as it is. */ }
 }
 return { message: text }
}

/** Notice title for a failed query: "Parser error" when DuckDB names the type. */
export const queryErrorTitle = (error: QueryError): string => error.type ? `${error.type} error` : 'Query failed'
