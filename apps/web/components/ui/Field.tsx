import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

type ControlProps = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' }

/**
 * Form field: label above the control, optional hint, error below
 * (styles: .field, .field-label, .field-hint, .field-error in app/theme.css).
 * The single child control receives id, aria-describedby and aria-invalid.
 *
 *   <Field label="Name" hint="Shown on the card." error={err}>
 *     <input className="input" value={v} onChange={…}/>
 *   </Field>
 */
export function Field({ label, hint, error, optional, id: given, className, children }: {
 label: ReactNode
 hint?: ReactNode
 error?: ReactNode
 optional?: boolean
 id?: string
 className?: string
 children: ReactElement<ControlProps>
}) {
 const auto = useId()
 const id = given ?? (isValidElement(children) ? children.props.id : undefined) ?? `${auto}-control`
 const hintId = hint && !error ? `${id}-hint` : undefined, errorId = error ? `${id}-error` : undefined
 const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined
 const control = cloneElement(children, { id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true } : {}) })
 return <div className={`field${className ? ` ${className}` : ''}`}>
  <label className="field-label" htmlFor={id}><span>{label}</span>{optional && <span className="field-opt">Optional</span>}</label>
  {control}
  {hintId && <p className="field-hint" id={hintId}>{hint}</p>}
  {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
 </div>
}
