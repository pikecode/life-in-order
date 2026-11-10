import type { Pool } from "pg";
import { db } from "./db";
import { embeddingConfig, embedTexts, embeddingText, contentHash } from "./embeddings";

type Config = NonNullable<ReturnType<typeof embeddingConfig>>;
export async function buildEmbeddingIndex(pool: Pool, config: Config, sourceCommit: string) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [config.id]);
    const entries = await client.query<{source_commit:string; path:string; entry_number:number; data:{title:string;body:string}; content_hash:string|null}>(
      `SELECT k.*,e.content_hash FROM knowledge_entries k LEFT JOIN knowledge_embeddings e
       ON e.source_commit=k.source_commit AND e.path=k.path AND e.entry_number=k.entry_number AND e.model_id=$1
       WHERE k.source_commit=$2 ORDER BY k.source_commit,k.path,k.entry_number`, [config.id,sourceCommit]);
    let inserted = 0;
    const pending = entries.rows.map(entry => ({...entry, text:embeddingText(entry.data)}))
      .filter(entry => entry.content_hash !== contentHash(entry.text));
    for (let offset=0; offset<pending.length; offset+=8) {
      const batch = pending.slice(offset, offset+8);
      const vectors = await embedTexts(batch.map(entry => entry.text), config, 120000);
      await client.query('BEGIN');
      try {
        for (let i=0;i<batch.length;i++) {
          const entry = batch[i];
          await client.query(`INSERT INTO knowledge_embeddings(source_commit,path,entry_number,model_id,content_hash,embedding)
            VALUES($1,$2,$3,$4,$5,$6::vector) ON CONFLICT(source_commit,path,entry_number,model_id)
            DO UPDATE SET content_hash=excluded.content_hash,embedding=excluded.embedding,created_at=now()`,
            [entry.source_commit,entry.path,entry.entry_number,config.id,contentHash(entry.text),JSON.stringify(vectors[i])]);
        }
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; }
      inserted += batch.length;
      console.log(`知识向量 ${offset+batch.length}/${pending.length}`);
    }
    return {total:entries.rows.length, inserted};
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [config.id]); }
    finally { client.release(); }
  }
}

export type SemanticResult = { ids:string[]; status:'ready'|'disabled'|'unavailable'|'incomplete' };
export async function semanticCandidates(sourceCommit:string, query:string, chapters:string[]): Promise<SemanticResult> {
  try {
    const config = embeddingConfig();
    if (!config) return {ids:[],status:'disabled'};
    const coverage = await db.query<{total:number;indexed:number;min_dim:number;max_dim:number}>(`SELECT count(*)::int AS total,count(e.entry_number)::int AS indexed,min(vector_dims(e.embedding)) AS min_dim,max(vector_dims(e.embedding)) AS max_dim
      FROM knowledge_entries k LEFT JOIN knowledge_embeddings e ON e.source_commit=k.source_commit AND e.path=k.path
      AND e.entry_number=k.entry_number AND e.model_id=$2 WHERE k.source_commit=$1`, [sourceCommit,config.id]);
    if (!coverage.rows[0].total || coverage.rows[0].total !== coverage.rows[0].indexed)
      return {ids:[],status:'incomplete'};
    const [vector] = await embedTexts([query], config);
    if (coverage.rows[0].min_dim !== vector.length || coverage.rows[0].max_dim !== vector.length)
      return {ids:[],status:'unavailable'};
    // shortcut: 当前 772 条使用精确检索；语料增大后再测量并增加近似索引。
    const result = await db.query<{id:string}>(`SELECT path||':'||entry_number AS id FROM knowledge_embeddings
      WHERE source_commit=$1 AND model_id=$2 AND vector_dims(embedding)=$3
      AND ($4::text[]='{}' OR substring(path from 6 for 2)=ANY($4::text[]))
      AND (embedding <=> $5::vector)<=0.45
      ORDER BY embedding <=> $5::vector,path,entry_number LIMIT 40`,
      [sourceCommit,config.id,vector.length,chapters,JSON.stringify(vector)]);
    return {ids:result.rows.map(row=>row.id),status:'ready'};
  } catch {
    // 不记录用户输入或模型响应；保持原有关键词检索可用。
    return {ids:[],status:'unavailable'};
  }
}
