import "dotenv/config";
import { migrateDocumentEmbeddings } from "../src/lib/document-search";
import { db } from "../src/lib/db";
try {
  await db.query("CREATE EXTENSION IF NOT EXISTS vector");
  await db.query(`CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    source_commit text NOT NULL, path text NOT NULL, entry_number integer NOT NULL,
    model_id text NOT NULL, content_hash text NOT NULL, embedding vector NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(source_commit,path,entry_number,model_id),
    FOREIGN KEY(source_commit,path,entry_number) REFERENCES knowledge_entries(source_commit,path,entry_number) ON DELETE CASCADE,
    CHECK(vector_dims(embedding)>0)
  );`);
  await migrateDocumentEmbeddings(db);
  console.log("语义检索迁移完成；当前小语料使用精确余弦检索，不创建近似索引。");
} catch {
  console.error("语义检索迁移失败：请先为当前 PostgreSQL 安装 pgvector，并确认扩展创建权限。现有知识和计划未修改。");
  process.exitCode = 1;
} finally {
  await db.end();
}
