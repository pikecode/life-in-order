import { semanticCandidates } from "./semantic-search";
import { knowledgeTopics, knowledgeSearchTerms, searchPattern } from "./knowledge-search";
import { currentScenarios } from "../../content/scenarios";
import type { ScenarioMetadata } from "../../content/scenarios";
import { db } from "./db";
import type { Task, upstream } from "../../content/moving";
export async function getContent(version: string) {
  const release = await db.query<{
    stages: string[];
    source_commit: string | null;
    scenario: ScenarioMetadata;
  }>(
    "SELECT stages,source_commit,scenario FROM content_releases WHERE version=$1",
    [version],
  );
  if (!release.rows[0]) throw new Error("内容版本尚未导入");
  if (!release.rows[0].scenario) throw new Error("场景配置尚未迁移");
  const tasks = await db.query<{ data: Task }>(
    "SELECT data FROM action_tasks WHERE version=$1 ORDER BY position",
    [version],
  );
  if (!tasks.rows.length) throw new Error("内容任务缺失");
  const source = release.rows[0].source_commit
    ? await db.query<{ metadata: typeof upstream }>(
        "SELECT metadata FROM source_versions WHERE commit_id=$1",
        [release.rows[0].source_commit],
      )
    : null;
  return {
    version,
    scenario: release.rows[0].scenario,
    stages: release.rows[0].stages,
    tasks: tasks.rows.map((row) => row.data),
    upstream: source?.rows[0]?.metadata ?? null,
  };
}

export async function getKnowledge(sourceCommit: string) {
  const entries = await db.query<{
    path: string;
    entry_number: number;
    data: {
      title: string;
      body: string;
      sources: string;
      cost: string;
      benefit: string;
      evidence: string;
      sourceUrls: string[];
    };
  }>(
    "SELECT k.path,k.entry_number,k.data FROM knowledge_entries k WHERE k.source_commit=$1 AND EXISTS (SELECT 1 FROM action_tasks a WHERE a.source_commit=k.source_commit AND a.source_path=k.path AND a.source_entry=k.entry_number) ORDER BY k.path,k.entry_number",
    [sourceCommit],
  );
  return entries.rows;
}

export async function getKnowledgeHighlights(sourceCommit: string) {
  const { rows } = await db.query<{path:string; entry:number; title:string}>(
    "SELECT path,entry_number AS entry,data->>'title' AS title FROM knowledge_entries WHERE source_commit=$1 ORDER BY path,entry_number",
    [sourceCommit],
  );
  return knowledgeTopics.map(topic => {
    const entries=rows.filter(entry=>topic.chapters.includes(entry.path.slice(5,7)));
    const chapterStarts=entries.filter((entry,index)=>entries.findIndex(item=>item.path===entry.path)===index);
    const previews=[...chapterStarts,...entries.filter(entry=>!chapterStarts.includes(entry))].slice(0,2);
    return {...topic,count:entries.length,entries:previews.map(entry=>({
      title:entry.title,chapter:entry.path.slice(5,7),entry:entry.entry,
    }))};
  });
}

export async function getKnowledgeChapters(sourceCommit: string) {
  const result = await db.query<{ path: string; count: number }>(
    "SELECT path,count(*)::int AS count FROM knowledge_entries WHERE source_commit=$1 GROUP BY path ORDER BY path",
    [sourceCommit],
  );
  return result.rows.map(row => ({ id: row.path.slice(5, 7),
    title: row.path.replace(/^book\/\d+-/, "").replace(/\.md$/, ""), count: row.count }));
}

export async function searchKnowledge(
  sourceCommit: string,
  query = "",
  page = 1,
  topicId = "",
  chapterId = "",
  semantic = false,
) {
  const { query: q, terms, words } = knowledgeSearchTerms(query);
  const chapterTopic = knowledgeTopics.find(item => item.chapters.includes(chapterId));
  const chapter = chapterTopic ? chapterId : "";
  const topic = chapterTopic ?? knowledgeTopics.find(item => item.id === topicId);
  const patterns = terms.map(searchPattern);
  const wordPatterns = words.map(searchPattern);
  const lexical = `($2::text[]='{}' OR data->>'title' ILIKE ANY($2::text[]) OR data->>'body' ILIKE ANY($2::text[])
      OR (cardinality($3::text[])>1 AND NOT EXISTS (
        SELECT 1 FROM unnest($3::text[]) word WHERE NOT (((data->>'title') || ' ' || (data->>'body')) ILIKE word))))`;
  const scope = chapter ? [chapter] : topic?.chapters ?? [];
  const semanticResult = semantic && q ? await semanticCandidates(sourceCommit, q, scope) : null;
  const semanticIds = semanticResult?.ids ?? [];
  const filter = `source_commit=$1
    AND (${lexical} OR (path||':'||entry_number)=ANY($5::text[]))
    AND ($4::text[]='{}' OR substring(path from 6 for 2)=ANY($4::text[]))`;
  const parameters = [sourceCommit, patterns, wordPatterns, scope, semanticIds];
  const count = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM knowledge_entries WHERE ${filter}`, parameters,
  );
  const total = count.rows[0].count,
    pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = Math.max(
    1,
    Math.min(Number.isSafeInteger(page) ? page : 1, pages),
  );
  const result = await db.query<{
    path: string;
    entry_number: number;
    semantic_match: boolean;
    lexical_match: boolean;
    scenarios: { id: string; title: string }[];
    data: {
      title: string;
      body: string;
      sources: string;
      cost: string;
      benefit: string;
      evidence: string;
      sourceUrls: string[];
    };
  }>(
    `WITH candidates AS (
      SELECT *,${lexical} AS lexical_match,
        array_position($5::text[],path||':'||entry_number) AS semantic_rank,
        row_number() OVER(ORDER BY (${lexical}) DESC,
          CASE WHEN $8<>'' AND data->>'title' ILIKE $9 THEN 3
            WHEN data->>'title' ILIKE ANY($2::text[]) THEN 2
            WHEN cardinality($3::text[])>1 AND NOT EXISTS (SELECT 1 FROM unnest($3::text[]) word WHERE NOT(data->>'title' ILIKE word)) THEN 1
            ELSE 0 END DESC,path,entry_number) AS keyword_rank
      FROM knowledge_entries WHERE ${filter}
    ) SELECT k.path,k.entry_number,k.data,k.lexical_match,(k.semantic_rank IS NOT NULL) AS semantic_match,
      COALESCE((SELECT jsonb_agg(link ORDER BY link.id) FROM (
        SELECT DISTINCT r.scenario->>'id' AS id,r.scenario->>'title' AS title
        FROM action_tasks a JOIN content_releases r ON r.version=a.version
        WHERE a.source_commit=k.source_commit AND a.source_path=k.path AND a.source_entry=k.entry_number
        AND r.version=ANY($7::text[])
      ) link),'[]'::jsonb) AS scenarios
      FROM candidates k ORDER BY
        ((CASE WHEN lexical_match THEN 1.0/(60+keyword_rank) ELSE 0 END) + COALESCE(1.0/(60+semantic_rank),0)) DESC,
        path,entry_number LIMIT 20 OFFSET $6`,
    [...parameters, (currentPage - 1) * 20,
      currentScenarios.map((scene) => scene.metadata.version), q, searchPattern(q)],
  );
  return { entries: result.rows, total, pages, page: currentPage, query: q, terms: [...new Set([...terms, ...words])], expansions: terms.slice(1), semanticStatus: semanticResult?.status ?? null, chapter, topic: topic?.id ?? "" };
}

export async function getReadingEntry(sourceCommit:string,chapter:string,entry:number) {
  const topic=knowledgeTopics.find(item=>item.chapters.includes(chapter));
  if(!topic||!Number.isSafeInteger(entry)||entry<1||entry>10000)return null;
  type Neighbor={chapter:string;entry:number;title:string};
  type Row={path:string;entry_number:number;data:Awaited<ReturnType<typeof getKnowledge>>[number]["data"];
    previous:Neighbor|null;next:Neighbor|null;position:number;total:number;chapter_position:number;chapter_total:number};
  const result=await db.query<Row>(`
    WITH ordered AS (
      SELECT path,entry_number,
        lag(jsonb_build_object('chapter',substring(path from 6 for 2),'entry',entry_number,'title',data->>'title')) OVER sequence AS previous,
        lead(jsonb_build_object('chapter',substring(path from 6 for 2),'entry',entry_number,'title',data->>'title')) OVER sequence AS next,
        (row_number() OVER sequence)::int AS position,(count(*) OVER())::int AS total,
        (row_number() OVER(PARTITION BY path ORDER BY entry_number))::int AS chapter_position,
        (count(*) OVER(PARTITION BY path))::int AS chapter_total
      FROM knowledge_entries WHERE source_commit=$1 AND substring(path from 6 for 2)=ANY($2::text[])
      WINDOW sequence AS (ORDER BY path,entry_number)
    )
    SELECT o.*,k.data FROM ordered o JOIN knowledge_entries k
      ON k.source_commit=$1 AND k.path=o.path AND k.entry_number=o.entry_number
    WHERE substring(o.path from 6 for 2)=$3 AND o.entry_number=$4
  `,[sourceCommit,topic.chapters,chapter,entry]);
  return result.rows[0]?{...result.rows[0],topic}:null;
}

export async function getReadingBatch(sourceCommit:string,chapter:string,entry:number) {
  const start=await getReadingEntry(sourceCommit,chapter,entry);
  if(!start)return null;
  type Data=NonNullable<typeof start>["data"];
  const {rows}=await db.query<{path:string;entry_number:number;position:number;title:string;data:Data|null}>(`
    WITH ordered AS (
      SELECT path,entry_number,(row_number() OVER(ORDER BY path,entry_number))::int AS position
      FROM knowledge_entries WHERE source_commit=$1 AND substring(path from 6 for 2)=ANY($2::text[])
    )
    SELECT o.*,k.data->>'title' AS title,
      CASE WHEN o.position >= $3 AND o.position < $3+8 THEN k.data ELSE NULL END AS data
    FROM ordered o JOIN knowledge_entries k ON k.source_commit=$1 AND k.path=o.path AND k.entry_number=o.entry_number
    WHERE o.position BETWEEN greatest(1,$3-8) AND $3+8 ORDER BY o.position
  `,[sourceCommit,start.topic.chapters,start.position]);
  const neighbor=(position:number)=>{
    const row=rows.find(item=>item.position===position);
    return row?{chapter:row.path.slice(5,7),entry:row.entry_number,title:row.title}:null;
  };
  return {...start,entries:rows.flatMap(row=>row.data?[{...row,data:row.data}]:[]),
    previous:start.position>1?neighbor(Math.max(1,start.position-8)):null,next:neighbor(start.position+8)};
}
