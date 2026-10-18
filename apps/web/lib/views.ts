export type Widget = { id: string; title: string; subtitle?: string; sql: string; kind: 'stat' | 'area' | 'bar' | 'stacked-bar' | 'donut' | 'table' | 'histogram'; x?: string; y?: string | string[]; series?: string; span?: 1 | 2 | 3; notInArkivQuery?: string; note?: StatNote; timeRange?: Ranged; activeRange?: TimeRange }
/** Context line under a stat value, computed from the `value` and `total` columns. `{n}` is replaced by value/total (share), total/value (ratio) or total. */
export type StatNote = { kind: 'share' | 'ratio' | 'total'; text: string }
/** A time window over the chain and the bucket width, both in blocks of two seconds. */
export type TimeRange = { id: string; label: string; blocks: number; bucket: number; unit: string; span: string }
export const TIME_RANGES: TimeRange[] = [
 {id:'30m',label:'30 min',blocks:900,bucket:30,unit:'minute',span:'30 minutes'},
 {id:'5h',label:'5 h',blocks:9000,bucket:300,unit:'10 min',span:'5 hours'},
 {id:'24h',label:'24 h',blocks:43200,bucket:1800,unit:'hour',span:'24 hours'},
 {id:'7d',label:'7 d',blocks:302400,bucket:10800,unit:'6 hours',span:'7 days'},
 {id:'30d',label:'30 d',blocks:1296000,bucket:43200,unit:'day',span:'30 days'},
]
/** A widget whose SQL, title and subtitle depend on the selected time range. */
export type Ranged = { defaultRange: string; build: (range: TimeRange) => { sql: string; title: string; subtitle: string } }
export type View = { id: string; title: string; description: string; widgets: Widget[] }
const head = '(SELECT block::DOUBLE FROM live_head)'
const labelled = `WITH labelled AS (SELECT e.*, COALESCE(t.value, p.value, CASE WHEN e.attrs_pending THEN 'pending' ELSE 'unlabelled' END) AS label FROM entities e LEFT JOIN attributes t ON t.key=e.key AND t.name='type' LEFT JOIN attributes p ON p.key=e.key AND p.name='project')`
const bucket = `CASE WHEN expires_at::DOUBLE-${head} <= 1800 THEN '0–1 h' WHEN expires_at::DOUBLE-${head} <= 10800 THEN '1–6 h' WHEN expires_at::DOUBLE-${head} <= 43200 THEN '6–24 h' WHEN expires_at::DOUBLE-${head} <= 302400 THEN '1–7 days' ELSE 'Over 7 days' END`
const bucketOrder = `CASE bucket WHEN '0–1 h' THEN 1 WHEN '1–6 h' THEN 2 WHEN '6–24 h' THEN 3 WHEN '1–7 days' THEN 4 ELSE 5 END`
const stat = (id: string,title: string,sql: string,reason?: string,note?: StatNote): Widget => ({id,title,sql,kind:'stat',y:note?['value','total']:'value',notInArkivQuery:reason,note})
const ofLive: StatNote = {kind:'share',text:'{n} of live entities'}
/** Live entities per bucket of `column` over the range, empty buckets as zero, with the head block so the chart can show clock times. */
const bucketed = (column: string, r: TimeRange) => `WITH h AS (SELECT block::BIGINT AS head_block FROM live_head),
counts AS (SELECT floor(${column}/${r.bucket})::BIGINT*${r.bucket} AS block, count(*) AS count FROM entities, h WHERE ${column} >= greatest(0,head_block-${r.blocks}) GROUP BY ALL),
buckets AS (SELECT unnest(range(greatest(0,head_block-${r.blocks})//${r.bucket}*${r.bucket}, head_block+1, ${r.bucket})) AS block, head_block FROM h)
SELECT buckets.block, coalesce(counts.count,0) AS count, buckets.head_block FROM buckets LEFT JOIN counts USING (block) ORDER BY block`
function ranged(base: Omit<Widget,'title'|'sql'|'subtitle'|'timeRange'>, defaultRange: string, build: Ranged['build']): Widget {
 const timeRange = { defaultRange, build }
 const range = TIME_RANGES.find(r => r.id === defaultRange)!
 return { ...base, ...build(range), timeRange, activeRange: range }
}
export const VIEWS: View[] = [
 { id:'overview', title:'Overview', description:'The live dataset at a glance. Every result is computed in this tab.', widgets:[
  stat('live','Live entities',`SELECT count(*) AS value, ${head} AS total FROM entities`,undefined,{kind:'total',text:'at head block {n}'}),
  stat('creators-count','Distinct creators','SELECT count(DISTINCT creator) AS value, count(*) AS total FROM entities','COUNT DISTINCT',{kind:'ratio',text:'{n} entities per creator'}),
  // Known: attributes fetched. The rest are indexed from logs and wait for the newest first fill.
  stat('known','Known entities','SELECT count(*) FILTER (WHERE NOT attrs_pending) AS value, count(*) AS total FROM entities',undefined,ofLive),
  stat('owners-count','Distinct owners','SELECT count(DISTINCT owner) AS value, count(*) AS total FROM entities','COUNT DISTINCT',{kind:'ratio',text:'{n} entities per owner'}),
  stat('expiring','Expiring within 1 hour',`SELECT count(*) FILTER (WHERE expires_at <= ${head}+1800) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  stat('new','Created in the last hour',`SELECT count(*) FILTER (WHERE created_at >= greatest(0,${head}-1800)) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  ranged({id:'creations',kind:'area',x:'block',y:'count',span:2,notInArkivQuery:'GROUP BY'},'24h',r=>({title:`Creations per ${r.unit}`,subtitle:`Last ${r.span} · live entities only`,sql:bucketed('created_at',r)})),
  {id:'types',title:'Entities by type',subtitle:'Type → project → pending or unlabelled',kind:'donut',x:'type',y:'count',notInArkivQuery:'GROUP BY + JOIN',sql:`${labelled}, counts AS (SELECT label, count(*) AS n FROM labelled GROUP BY label), ranked AS (SELECT *, row_number() OVER (ORDER BY n DESC,label) AS rank FROM counts) SELECT CASE WHEN rank <= 7 THEN label ELSE 'Other' END AS type, sum(n) AS count FROM ranked GROUP BY type ORDER BY count DESC,type`},
  {id:'recent',title:'Recently updated entities',kind:'table',span:3,notInArkivQuery:'ORDER BY updated_at',sql:'SELECT key, creator, owner, updated_at, expires_at FROM entities ORDER BY updated_at DESC,key LIMIT 10'},
 ]},
 {id:'expiry',title:'Expiry',description:'Time remaining before live entities disappear. One block is two seconds.',widgets:[
  stat('median','Median remaining lifetime (hours)',`SELECT median((expires_at::DOUBLE-${head})/1800) AS value, count(*) AS total FROM entities`,'MEDIAN',{kind:'total',text:'across {n} live entities'}),
  stat('expiring-day','Expiring within 24 hours',`SELECT count(*) FILTER (WHERE expires_at <= ${head}+43200) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  stat('long-lived','Living longer than 7 days',`SELECT count(*) FILTER (WHERE expires_at > ${head}+302400) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  {id:'horizon',title:'Expiry horizon',kind:'histogram',x:'bucket',y:'count',span:2,notInArkivQuery:'GROUP BY',sql:`SELECT ${bucket} AS bucket, count(*) AS count FROM entities GROUP BY bucket ORDER BY ${bucketOrder}`},
  {id:'expiry-types',title:'Expiry bucket by type',kind:'stacked-bar',x:'bucket',y:'count',series:'type',span:3,notInArkivQuery:'GROUP BY + JOIN',sql:`${labelled} SELECT ${bucket} AS bucket,label AS type,count(*) AS count FROM labelled GROUP BY bucket,label ORDER BY ${bucketOrder},label`},
  {id:'next-expiry',title:'Expiring next',kind:'table',span:3,sql:`SELECT key,owner,expires_at,round((expires_at::DOUBLE-${head})/1800,2) AS hours_remaining FROM entities ORDER BY expires_at,key LIMIT 10`,notInArkivQuery:'ORDER BY + arithmetic'},
 ]},
 {id:'creators',title:'Creators',description:'Creation, ownership and the diversity of indexed entities.',widgets:[
  stat('top-creator-share','Most prolific creator','SELECT max(n) AS value, sum(n) AS total, (SELECT creator FROM entities GROUP BY creator ORDER BY count(*) DESC,creator LIMIT 1) AS address FROM (SELECT count(*) AS n FROM entities GROUP BY creator)','GROUP BY',ofLive),
  stat('transfers','Entities transferred','SELECT count(*) FILTER (WHERE owner <> creator) AS value, count(*) AS total FROM entities',undefined,ofLive),
  stat('single-creators','Creators with one entity','SELECT count(*) FILTER (WHERE n = 1) AS value, count(*) AS total FROM (SELECT count(*) AS n FROM entities GROUP BY creator)','GROUP BY',{kind:'share',text:'{n} of creators'}),
  {id:'top-creators',title:'Top 10 creators',kind:'bar',x:'creator',y:'count',span:2,notInArkivQuery:'GROUP BY',sql:'SELECT creator,count(*) AS count FROM entities GROUP BY creator ORDER BY count DESC,creator LIMIT 10'},
  {id:'creator-filter',title:'Entities by creator',subtitle:'SQL equivalent of a $creator filter, using the most prolific indexed creator.',kind:'table',span:3,notInArkivQuery:'GROUP BY + subquery',sql:'SELECT key,creator,owner,updated_at FROM entities WHERE creator = (SELECT creator FROM entities GROUP BY creator ORDER BY count(*) DESC,creator LIMIT 1) ORDER BY updated_at DESC,key LIMIT 10'},
  {id:'transferred',title:'Creator vs current owner',kind:'table',span:3,sql:'SELECT key,creator,owner FROM entities WHERE owner <> creator ORDER BY updated_at DESC,key LIMIT 20'},
  {id:'creator-types',title:'Creators by distinct types',kind:'table',span:3,notInArkivQuery:'COUNT DISTINCT + JOIN',sql:`${labelled} SELECT creator,count(DISTINCT label) AS types,count(*) AS entities FROM labelled GROUP BY creator ORDER BY types DESC,creator LIMIT 20`},
 ]},
 {id:'attributes',title:'Attributes',description:'Explore the names, types and values actually present in the index.',widgets:[
  {id:'attribute-usage',title:'Attribute usage and value types',kind:'table',span:3,notInArkivQuery:'GROUP BY',sql:'SELECT name,type,count(*) AS count FROM attributes GROUP BY name,type ORDER BY count DESC,name,type'},
  {id:'numeric',title:'Numeric attribute statistics',kind:'table',span:3,notInArkivQuery:'MIN / AVG / MAX',sql:'SELECT name,min(num) AS min,avg(num) AS avg,max(num) AS max FROM attributes WHERE num IS NOT NULL GROUP BY name ORDER BY name'},
  ...['status','priority'].map((name): Widget => ({id:name,title:`Top ${name} values`,kind:'bar',x:'value',y:'count',notInArkivQuery:'GROUP BY',sql:`SELECT value,count(*) AS count FROM attributes WHERE name='${name}' GROUP BY value ORDER BY count DESC,value LIMIT 10`}))
 ]},
 {id:'activity',title:'Activity',description:'Current entity state, grouped by block. This is not historical event storage.',widgets:[
  ranged({id:'updates',kind:'histogram',span:2,x:'block',y:'count',notInArkivQuery:'GROUP BY'},'5h',r=>({title:`Updates per ${r.unit}`,subtitle:`Last ${r.span} · current state of live entities`,sql:bucketed('updated_at',r)})),
  {id:'modified',title:'Create vs update',kind:'donut',x:'state',y:'count',notInArkivQuery:'GROUP BY',sql:"SELECT CASE WHEN created_at=updated_at THEN 'Never modified' ELSE 'Updated' END AS state,count(*) AS count FROM entities GROUP BY state"},
  {id:'running',title:'Running count of creations',kind:'area',span:3,x:'created_at',y:'running_count',notInArkivQuery:'window function',sql:'SELECT created_at,sum(count(*)) OVER (ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_count FROM entities GROUP BY created_at ORDER BY created_at'},
 ]},
]
export const DEFAULT_SQL = `WITH tickets AS (
 SELECT e.key, e.updated_at, e.expires_at,
  max(CASE WHEN a.name='title' THEN a.value END) AS title,
  max(CASE WHEN a.name='priority' THEN a.num END) AS priority
 FROM entities e JOIN attributes t ON t.key=e.key AND t.name='type' AND t.value='ticket'
 JOIN attributes s ON s.key=e.key AND s.name='status' AND s.value='open'
 LEFT JOIN attributes a ON a.key=e.key
 GROUP BY e.key,e.updated_at,e.expires_at
), comments AS (
 SELECT parent.value AS ticket, count(*) AS comments, max(e.updated_at) AS last_comment_block
 FROM entities e JOIN attributes t ON t.key=e.key AND t.name='type' AND t.value='comment'
 JOIN attributes parent ON parent.key=e.key AND parent.name='ticket'
 GROUP BY parent.value
)
SELECT tickets.*,coalesce(comments.comments,0) AS comments,last_comment_block
FROM tickets LEFT JOIN comments ON comments.ticket=tickets.key
ORDER BY comments DESC,priority,key`

/** The selected range of a ranged widget, falling back to its default; undefined for other widgets. */
export function rangeOf(widget: Widget, id?: string | null): TimeRange | undefined {
 if (!widget.timeRange) return undefined
 return TIME_RANGES.find(r => r.id === id) ?? TIME_RANGES.find(r => r.id === widget.timeRange!.defaultRange)
}
/** The widget as shown for a range: SQL, title and subtitle follow the range. Other widgets come back unchanged. */
export function resolveWidget(widget: Widget, id?: string | null): Widget {
 const range = rangeOf(widget, id)
 return range ? { ...widget, ...widget.timeRange!.build(range), activeRange: range } : widget
}
export const widgetSql = (widget: Widget, id?: string | null) => resolveWidget(widget, id).sql

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const two = (n: number) => String(n).padStart(2, '0')
/** Approximate local clock time of a bucket starting at `block`, from the head block and two second blocks. */
export function bucketTimeLabel(block: number, head: number, range: TimeRange, now = Date.now()): string {
 const d = new Date(now + (block - head) * 2000)
 const time = `${two(d.getHours())}:${two(d.getMinutes())}`
 if (range.bucket < 3600) return time
 const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`
 return range.bucket < 43200 ? `${date} ${time}` : date
}
