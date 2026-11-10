import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import manifest from "../../content/upstream/manifest.json";
import inventory from "../../content/upstream/inventory.json";
import { knowledgeTopics } from "./knowledge-search";
import { documentChunks } from "./document-chunks";
export const documentKindLabels={article:"专题长文",chapter:"完整章节",verification:"核实档案",reference:"参考资料"};
export type DocumentKind=keyof typeof documentKindLabels;
const articleChapters:Record<string,string[]>={
  "docs/做平台要办哪些证.md":["26"],"docs/刚确诊慢性病之后.md":["16"],"docs/孩子出生前后要办的事.md":["20","27"],
  "docs/家庭应急装备清单.md":["13"],"docs/换工作、换城市之前.md":["19","15"],"docs/生物钟和夜班.md":["02","03"],
  "docs/结婚划不划算.md":["10"],"docs/被裁了之后先做什么.md":["19","07"],"docs/遇到陌生人出事该不该停.md":["13","08"],
};
export function isContentFile(path:string) {
  return path==="LICENSE"||path==="LICENSE-CODE"||path.endsWith(".md")&&!path.startsWith(".claude/")&&!path.startsWith("skills/")&&!["AGENTS.md","CLAUDE.md"].includes(path);
}
export function sourceDocuments() {
  if(inventory.commit!==manifest.commit||inventory.tree!==manifest.sourceTree)throw new Error("来源目录树不一致");
  if(new Set(inventory.files.map(file=>file.path)).size!==inventory.files.length)throw new Error("来源清单重复");
  const included=inventory.files.filter(file=>isContentFile(file.path));
  if(inventory.files.some(file=>(file.status==="included")!==isContentFile(file.path))||included.length!==manifest.files.length)throw new Error("来源文件范围不完整");
  return included.map(file=>{
    if(file.path.startsWith("/")||file.path.split("/").some(part=>part===".."||part===".")||file.path.includes("\\"))throw new Error("来源路径无效");
    const bytes=readFileSync(new URL("../../content/upstream/"+file.path,import.meta.url));
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const gitBlob=createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if(gitBlob!==file.gitBlob||sha256!==manifest.files.find(item=>item.path===file.path)?.sha256)throw new Error(`来源摘要不符：${file.path}`);
    const markdown=bytes.toString("utf8");
    if(!Buffer.from(markdown).equals(bytes))throw new Error("来源不是有效 UTF-8");
    const kind:DocumentKind=file.path.startsWith("book/")?"chapter":file.path.startsWith("docs/核实记录/")?"verification":file.path.startsWith("docs/")&&file.path!=="docs/引用对照.md"?"article":"reference";
    const chapters=kind==="chapter"?[file.path.slice(5,7)]:articleChapters[file.path]??[];
    if(kind==="article"&&!chapters.length)throw new Error(`专题未配置主题：${file.path}`);
    const topics=knowledgeTopics.filter(topic=>topic.chapters.some(id=>chapters.includes(id))).map(topic=>topic.id);
    const title=markdown.match(/^#\s+(.+)$/m)?.[1]??file.path.split("/").at(-1)!.replace(/\.md$/,"");
    const firstEntry=kind==="chapter"?markdown.search(/^### \d+\. /m):-1;
    const introduction=firstEntry>=0?markdown.slice(0,firstEntry):"";
    return {path:file.path,kind,title,markdown,introduction,topics,chapters,sha256,gitBlob,chunks:documentChunks(title,markdown)};
  });
}
export type SourceDocument=ReturnType<typeof sourceDocuments>[number];
export async function migrateDocuments(pool:Pick<Pool,"query">) {
  await pool.query(`CREATE TABLE IF NOT EXISTS source_documents(
    source_commit text NOT NULL REFERENCES source_versions(commit_id),path text NOT NULL,kind text NOT NULL CHECK(kind IN ('article','chapter','verification','reference')),
    title text NOT NULL,markdown text NOT NULL,introduction text NOT NULL,topics text[] NOT NULL,chapters text[] NOT NULL,
    sha256 text NOT NULL,git_blob text NOT NULL,PRIMARY KEY(source_commit,path)
  );
  CREATE TABLE IF NOT EXISTS document_chunks(
    source_commit text NOT NULL,path text NOT NULL,chunk_number integer NOT NULL CHECK(chunk_number>0),
    start_offset integer NOT NULL,end_offset integer NOT NULL,heading text NOT NULL,text text NOT NULL,content_hash text NOT NULL,
    PRIMARY KEY(source_commit,path,chunk_number),FOREIGN KEY(source_commit,path) REFERENCES source_documents(source_commit,path),CHECK(end_offset>start_offset AND start_offset>=0)
  );`);
}
