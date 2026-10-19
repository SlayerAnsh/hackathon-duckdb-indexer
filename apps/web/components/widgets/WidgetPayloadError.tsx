export function WidgetPayloadError({ error, onRetry }: { error?: string; onRetry?(): void }) {
 return error ? <p className="error" role="alert" style={{ gridColumn: '1 / -1' }}>{error} {onRetry && <button type="button" className="btn btn-quiet" onClick={onRetry}>Try again</button>}</p> : null
}
