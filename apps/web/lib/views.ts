import type { NumberFormat } from './dash/schema'
export type Widget = { id: string; title: string; subtitle?: string; sql: string; stacking?: 'off' | 'stack' | 'percent'; numberFormat?: NumberFormat; colors?: Record<string, string>; legend?: boolean; labels?: boolean; xTitle?: string; yTitle?: string; kind: 'line' | 'stat' | 'area' | 'bar' | 'stacked-bar' | 'donut' | 'table' | 'histogram'; x?: string; y?: string | string[]; series?: string; binned?: boolean; span?: 1 | 2 | 3; notInArkivQuery?: string; note?: StatNote; /** Thumbnail rendering (dashboard covers): no axes, key, legend or labels. */ compact?: boolean }
/** Context line under a stat value, computed from the `value` and `total` columns. `{n}` is replaced by value/total (share), total/value (ratio) or total. */
export type StatNote = { kind: 'share' | 'ratio' | 'total'; text: string }
export type View = { id: string; title: string; description: string; widgets: Widget[] }
export const HEAD_SQL = '(SELECT block::DOUBLE FROM live_head)'
export const LABELLED_CTE = `WITH labelled AS (SELECT e.*, COALESCE(t.value, p.value, CASE WHEN e.attrs_pending THEN 'pending' ELSE 'unlabelled' END) AS label FROM entities e LEFT JOIN attributes t ON t.key=e.key AND t.name='type' LEFT JOIN attributes p ON p.key=e.key AND p.name='project')`
export const EXPIRY_BUCKET = `CASE WHEN expires_at::DOUBLE-${HEAD_SQL} <= 1800 THEN '0–1 h' WHEN expires_at::DOUBLE-${HEAD_SQL} <= 10800 THEN '1–6 h' WHEN expires_at::DOUBLE-${HEAD_SQL} <= 43200 THEN '6–24 h' WHEN expires_at::DOUBLE-${HEAD_SQL} <= 302400 THEN '1–7 days' ELSE 'Over 7 days' END`
export const EXPIRY_BUCKET_ORDER = `CASE bucket WHEN '0–1 h' THEN 1 WHEN '1–6 h' THEN 2 WHEN '6–24 h' THEN 3 WHEN '1–7 days' THEN 4 ELSE 5 END`
const stat = (id: string,title: string,sql: string,reason?: string,note?: StatNote): Widget => ({id,title,sql,kind:'stat',y:note?['value','total']:'value',notInArkivQuery:reason,note})
const ofLive: StatNote = {kind:'share',text:'{n} of live entities'}
/** Live entities per fixed window, with empty buckets and labels relative to the head. */
export const bucketedSql = (column: 'created_at' | 'updated_at', blocks: number, bucket: 1800 | 300): string => `WITH h AS (SELECT block::BIGINT AS head_block FROM live_head),
counts AS (SELECT floor(${column}/${bucket})::BIGINT*${bucket} AS block, count(*) AS count FROM entities, h WHERE ${column} >= greatest(0,head_block-${blocks}) GROUP BY ALL),
buckets AS (SELECT unnest(range(greatest(0,head_block-${blocks})//${bucket}*${bucket}, head_block+1, ${bucket})) AS block, head_block FROM h)
SELECT CASE WHEN buckets.block = head_block//${bucket}*${bucket} THEN 'now' ELSE '-' || CAST((head_block//${bucket} - buckets.block//${bucket}) * ${bucket === 1800 ? 1 : 10} AS VARCHAR) || '${bucket === 1800 ? 'h' : 'm'}' END AS label, coalesce(counts.count,0) AS count FROM buckets LEFT JOIN counts USING (block) ORDER BY buckets.block`
export const VIEWS: View[] = [
 { id:'overview', title:'Overview', description:'The live dataset at a glance. Every result is computed in this tab.', widgets:[
  stat('live','Live entities',`SELECT count(*) AS value, ${HEAD_SQL} AS total FROM entities`,undefined,{kind:'total',text:'at head block {n}'}),
  stat('creators-count','Distinct creators','SELECT count(DISTINCT creator) AS value, count(*) AS total FROM entities','COUNT DISTINCT',{kind:'ratio',text:'{n} entities per creator'}),
  // Known: attributes fetched. The rest are indexed from logs and wait for the newest first fill.
  stat('known','Known entities','SELECT count(*) FILTER (WHERE NOT attrs_pending) AS value, count(*) AS total FROM entities',undefined,ofLive),
  stat('owners-count','Distinct owners','SELECT count(DISTINCT owner) AS value, count(*) AS total FROM entities','COUNT DISTINCT',{kind:'ratio',text:'{n} entities per owner'}),
  stat('expiring','Expiring within 1 hour',`SELECT count(*) FILTER (WHERE expires_at <= ${HEAD_SQL}+1800) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  stat('new','Created in the last hour',`SELECT count(*) FILTER (WHERE created_at >= greatest(0,${HEAD_SQL}-1800)) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  {id:'creations',kind:'area',x:'label',y:'count',span:2,notInArkivQuery:'GROUP BY',title:'Creations per hour',subtitle:'Last 24 hours · live entities only',sql:bucketedSql('created_at',43200,1800)},
  {id:'types',title:'Entities by type',subtitle:'Type → project → pending or unlabelled',kind:'donut',x:'type',y:'count',notInArkivQuery:'GROUP BY + JOIN',sql:`${LABELLED_CTE}, counts AS (SELECT label, count(*) AS n FROM labelled GROUP BY label), ranked AS (SELECT *, row_number() OVER (ORDER BY n DESC,label) AS rank FROM counts) SELECT CASE WHEN rank <= 7 THEN label ELSE 'Other' END AS type, sum(n) AS count FROM ranked GROUP BY type ORDER BY count DESC,type`},
  {id:'recent',title:'Recently updated entities',kind:'table',span:3,notInArkivQuery:'ORDER BY updated_at',sql:'SELECT key, creator, owner, updated_at, expires_at FROM entities ORDER BY updated_at DESC,key LIMIT 10'},
 ]},
 {id:'expiry',title:'Expiry',description:'Time remaining before live entities disappear. One block is two seconds.',widgets:[
  stat('median','Median remaining lifetime (hours)',`SELECT median((expires_at::DOUBLE-${HEAD_SQL})/1800) AS value, count(*) AS total FROM entities`,'MEDIAN',{kind:'total',text:'across {n} live entities'}),
  stat('expiring-day','Expiring within 24 hours',`SELECT count(*) FILTER (WHERE expires_at <= ${HEAD_SQL}+43200) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  stat('long-lived','Living longer than 7 days',`SELECT count(*) FILTER (WHERE expires_at > ${HEAD_SQL}+302400) AS value, count(*) AS total FROM entities`,undefined,ofLive),
  {id:'horizon',title:'Expiry horizon',kind:'histogram',x:'bucket',y:'count',span:2,notInArkivQuery:'GROUP BY',sql:`SELECT ${EXPIRY_BUCKET} AS bucket, count(*) AS count FROM entities GROUP BY bucket ORDER BY ${EXPIRY_BUCKET_ORDER}`},
  {id:'expiry-types',title:'Expiry bucket by type',kind:'stacked-bar',x:'bucket',y:'count',series:'type',span:3,notInArkivQuery:'GROUP BY + JOIN',sql:`${LABELLED_CTE} SELECT ${EXPIRY_BUCKET} AS bucket,label AS type,count(*) AS count FROM labelled GROUP BY bucket,label ORDER BY ${EXPIRY_BUCKET_ORDER},label`},
  {id:'next-expiry',title:'Expiring next',kind:'table',span:3,sql:`SELECT key,owner,expires_at,round((expires_at::DOUBLE-${HEAD_SQL})/1800,2) AS hours_remaining FROM entities ORDER BY expires_at,key LIMIT 10`,notInArkivQuery:'ORDER BY + arithmetic'},
 ]},
 {id:'creators',title:'Creators',description:'Creation, ownership and the diversity of indexed entities.',widgets:[
  stat('top-creator-share','Most prolific creator','SELECT max(n) AS value, sum(n) AS total, (SELECT creator FROM entities GROUP BY creator ORDER BY count(*) DESC,creator LIMIT 1) AS address FROM (SELECT count(*) AS n FROM entities GROUP BY creator)','GROUP BY',ofLive),
  stat('transfers','Entities transferred','SELECT count(*) FILTER (WHERE owner <> creator) AS value, count(*) AS total FROM entities',undefined,ofLive),
  stat('single-creators','Creators with one entity','SELECT count(*) FILTER (WHERE n = 1) AS value, count(*) AS total FROM (SELECT count(*) AS n FROM entities GROUP BY creator)','GROUP BY',{kind:'share',text:'{n} of creators'}),
  {id:'top-creators',title:'Top 10 creators',kind:'bar',x:'creator',y:'count',span:2,notInArkivQuery:'GROUP BY',sql:'SELECT creator,count(*) AS count FROM entities GROUP BY creator ORDER BY count DESC,creator LIMIT 10'},
  {id:'creator-filter',title:'Entities by creator',subtitle:'SQL equivalent of a $creator filter, using the most prolific indexed creator.',kind:'table',span:3,notInArkivQuery:'GROUP BY + subquery',sql:'SELECT key,creator,owner,updated_at FROM entities WHERE creator = (SELECT creator FROM entities GROUP BY creator ORDER BY count(*) DESC,creator LIMIT 1) ORDER BY updated_at DESC,key LIMIT 10'},
  {id:'transferred',title:'Creator vs current owner',kind:'table',span:3,sql:'SELECT key,creator,owner FROM entities WHERE owner <> creator ORDER BY updated_at DESC,key LIMIT 20'},
  {id:'creator-types',title:'Creators by distinct types',kind:'table',span:3,notInArkivQuery:'COUNT DISTINCT + JOIN',sql:`${LABELLED_CTE} SELECT creator,count(DISTINCT label) AS types,count(*) AS entities FROM labelled GROUP BY creator ORDER BY types DESC,creator LIMIT 20`},
 ]},
 {id:'attributes',title:'Attributes',description:'Explore the names, types and values actually present in the index.',widgets:[
  {id:'attribute-usage',title:'Attribute usage and value types',kind:'table',span:3,notInArkivQuery:'GROUP BY',sql:'SELECT name,type,count(*) AS count FROM attributes GROUP BY name,type ORDER BY count DESC,name,type'},
  {id:'numeric',title:'Numeric attribute statistics',kind:'table',span:3,notInArkivQuery:'MIN / AVG / MAX',sql:'SELECT name,min(num) AS min,avg(num) AS avg,max(num) AS max FROM attributes WHERE num IS NOT NULL GROUP BY name ORDER BY name'},
  ...['status','priority'].map((name): Widget => ({id:name,title:`Top ${name} values`,kind:'bar',x:'value',y:'count',notInArkivQuery:'GROUP BY',sql:`SELECT value,count(*) AS count FROM attributes WHERE name='${name}' GROUP BY value ORDER BY count DESC,value LIMIT 10`}))
 ]},
 {id:'activity',title:'Activity',description:'Current entity state, grouped by block. This is not historical event storage.',widgets:[
  {id:'updates',kind:'histogram',span:2,x:'label',y:'count',notInArkivQuery:'GROUP BY',title:'Updates per 10 min',subtitle:'Last 5 hours · current state of live entities',sql:bucketedSql('updated_at',9000,300)},
  {id:'modified',title:'Create vs update',kind:'donut',x:'state',y:'count',notInArkivQuery:'GROUP BY',sql:"SELECT CASE WHEN created_at=updated_at THEN 'Never modified' ELSE 'Updated' END AS state,count(*) AS count FROM entities GROUP BY state"},
  {id:'running',title:'Running count of creations',kind:'area',span:3,x:'created_at',y:'running_count',notInArkivQuery:'window function',sql:'SELECT created_at,sum(count(*)) OVER (ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_count FROM entities GROUP BY created_at ORDER BY created_at'},
 ]},
]
export const DEFAULT_SQL = `WITH dash AS (
 SELECT e.key, e.creator, e.expires_at,
  max(a.value) FILTER (WHERE a.name = 'type') AS type,
  max(a.value) FILTER (WHERE a.name = 'name') AS name,
  max(a.value) FILTER (WHERE a.name = 'chart') AS chart,
  max(a.value) FILTER (WHERE a.name = 'widget') AS widget,
  max(a.value) FILTER (WHERE a.name = 'dashboard') AS dashboard
 FROM entities e JOIN attributes a ON a.key = e.key
 GROUP BY e.key, e.creator, e.expires_at
 HAVING max(a.value) FILTER (WHERE a.name = 'project') = 'arkiv-sql-indexer-dash'
), placements AS (
 SELECT creator, widget, count(DISTINCT dashboard) AS dashboards
 FROM dash WHERE type = 'link'
 GROUP BY creator, widget
)
SELECT w.key, w.name, w.chart, coalesce(p.dashboards, 0) AS dashboards, w.expires_at
FROM dash w LEFT JOIN placements p ON p.widget = w.key AND p.creator = w.creator
WHERE w.type = 'widget'
ORDER BY dashboards DESC, w.key
LIMIT 20`

