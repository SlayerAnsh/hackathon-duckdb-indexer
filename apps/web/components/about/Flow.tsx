import type { ReactNode } from 'react'
import s from './flow.module.css'

// Simple infographics shared by the landing page and /about. Plain HTML lists, so they reflow:
// a row of steps on wide screens, a vertical stack on phones. Colors come only from theme tokens.
export type FlowStep = { title: string; text: ReactNode; tone?: 'accent' | 'faded' }

/** Numbered cards joined by arrows: a process that moves left to right. */
export function StepFlow({ label, steps }: { label: string; steps: FlowStep[] }) {
 return <div className={s.box}><ol className={s.flow} aria-label={label} style={{ '--n': steps.length } as React.CSSProperties}>
  {steps.map((step, i) => <li key={step.title} className={`${s.step} ${step.tone === 'accent' ? s.accent : ''}`}>
   <span className={s.n} aria-hidden="true">{i + 1}</span>
   <b className={s.title}>{step.title}</b>
   <span className={s.text}>{step.text}</span>
  </li>)}
 </ol></div>
}

/** Dots on one line: the stages an entity goes through, ending in expiry. */
export function Lifecycle({ label, steps }: { label: string; steps: FlowStep[] }) {
 return <ol className={s.life} aria-label={label} style={{ '--n': steps.length } as React.CSSProperties}>
  {steps.map(step => <li key={step.title} className={`${s.stage} ${step.tone === 'faded' ? s.faded : ''} ${step.tone === 'accent' ? s.accent : ''}`}>
   <span className={s.dot} aria-hidden="true"/>
   <b className={s.title}>{step.title}</b>
   <span className={s.text}>{step.text}</span>
  </li>)}
 </ol>
}

/** Short labelled points in a row, each with a coloured rule on top. */
export function Points({ items }: { items: { title: string; text: ReactNode }[] }) {
 return <ul className={s.points}>{items.map(item => <li key={item.title}><b className={s.title}>{item.title}</b><span className={s.text}>{item.text}</span></li>)}</ul>
}
