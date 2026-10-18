export type Widget = { id: string; title: string; subtitle?: string; sql: string; kind: 'stat' | 'area' | 'bar' | 'stacked-bar' | 'donut' | 'table' | 'histogram'; x?: string; y?: string | string[]; series?: string; span?: 1 | 2 | 3; notInArkivQuery?: string }
export type View = { id: string; title: string; description: string; widgets: Widget[] }
const head = '(SELECT block::DOUBLE FROM live_head)'
const labelled = `WITH labelled AS (SELECT e.*, COALESCE(t.value, p.value, 'unlabelled') AS label FROM entities e LEFT JOIN attributes t ON t.key=e.key AND t.name='type' LEFT JOIN attributes p ON p.key=e.key AND p.name='project')`
const bucket = `CASE WHEN expires_at::DOUBLE-${head} <= 1800 THEN '0–1 h' WHEN expires_at::DOUBLE-${head} <= 10800 THEN '1–6 h' WHEN expires_at::DOUBLE-${head} <= 43200 THEN '6–24 h' WHEN expires_at::DOUBLE-${head} <= 302400 THEN '1–7 days' ELSE 'Over 7 days' END`
const bucketOrder = `CASE bucket WHEN '0–1 h' THEN 1 WHEN '1–6 h' THEN 2 WHEN '6–24 h' THEN 3 WHEN '1–7 days' THEN 4 ELSE 5 END`
const stat = (id: string,title: string,sql: string,reason?: string): Widget => ({id,title,sql,kind:'stat',y:'value',notInArkivQuery:reason})
export const VIEWS: View[] = [
 { id:'overview', title:'Overview', description:'The live dataset at a glance. Every result is computed in this tab.', widgets:[
  stat('live','Live entities','SELECT count(*) AS value FROM entities'),
  stat('creators-count','Distinct creators','SELECT count(DISTINCT creator) AS value FROM entities','COUNT DISTINCT'),
  stat('ownership-transfers','Ownership transfers','SELECT count(*) AS value FROM entities WHERE owner <> creator'),
  stat('owners-count','Distinct owners','SELECT count(DISTINCT owner) AS value FROM entities','COUNT DISTINCT'),
  stat('expiring','Expiring within 1 hour',`SELECT count(*) AS value FROM entities WHERE expires_at <= ${head}+1800`),
  stat('new','Created in the last hour',`SELECT count(*) AS value FROM entities WHERE created_at >= greatest(0,${head}-1800)`),
  {id:'creations',title:'Creations per hour',subtitle:'Last 24 hours · live entities only',kind:'area',x:'hour',y:'count',span:2,notInArkivQuery:'GROUP BY',sql:`SELECT floor(created_at/1800.0) AS hour, count(*) AS count FROM entities WHERE created_at >= greatest(0,${head}-43200) GROUP BY hour ORDER BY hour`},
  {id:'types',title:'Entities by type',subtitle:'Type → project → unlabelled',kind:'donut',x:'type',y:'count',notInArkivQuery:'GROUP BY + JOIN',sql:`${labelled}, counts AS (SELECT label, count(*) AS n FROM labelled GROUP BY label), ranked AS (SELECT *, row_number() OVER (ORDER BY n DESC,label) AS rank FROM counts) SELECT CASE WHEN rank <= 7 THEN label ELSE 'Other' END AS type, sum(n) AS count FROM ranked GROUP BY type ORDER BY count DESC,type`},
  {id:'recent',title:'Recently updated entities',kind:'table',span:3,notInArkivQuery:'ORDER BY updated_at',sql:'SELECT key, creator, owner, updated_at, expires_at FROM entities ORDER BY updated_at DESC,key LIMIT 10'},
 ]},
 {id:'expiry',title:'Expiry',description:'Time remaining before live entities disappear. One block is two seconds.',widgets:[
  {id:'horizon',title:'Expiry horizon',kind:'histogram',x:'bucket',y:'count',span:2,notInArkivQuery:'GROUP BY',sql:`SELECT ${bucket} AS bucket, count(*) AS count FROM entities GROUP BY bucket ORDER BY ${bucketOrder}`},
  stat('median','Median remaining lifetime (hours)',`SELECT median((expires_at::DOUBLE-${head})/1800) AS value FROM entities`,'MEDIAN'),
  {id:'expiry-types',title:'Expiry bucket by type',kind:'stacked-bar',x:'bucket',y:'count',series:'type',span:3,notInArkivQuery:'GROUP BY + JOIN',sql:`${labelled} SELECT ${bucket} AS bucket,label AS type,count(*) AS count FROM labelled GROUP BY bucket,label ORDER BY ${bucketOrder},label`},
  {id:'next-expiry',title:'Expiring next',kind:'table',span:3,sql:`SELECT key,owner,expires_at,round((expires_at::DOUBLE-${head})/1800,2) AS hours_remaining FROM entities ORDER BY expires_at,key LIMIT 10`,notInArkivQuery:'ORDER BY + arithmetic'},
 ]},
 {id:'creators',title:'Creators',description:'Creation, ownership and the diversity of indexed entities.',widgets:[
  {id:'top-creators',title:'Top 10 creators',kind:'bar',x:'creator',y:'count',span:2,notInArkivQuery:'GROUP BY',sql:'SELECT creator,count(*) AS count FROM entities GROUP BY creator ORDER BY count DESC,creator LIMIT 10'},
  stat('transfers','Entities transferred','SELECT count(*) AS value FROM entities WHERE owner <> creator'),
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
  {id:'updates',title:'Updates per 100 blocks',subtitle:'Last 3,000 blocks',kind:'histogram',span:2,x:'block',y:'count',notInArkivQuery:'GROUP BY',sql:`SELECT floor(updated_at/100.0)*100 AS block,count(*) AS count FROM entities WHERE updated_at >= greatest(0,${head}-3000) GROUP BY block ORDER BY block`},
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
