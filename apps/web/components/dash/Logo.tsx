/** Brand mark: SQL brackets around rising bars (a query over chain data, drawn as a chart). Uses currentColor. */
export function Logo({ size = 22 }: { size?: number }) {
 return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path d="M10 5H6v22h4M22 5h4v22h-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/><rect x="10.5" y="17" width="3" height="6" rx="1" fill="currentColor" opacity=".5"/><rect x="14.5" y="13" width="3" height="10" rx="1" fill="currentColor" opacity=".75"/><rect x="18.5" y="9" width="3" height="14" rx="1" fill="currentColor"/></svg>
}
