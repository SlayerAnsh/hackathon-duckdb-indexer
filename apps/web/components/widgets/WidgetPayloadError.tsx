export function WidgetPayloadError({ error, onRetry }: { error?: string; onRetry?(): void }) {
 return error ? <div className="notice notice-warn" role="alert" style={{ gridColumn: '1 / -1', alignItems: 'center' }}>
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginTop: 0 }}><path d="M8 2 1.5 13.5h13Z"/><path d="M8 6.5v3M8 11.5h.01"/></svg>
  <div><p>{error}</p></div>
  {onRetry && <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>Try again</button>}
 </div> : null
}
