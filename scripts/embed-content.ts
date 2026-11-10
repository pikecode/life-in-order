import "dotenv/config";
import { upstream } from "../content/moving";
import { db } from "../src/lib/db";
import { embeddingConfig } from "../src/lib/embeddings";
import { buildDocumentEmbeddings } from "../src/lib/document-search";
import { buildEmbeddingIndex } from "../src/lib/semantic-search";
try {
  const config = embeddingConfig();
  if (!config) throw new Error("需要配置 EMBEDDING_MODEL、EMBEDDING_MODEL_DIGEST 和本机 EMBEDDING_URL");
  console.log(await buildEmbeddingIndex(db, config, upstream.commit));
  console.log(await buildDocumentEmbeddings(db,config,upstream.commit));
} catch {
  console.error("知识向量构建未完成。请确认 db:semantic 已执行、固定模型已下载、环境配置正确且本机 Ollama 可用；已提交批次保留，可重新执行续建。");
  process.exitCode=1;
} finally { await db.end(); }
