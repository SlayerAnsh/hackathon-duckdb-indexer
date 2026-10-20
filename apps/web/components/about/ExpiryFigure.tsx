import s from './about.module.css'

// Entity lifetimes on a log scale of days (1 to 90), then the three places that drop expired rows.
const X0 = 128, W = 292, MAX_DAYS = 90
const x = (days: number) => X0 + W * Math.log10(days) / Math.log10(MAX_DAYS)

const WIDGET_OPTIONS = [1, 7, 30, 90]
const TICKS = [{ d: 1, t: '1 day' }, { d: 7, t: '7 days' }, { d: 30, t: '30 days' }, { d: 90, t: '90 days' }]
const LAYERS = [
 { where: 'indexer', title: 'Snapshot build', text: 'copies only rows with expires_at > head' },
 { where: 'indexer', title: 'Sweep and prune', text: 'deletes expired rows, keeps 2 snapshots' },
 { where: 'browser', title: 'SQL views', text: 'filter against live_head read from RPC' },
]

function Lane({ y, name, sub, children }: { y: number; name: string; sub: string; children: React.ReactNode }) {
 return <g>
  <text className={s.svgTitle} x={16} y={y + 4}>{name}</text>
  <text className={s.svgSub} x={16} y={y + 21}>{sub}</text>
  {children}
 </g>
}

export function ExpiryFigure() {
 const end = x(MAX_DAYS)
 return <svg className={s.svg} viewBox="0 0 440 404" role="img" aria-labelledby="exp-t exp-d">
  <title id="exp-t">Entity lifetimes and expiry enforcement</title>
  <desc id="exp-d">Widgets live 1, 7, 30 or 90 days. Extend adds time up to 90 days remaining. Dashboards live 90 days and links follow their dashboard. Three layers remove expired rows: the indexer snapshot build, the indexer sweep and snapshot pruning, and the browser SQL views filtering against the live chain head.</desc>

  {TICKS.map(t => <line key={t.t} className={s.gridLine} x1={x(t.d)} y1={14} x2={x(t.d)} y2={150}/>)}

  <Lane y={28} name="widget" sub="chosen lifetime">
   <rect className={s.track} x={X0} y={18} width={end - X0} height={16} rx={4}/>
   {WIDGET_OPTIONS.map(d => <circle key={d} className={s.optWidget} cx={x(d)} cy={26} r={5}/>)}
  </Lane>
  <Lane y={76} name="dashboard" sub="90 days">
   <rect className={s.barDashboard} x={X0} y={66} width={end - X0} height={16} rx={4}/>
  </Lane>
  <Lane y={124} name="link" sub="follows dashboard">
   <rect className={s.barLink} x={X0} y={114} width={end - X0} height={16} rx={4}/>
  </Lane>

  <line className={s.axis} x1={X0} y1={150} x2={end} y2={150}/>
  {TICKS.map(t => <g key={t.t}>
   <line className={s.axis} x1={x(t.d)} y1={150} x2={x(t.d)} y2={155}/>
   <text className={s.svgTick} x={x(t.d)} y={170} textAnchor={t.d === 1 ? 'start' : t.d === MAX_DAYS ? 'end' : 'middle'}>{t.t}</text>
  </g>)}
  <text className={s.svgNote} x={16} y={198}>Extend adds the chosen lifetime again, capped at 90 days remaining.</text>

  <line className={s.axis} x1={16} y1={218} x2={424} y2={218}/>
  <text className={s.svgTitle} x={16} y={244}>Three layers remove expired rows</text>
  {LAYERS.map((l, i) => {
   const y = 258 + i * 48
   return <g key={l.title}>
    <rect className={s.box} x={16} y={y} width={408} height={40} rx={8}/>
    <rect className={l.where === 'browser' ? s.tagBrowser : s.tag} x={28} y={y + 10} width={64} height={20} rx={10}/>
    <text className={s.tagText} x={60} y={y + 24} textAnchor="middle">{l.where}</text>
    <text className={s.svgTitle} x={106} y={y + 17}>{l.title}</text>
    <text className={s.svgSub} x={106} y={y + 33}>{l.text}</text>
   </g>
  })}
 </svg>
}
