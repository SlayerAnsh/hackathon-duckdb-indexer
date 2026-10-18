import s from './about.module.css'

// Mirrors the README architecture diagram: server stack on the left, the browser's direct RPC lane on the right.
const LANE = [
 { y: 214, label: 'live head' },
 { y: 270, label: 'eth_getLogs' },
 { y: 326, label: 'payload' },
 { y: 382, label: 'verify' },
]

function Box({ x, y, w, h, title, sub, tone }: { x: number; y: number; w: number; h: number; title: string; sub?: string; tone?: 'chain' | 'browser' | 'optional' }) {
 const cls = tone === 'chain' ? s.boxChain : tone === 'browser' ? s.boxBrowser : tone === 'optional' ? s.boxOptional : s.box
 return <g>
  <rect className={cls} x={x} y={y} width={w} height={h} rx={10}/>
  <text className={s.svgTitle} x={x + 16} y={y + (sub ? 22 : h / 2 + 5)}>{title}</text>
  {sub && <text className={s.svgSub} x={x + 16} y={y + 40}>{sub}</text>}
 </g>
}

export function ArchitectureFigure() {
 return <svg className={s.svg} viewBox="0 0 440 636" role="img" aria-labelledby="arch-t arch-d">
  <title id="arch-t">Architecture of Arkiv SQL Indexer</title>
  <desc id="arch-d">The Arkiv RPC on Tiramisu feeds a Bun indexer, which writes a DuckDB checkpoint, Parquet snapshots and a JSON delta. A Next.js proxy serves those files to the browser, which runs DuckDB WASM. The browser also talks to the Arkiv RPC directly, without an API key, for the live head, log tail, payloads and verify. An optional Bun demo writer sends SDK writes to the RPC.</desc>
  <defs>
   <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path className={s.arrowHead} d="M0 0 10 5 0 10z"/></marker>
   <marker id="arch-arrow-lane" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path className={s.arrowHeadLane} d="M0 0 10 5 0 10z"/></marker>
  </defs>

  <Box x={236} y={8} w={188} h={50} title="Demo writer" sub="Bun and SDK, optional" tone="optional"/>
  <line className={s.flow} x1={330} y1={58} x2={330} y2={86} markerEnd="url(#arch-arrow)"/>

  <Box x={16} y={90} w={408} h={58} title="Arkiv RPC on Tiramisu" sub="public endpoint, chain 7738577" tone="chain"/>

  <rect className={s.group} x={8} y={168} width={300} height={360} rx={14}/>
  <text className={s.groupCap} x={296} y={518} textAnchor="end">Docker Compose</text>

  <line className={s.flow} x1={158} y1={148} x2={158} y2={212} markerEnd="url(#arch-arrow)"/>
  <Box x={24} y={214} w={268} h={52} title="Bun indexer" sub="log replay, attribute fill, sweep"/>
  <line className={s.flow} x1={158} y1={266} x2={158} y2={290} markerEnd="url(#arch-arrow)"/>

  <rect className={s.box} x={24} y={292} width={268} height={50} rx={8}/>
  <ellipse className={s.box} cx={158} cy={300} rx={134} ry={8}/>
  <text className={s.svgTitle} x={40} y={329}>DuckDB checkpoint</text>
  <text className={s.svgMono} x={276} y={329} textAnchor="end">index.duckdb</text>

  <line className={s.flow} x1={89} y1={342} x2={89} y2={364} markerEnd="url(#arch-arrow)"/>
  <line className={s.flow} x1={227} y1={342} x2={227} y2={364} markerEnd="url(#arch-arrow)"/>
  <Box x={24} y={366} w={130} h={52} title="Parquet" sub="versioned, keep 2"/>
  <Box x={162} y={366} w={130} h={52} title="JSON delta" sub="per sync batch"/>
  <line className={s.flow} x1={89} y1={418} x2={89} y2={440} markerEnd="url(#arch-arrow)"/>
  <line className={s.flow} x1={227} y1={418} x2={227} y2={440} markerEnd="url(#arch-arrow)"/>
  <Box x={24} y={442} w={268} h={50} title="Next.js proxy" sub="/data with Range requests"/>

  <line className={s.flow} x1={158} y1={492} x2={158} y2={554} markerEnd="url(#arch-arrow)"/>
  <Box x={16} y={556} w={408} h={70} title="Your browser: DuckDB WASM" sub="entities and attributes views, SQL, live tail" tone="browser"/>

  <line className={s.lane} x1={372} y1={556} x2={372} y2={150} markerEnd="url(#arch-arrow-lane)"/>
  <text className={s.laneCap} x={372} y={178} textAnchor="middle">direct, no API key</text>
  {LANE.map(p => <g key={p.label}>
   <rect className={s.pill} x={326} y={p.y - 13} width={92} height={24} rx={12}/>
   <text className={s.pillText} x={372} y={p.y + 3} textAnchor="middle">{p.label}</text>
  </g>)}
 </svg>
}
