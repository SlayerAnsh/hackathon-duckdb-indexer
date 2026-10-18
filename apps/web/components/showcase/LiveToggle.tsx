import type { LiveMode } from './use-live-mode'
import s from './showcase.module.css'

const PlayIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><circle cx="8" cy="8" r="3.5"/></svg>
const PauseIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><rect x="4" y="3.5" width="2.6" height="9" rx=".8"/><rect x="9.4" y="3.5" width="2.6" height="9" rx=".8"/></svg>

/** Live reruns every card when the index updates; Paused keeps the current results until refreshed or resumed. */
export function LiveToggle({ mode, onChange, note }: { mode: LiveMode; onChange: (mode: LiveMode) => void; note?: string }) {
 return <div className={s.live}>
  <div className={s.segment} role="group" aria-label="Card updates">
   <button type="button" aria-pressed={mode === 'live'} title="Rerun cards when the index updates" onClick={() => onChange('live')} data-mode="live"><PlayIcon/>Live</button>
   <button type="button" aria-pressed={mode === 'paused'} title="Keep current results; the index keeps syncing" onClick={() => onChange('paused')} data-mode="paused"><PauseIcon/>Paused</button>
  </div>
  <p className={s.liveNote} aria-live="polite">{note ?? 'Cards rerun as the index updates'}</p>
 </div>
}
