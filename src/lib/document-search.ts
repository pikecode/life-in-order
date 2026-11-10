import type { Pool } from "pg";
import { db } from "./db";
import { embeddingConfig,embedTexts } from "./embeddings";
export async function migrateDocumentEmbeddings(pool:Pick<Pool,"query">) {
  await pool.query(`CREATE TABLE IF NOT EXISTS document_embeddings(
    source_commit text NOT NULL,path text NOT NULL,chunk_number integer NOT NULL,model_id text NOT NULL,content_hash text NOT NULL,
    embedding vector NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(source_commit,path,chunk_number,model_id),
    FOREIGN KEY(source_commit,path,chunk_number) REFERENCES document_chunks(source_commit,path,chunk_number),CHECK(vector_dims(embedding)>0)
  );`);
}
export async function buildDocumentEmbeddings(pool:Pool,config:NonNullable<ReturnType<typeof embeddingConfig>>,sourceCommit:string) {
  const client=await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))",["documents:"+config.id]);
    const {rows}=await client.query<{path:string;chunk_number:number;text:string;content_hash:string}>(`SELECT c.path,c.chunk_number,c.text,c.content_hash
      FROM document_chunks c JOIN source_documents d ON d.source_commit=c.source_commit AND d.path=c.path
      LEFT JOIN document_embeddings e ON e.source_commit=c.source_commit AND e.path=c.path AND e.chunk_number=c.chunk_number AND e.model_id=$2
      WHERE c.source_commit=$1 AND e.content_hash IS DISTINCT FROM c.content_hash ORDER BY (d.kind='article') DESC,c.path,c.chunk_number`,[sourceCommit,config.id]);
    for(let offset=0;offset<rows.length;offset+=8) {
      const batch=rows.slice(offset,offset+8),vectors=await embedTexts(batch.map(row=>row.text),config,120000);
      await client.query('BEGIN');
      try {
        for(let i=0;i<batch.length;i++)await client.query(`INSERT INTO document_embeddings(source_commit,path,chunk_number,model_id,content_hash,embedding)
          VALUES($1,$2,$3,$4,$5,$6::vector) ON CONFLICT(source_commit,path,chunk_number,model_id)
          DO UPDATE SET content_hash=excluded.content_hash,embedding=excluded.embedding,created_at=now()`,[sourceCommit,batch[i].path,batch[i].chunk_number,config.id,batch[i].content_hash,JSON.stringify(vectors[i])]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}
      console.log(`文档向量 ${Math.min(offset+8,rows.length)}/${rows.length}`);
    }
    return {inserted:rows.length};
  }finally{try{await client.query("SELECT pg_advisory_unlock(hashtext($1))",["documents:"+config.id]);}finally{client.release();}}
}
export async function documentCandidates(sourceCommit:string,query:string,kind:string,topic:string) {
  try {
    const config=embeddingConfig();if(!config)return {matches:[] as {path:string;text:string}[],status:'disabled' as const};
    const coverage=await db.query<{total:number;indexed:number;min_dim:number;max_dim:number}>(`SELECT count(*)::int AS total,count(e.embedding)::int AS indexed,min(vector_dims(e.embedding)) AS min_dim,max(vector_dims(e.embedding)) AS max_dim
      FROM document_chunks c JOIN source_documents d ON d.source_commit=c.source_commit AND d.path=c.path
      LEFT JOIN document_embeddings e ON e.source_commit=c.source_commit AND e.path=c.path AND e.chunk_number=c.chunk_number AND e.model_id=$2 AND e.content_hash=c.content_hash
      WHERE c.source_commit=$1 AND ($3='' OR d.kind=$3) AND ($4='' OR $4=ANY(d.topics))`,[sourceCommit,config.id,kind,topic]);
    const row=coverage.rows[0];if(!row.total||row.total!==row.indexed)return {matches:[],status:'incomplete' as const};
    const [vector]=await embedTexts([query],config);
    if(row.min_dim!==vector.length||row.max_dim!==vector.length)return {matches:[],status:'unavailable' as const};
    const {rows}=await db.query<{path:string;text:string}>(`SELECT path,text FROM (
      SELECT DISTINCT ON(e.path) e.path,c.text,(e.embedding <=> $3::vector) AS distance FROM document_embeddings e
      JOIN document_chunks c USING(source_commit,path,chunk_number) JOIN source_documents d USING(source_commit,path)
      WHERE e.source_commit=$1 AND e.model_id=$2 AND e.content_hash=c.content_hash AND vector_dims(e.embedding)=$4
      AND ($5='' OR d.kind=$5) AND ($6='' OR $6=ANY(d.topics)) AND (e.embedding <=> $3::vector)<=0.45
      ORDER BY e.path,e.embedding <=> $3::vector
    ) hits ORDER BY distance,path LIMIT 40`,[sourceCommit,config.id,JSON.stringify(vector),vector.length,kind,topic]);
    return {matches:rows,status:'ready' as const};
  }catch{return {matches:[],status:'unavailable' as const};}
}
