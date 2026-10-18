import s from './about.module.css'

// Requested lifetimes from apps/demo-writer/src/plan.ts (EXPIRY_SECONDS), drawn on a log scale of minutes.
const X0 = 104, W = 320, MAX_MIN = 20160
const x = (minutes: number) => X0 + W * Math.log10(minutes) / Math.log10(MAX_MIN)

const LANES = [
 { name: 'heartbeat', minutes: 10, label: '10 min', tone: s.barHeartbeat },
 { name: 'comment', minutes: 1440, label: '1 day', tone: s.barComment },
 { name: 'ticket', minutes: 10080, label: '7 days', tone: s.barTicket },
]
const TICKS = [{ m: 1, t: '1 min' }, { m: 10, t: '10 min' }, { m: 60, t: '1 h' }, { m: 1440, t: '1 day' }, { m: 10080, t: '7 days' }]
const LAYERS = [
 { where: 'indexer', title: 'Snapshot build', text: 'copies only rows with expires_at > head' },
 { where: 'indexer', title: 'Sweep and prune', text: 'deletes expired rows, keeps 2 snapshots' },
 { where: 'browser', title: 'SQL views', text: 'filter against live_head read from RPC' },
]

export function ExpiryFigure() {
 return <svg className={s.svg} viewBox="0 0 440 384" role="img" aria-labelledby="exp-t exp-d">
  <title id="exp-t">Entity lifetimes and expiry enforcement</title>
  <desc id="exp-d">Heartbeats live 10 minutes, comments 1 day and tickets 7 days. Each new comment extends its ticket by another 7 days. Three layers remove expired rows: the indexer snapshot build, the indexer sweep and snapshot pruning, and the browser SQL views filtering against the live chain head.</desc>
  {LANES.map((lane, i) => {
   const y = 24 + i * 36, end = x(lane.minutes)
   return <g key={lane.name}>
    <text className={s.svgTitle} x={16} y={y + 14}>{lane.name}</text>
    <rect className={lane.tone} x={X0} y={y} width={end - X0} height={20} rx={4}/>
    <text className={s.svgSub} x={end - 8} y={y + 14} textAnchor="end">{lane.label}</text>
   </g>
  })}
  <line className={s.renew} x1={x(10080)} y1={106} x2={X0 + W} y2={106} markerEnd="url(#exp-arrow)"/>
  <defs><marker id="exp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path className={s.arrowHead} d="M0 0 10 5 0 10z"/></marker></defs>
  <text className={s.svgNote} x={X0} y={138}>each new comment calls extendEntity: 7 more days</text>

  <line className={s.axis} x1={X0} y1={152} x2={X0 + W} y2={152}/>
  {TICKS.map(t => <g key={t.t}>
   <line className={s.axis} x1={x(t.m)} y1={148} x2={x(t.m)} y2={156}/>
   <text className={s.svgTick} x={x(t.m)} y={170} textAnchor={t.m === 1 ? 'start' : 'middle'}>{t.t}</text>
  </g>)}

  <text className={s.svgTitle} x={16} y={210}>Three layers remove expired rows</text>
  {LAYERS.map((l, i) => {
   const inset = i * 14, y = 224 + i * 52
   return <g key={l.title}>
    <rect className={s.box} x={16 + inset} y={y} width={408 - 2 * inset} height={44} rx={8}/>
    <rect className={l.where === 'browser' ? s.tagBrowser : s.tag} x={28 + inset} y={y + 12} width={60} height={20} rx={10}/>
    <text className={s.tagText} x={58 + inset} y={y + 26} textAnchor="middle">{l.where}</text>
    <text className={s.svgTitle} x={100 + inset} y={y + 19}>{l.title}</text>
    <text className={s.svgSub} x={100 + inset} y={y + 36}>{l.text}</text>
   </g>
  })}
 </svg>
}
