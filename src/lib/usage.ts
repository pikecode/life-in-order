import type { Pool } from "pg";
import { currentScenarios } from "../../content/scenarios";
import type { UsageEvent } from "./usage-schema";

export async function migrateUsage(pool:Pick<Pool,"query">) {
  await pool.query(`CREATE TABLE IF NOT EXISTS usage_events (
    id uuid PRIMARY KEY, session_id uuid NOT NULL,
    event_type text NOT NULL CHECK(event_type IN ('search','knowledge_open','knowledge_engaged','action_click')),
    source_commit text NOT NULL REFERENCES source_versions(commit_id),
    path text,entry_number integer,scenario_id text,
    search_mode text,topic text,chapter text,result_count integer,semantic_status text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(source_commit,path,entry_number) REFERENCES knowledge_entries(source_commit,path,entry_number),
    CHECK((event_type='search' AND path IS NULL AND entry_number IS NULL AND result_count>=0 AND search_mode IN ('keyword','hybrid'))
      OR (event_type<>'search' AND path IS NOT NULL AND entry_number IS NOT NULL AND result_count IS NULL AND search_mode IS NULL)),
    CHECK((event_type='action_click')=(scenario_id IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS usage_events_time_idx ON usage_events(created_at);
  CREATE INDEX IF NOT EXISTS usage_events_session_time_idx ON usage_events(session_id,created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS usage_events_read_dedup_idx ON usage_events(
    session_id,event_type,source_commit,path,entry_number,COALESCE(scenario_id,''),
    date_bin(interval '5 minutes',created_at,timestamptz '2000-01-01 00:00:00+00')
  ) WHERE event_type<>'search';`);
}
export async function pruneUsage(pool:Pick<Pool,"query">) {
  return (await pool.query("DELETE FROM usage_events WHERE created_at<now()-interval '30 days'")).rowCount ?? 0;
}
export async function recordUsage(pool:Pick<Pool,"query">, event:UsageEvent) {
  if(event.type==='action_click') {
    const match = await pool.query(`SELECT 1 FROM action_tasks a JOIN content_releases r ON r.version=a.version
      WHERE a.source_commit=$1 AND a.source_path=$2 AND a.source_entry=$3 AND r.scenario->>'id'=$4
      AND r.version=ANY($5::text[]) LIMIT 1`,[event.sourceCommit,event.path,event.entry,event.scenario,currentScenarios.map(s=>s.metadata.version)]);
    if(!match.rowCount) return 'invalid';
  }
  await pruneUsage(pool);
  const search=event.type==='search';
  const result=await pool.query(`INSERT INTO usage_events(id,session_id,event_type,source_commit,path,entry_number,scenario_id,search_mode,topic,chapter,result_count,semantic_status)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 WHERE
      (SELECT count(*) FROM usage_events WHERE session_id=$2 AND created_at>now()-interval '1 hour')<600
    ON CONFLICT DO NOTHING RETURNING id`,[
      event.id,event.sessionId,event.type,event.sourceCommit,search?null:event.path,search?null:event.entry,
      event.type==='action_click'?event.scenario:null,search?event.mode:null,search?event.topic:null,search?event.chapter:null,
      search?event.resultCount:null,search?event.semanticStatus:null,
    ]);
  return result.rowCount ? 'inserted' : 'ignored';
}
