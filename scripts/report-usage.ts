import "dotenv/config";
import { db } from "../src/lib/db";
import { pruneUsage } from "../src/lib/usage";
try {
  const days=Number(process.argv[2] ?? 7);
  if(!Number.isInteger(days)||days<1||days>30) throw new Error("统计天数需为 1–30 的整数");
  const removed=await pruneUsage(db);
  const events=await db.query(`SELECT event_type,count(*)::int AS events,count(DISTINCT session_id)::int AS sessions
    FROM usage_events WHERE created_at>=now()-$1*interval '1 day' GROUP BY event_type ORDER BY event_type`,[days]);
  const searches=await db.query(`SELECT search_mode,COALESCE(NULLIF(chapter,''),NULLIF(topic,''),'all') AS scope,
    count(*)::int AS searches,count(*) FILTER(WHERE result_count=0)::int AS zero_results
    FROM usage_events WHERE event_type='search' AND created_at>=now()-$1*interval '1 day'
    GROUP BY search_mode,scope ORDER BY searches DESC`,[days]);
  const hot=await db.query(`SELECT e.source_commit,e.path,e.entry_number,k.data->>'title' AS title,
    count(*) FILTER(WHERE event_type='knowledge_open')::int AS opens,
    count(*) FILTER(WHERE event_type='knowledge_engaged')::int AS engaged,
    count(*) FILTER(WHERE event_type='action_click')::int AS action_clicks
    FROM usage_events e JOIN knowledge_entries k ON k.source_commit=e.source_commit AND k.path=e.path AND k.entry_number=e.entry_number
    WHERE e.created_at>=now()-$1*interval '1 day' GROUP BY e.source_commit,e.path,e.entry_number,k.data->>'title'
    ORDER BY opens DESC,engaged DESC,e.path,e.entry_number LIMIT 10`,[days]);
  const conversion=await db.query<{opened:number;converted:number}>(`WITH opened AS(
    SELECT session_id,source_commit,path,entry_number,min(created_at) AS first_open FROM usage_events
    WHERE event_type='knowledge_open' AND created_at>=now()-$1*interval '1 day' GROUP BY session_id,source_commit,path,entry_number)
    SELECT count(*)::int AS opened,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM usage_events a
      WHERE a.event_type='action_click' AND a.session_id=o.session_id AND a.source_commit=o.source_commit
      AND a.path=o.path AND a.entry_number=o.entry_number AND a.created_at>=o.first_open))::int AS converted FROM opened o`,[days]);
  const total=searches.rows.reduce((sum,row)=>sum+row.searches,0);
  const zero=searches.rows.reduce((sum,row)=>sum+row.zero_results,0);
  const pairs=conversion.rows[0];
  console.log(JSON.stringify({天数:days,清理过期记录:removed,事件汇总:events.rows,搜索汇总:searches.rows,
    零结果占比:total?Number((zero/total).toFixed(4)):null,热门知识:hot.rows,
    阅读知识会话对:pairs.opened,进入行动的知识会话对:pairs.converted,
    阅读后进入行动比例:pairs.opened?Number((pairs.converted/pairs.opened).toFixed(4)):null,
    口径:'仅已返回结果的表单搜索；阅读等按五分钟桶去重；会话不等于用户，有效停留不代表读懂。'},null,2));
} finally { await db.end(); }
