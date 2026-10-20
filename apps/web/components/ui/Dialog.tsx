'use client'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type DialogSize = 'sm' | 'md' | 'lg'

export type DialogProps = {
 open: boolean
 onClose(): void
 title: ReactNode
 description?: ReactNode
 /** sm 420px, md 560px (default), lg 760px. Under 560px every size is a bottom sheet. */
 size?: DialogSize
 children?: ReactNode
 /** Right aligned actions on a tinted strip. Put the primary action last. */
 footer?: ReactNode
 /** false blocks Escape, outside click and the close button (for example while a wallet signs). */
 dismissible?: boolean
 /** Extra class on the dialog panel. */
 className?: string
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
const EXIT_MS = 120

function focusables(root: HTMLElement) {
 return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute('inert') && el.getClientRects().length > 0)
}

function prefersReducedMotion() {
 try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return true }
}

/**
 * Modal dialog primitive (styles in app/theme.css, section "dialogs").
 *
 * Handles Escape, click outside, a Tab focus trap, initial focus (an element
 * with `data-autofocus`, else the first control in the body, else the footer,
 * else the close button, else the panel itself, which never shows a focus
 * ring), focus return to the opener, body scroll lock, an
 * exit animation (skipped under prefers-reduced-motion) and
 * aria-labelledby/aria-describedby wiring.
 *
 * Usage:
 *   <Dialog open={open} onClose={() => setOpen(false)} size="sm"
 *     title="New dashboard" description="Give it a name. You can change it later."
 *     footer={<>
 *       <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
 *       <button type="submit" form="new-dash" className="btn btn-primary" disabled={!name.trim()}>Create dashboard</button>
 *     </>}>
 *     <form id="new-dash" className="field-stack" onSubmit={save}>
 *       <div className="field"><label className="field-label" htmlFor="dash-name">Name</label>
 *         <input id="dash-name" className="input" value={name} onChange={e => setName(e.target.value)}/></div>
 *     </form>
 *   </Dialog>
 *
 * While a write is in flight pass dismissible={false} and render the primary
 * as <button className="btn btn-primary" aria-busy="true" disabled><span className="spinner" aria-hidden="true"/>Saving…</button>.
 */
export function Dialog({ open, onClose, title, description, size = 'md', children, footer, dismissible = true, className }: DialogProps) {
 const id = useId()
 const titleId = `${id}-title`, descId = `${id}-desc`
 const panel = useRef<HTMLDivElement>(null)
 const pressedOutside = useRef(false)
 const closeRef = useRef(onClose); closeRef.current = onClose
 const dismissRef = useRef(dismissible); dismissRef.current = dismissible
 const [mounted, setMounted] = useState(open)
 const [closing, setClosing] = useState(false)

 // Keep the dialog mounted long enough to play its exit animation.
 useEffect(() => {
  if (open) { setMounted(true); setClosing(false); return }
  if (!mounted) return
  if (prefersReducedMotion()) { setMounted(false); return }
  setClosing(true)
  const timer = setTimeout(() => { setMounted(false); setClosing(false) }, EXIT_MS)
  return () => clearTimeout(timer)
 }, [open, mounted])

 // Initial focus, focus return and scroll lock for the life of the mounted dialog.
 useEffect(() => {
  if (!mounted) return
  const opener = document.activeElement as HTMLElement | null
  const root = panel.current
  if (root) {
   const body = root.querySelector<HTMLElement>('.dialog-b'), foot = root.querySelector<HTMLElement>('.dialog-f')
   const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? (body && focusables(body)[0]) ?? (foot && focusables(foot)[0]) ?? focusables(root)[0] ?? root
   target.focus()
  }
  const { overflow } = document.body.style
  document.body.style.overflow = 'hidden'
  return () => { document.body.style.overflow = overflow; if (opener && document.contains(opener)) opener.focus() }
 }, [mounted])

 if (!mounted) return null
 const state = closing ? 'closing' : 'open'
 const requestClose = () => { if (dismissRef.current && !closing) closeRef.current() }

 return <div className="dialog-backdrop" data-state={state}
  onMouseDown={event => { pressedOutside.current = event.target === event.currentTarget }}
  onMouseUp={event => { if (pressedOutside.current && event.target === event.currentTarget) requestClose(); pressedOutside.current = false }}>
  <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
   tabIndex={-1} data-state={state} className={`dialog dialog-${size}${className ? ` ${className}` : ''}`}
   onBlur={event => {
    // A focused button that becomes disabled (for example Save while a wallet signs) drops focus to
    // <body>. Pull it back onto the panel so Tab and Escape keep working inside the dialog.
    if (event.relatedTarget) return
    requestAnimationFrame(() => { if (panel.current && document.activeElement === document.body) panel.current.focus() })
   }}
   onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); requestClose(); return }
    if (event.key !== 'Tab' || !panel.current) return
    const items = focusables(panel.current)
    if (!items.length) { event.preventDefault(); panel.current.focus(); return }
    const first = items[0], last = items[items.length - 1], active = document.activeElement
    if (event.shiftKey && (active === first || active === panel.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
   }}>
   <div className="dialog-h">
    <div className="dialog-h-text">
     <h2 id={titleId} className="dialog-title">{title}</h2>
     {description && <p id={descId} className="dialog-desc">{description}</p>}
    </div>
    <button type="button" className="ib ib-sm dialog-x" aria-label="Close" disabled={!dismissible} onClick={requestClose}>
     <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>
    </button>
   </div>
   {children != null && children !== false && <div className="dialog-b">{children}</div>}
   {footer && <div className="dialog-f">{footer}</div>}
  </div>
 </div>
}
