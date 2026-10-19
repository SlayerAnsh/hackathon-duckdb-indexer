import s from './about.module.css'

// Entity lifetimes, drawn on a log scale of minutes.
const X0 = 104, W = 320, MAX_MIN = 129600
const x = (minutes: number) => X0 + W * Math.log10(minutes) / Math.log10(MAX_MIN)

const LANES = [
 { name: 'widget', minutes: 129600, label: '1 / 7 / 30 / 90 days', tone: s.barWidget },
 { name: 'dashboard', minutes: 129600, label: '90 days', tone: s.barDashboard },
 { name: 'link', minutes: 129600, label: 'with dashboard', tone: s.barLink },
]
const TICKS = [{ m: 1440, t: '1 day' }, { m: 10080, t: '7 days' }, { m: 43200, t: '30 days' }, { m: 129600, t: '90 days' }]
const LAYERS = [
 { where: 'indexer', title: 'Snapshot build', text: 'copies only rows with expires_at > head' },
 { where: 'indexer', title: 'Sweep and prune', text: 'deletes expired rows, keeps 2 snapshots' },
 { where: 'browser', title: 'SQL views', text: 'filter against live_head read from RPC' },
]

export function ExpiryFigure() {
 return <svg className={s.svg} viewBox="0 0 440 384" role="img" aria-labelledby="exp-t exp-d">
  <title id="exp-t">Entity lifetimes and expiry enforcement</title>
  <desc id="exp-d">Widgets live 1, 7, 30 or 90 days. Extend adds time up to 90 days remaining. Dashboards live 90 days and links follow their dashboard. Three layers remove expired rows: the indexer snapshot build, the indexer sweep and snapshot pruning, and the browser SQL views filtering against the live chain head.</desc>
  {LANES.map((lane, i) => {
   const y = 24 + i * 36, end = x(lane.minutes)
   return <g key={lane.name}>
    <text className={s.svgTitle} x={16} y={y + 14}>{lane.name}</text>
    <rect className={lane.tone} x={X0} y={y} width={end - X0} height={20} rx={4}/>
    <text className={s.svgSub} x={end - 8} y={y + 14} textAnchor="end">{lane.label}</text>
   </g>
  })}
  <line className={s.renew} x1={x(43200)} y1={106} x2={X0 + W} y2={106} markerEnd="url(#exp-arrow)"/>
  <defs><marker id="exp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path className={s.arrowHead} d="M0 0 10 5 0 10z"/></marker></defs>
  <text className={s.svgNote} x={X0} y={138}>Extend adds time, capped at 90 days remaining</text>

  <line className={s.axis} x1={X0} y1={152} x2={X0 + W} y2={152}/>
  {TICKS.map(t => <g key={t.t}>
   <line className={s.axis} x1={x(t.m)} y1={148} x2={x(t.m)} y2={156}/>
   <text className={s.svgTick} x={x(t.m)} y={170} textAnchor={t.m === 129600 ? 'end' : 'middle'}>{t.t}</text>
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
