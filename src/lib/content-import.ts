import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { tasks, upstream, contentVersion, stages } from "../../content/moving";
import { legacyTasks, legacyVersion } from "../../content/moving-legacy";
import { previousTasks, previousVersion } from "../../content/moving-v2";
import { validateTaskDependencies } from "./domain";
import {
  releases as scenarioReleases,
  currentScenarios,
} from "../../content/scenarios";
import { sourceDocuments } from "./source-documents";
import manifest from "../../content/upstream/manifest.json";
export function parseEntry(markdown: string, entry: number) {
  const block = markdown.match(
    new RegExp(
      `^### ${entry}\\. (.+)\\r?\\n([\\s\\S]*?)(?=^### \\d+\\. |$(?![\\s\\S]))`,
      "m",
    ),
  );
  if (!block) throw new Error(`缺少正文第 ${entry} 条`);
  const field = (name: string) =>
    block[2].match(new RegExp(`^- ${name}：(.+)$`, "m"))?.[1] ?? "";
  const sources = field("来源");
  if (!sources || !field("成本") || !field("收益") || !field("证据等级"))
    throw new Error(`正文第 ${entry} 条缺少字段`);
  return {
    title: block[1],
    body: block[2].trim(),
    cost: field("成本"),
    benefit: field("收益"),
    evidence: field("证据等级"),
    sources,
    sourceUrls: [...sources.matchAll(/https?:\/\/[^\s<>）)]+/g)].map(
      (m) => m[0],
    ),
  };
}
export function contentBundle() {
  for (const file of manifest.files) {
    const bytes = readFileSync(
      new URL("../../content/upstream/" + file.path, import.meta.url),
    );
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new Error(`快照摘要不符：${file.path}`);
  }
  if (manifest.commit !== upstream.commit) throw new Error("来源版本不一致");
  const entries = new Map<
    string,
    { path: string; entry: number; data: ReturnType<typeof parseEntry> }
  >();
  const chapters = manifest.files.filter(
    (file) => file.path.startsWith("book/") && file.path.endsWith(".md"),
  );
  if (
    chapters.length !== manifest.chapters.length ||
    manifest.chapters.some(
      (chapter) => !chapters.some((file) => file.path === chapter.path),
    )
  )
    throw new Error("章节清单不完整");
  for (const chapter of chapters) {
    const bytes = readFileSync(
      new URL("../../content/upstream/" + chapter.path, import.meta.url),
    );
    const blob = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    if (
      blob !==
      manifest.chapters.find((file) => file.path === chapter.path)!.gitBlob
    )
      throw new Error(`Git blob 不符：${chapter.path}`);
    const markdown = bytes.toString("utf8");
    const numbers = [...markdown.matchAll(/^### (\d+)\. /gm)].map((match) =>
      Number(match[1]),
    );
    if (
      !numbers.length ||
      numbers.some((number, index) => number !== index + 1)
    )
      throw new Error(`条号不连续或重复：${chapter.path}`);
    for (const entry of numbers)
      entries.set(`${chapter.path}:${entry}`, {
        path: chapter.path,
        entry,
        data: parseEntry(markdown, entry),
      });
  }
  const readme = readFileSync(
    new URL("../../content/upstream/README.md", import.meta.url),
    "utf8",
  );
  const expectedCount = Number(readme.match(/(\d+) 条建议/)?.[1]);
  if (!expectedCount || entries.size !== expectedCount)
    throw new Error(
      `知识总数不符：读取 ${entries.size}，README 声明 ${expectedCount}`,
    );
  for (const task of scenarioReleases
    .filter((release) => release.metadata.version !== legacyVersion)
    .flatMap((release) => release.tasks))
    if (
      !task.source?.chapter ||
      !entries.has(`${task.source.chapter}:${task.source.entry}`)
    )
      throw new Error(`任务缺少知识引用：${task.id}`);
  for (const release of scenarioReleases)
    validateTaskDependencies(release.tasks);
  return {
    upstream,
    manifest,
    documents:sourceDocuments(),
    entries: [...entries.values()],
    releases: scenarioReleases.map((release) => ({
      version: release.metadata.version,
      tasks: release.tasks,
      stages: release.metadata.stages,
      sourceCommit:
        release.metadata.version === legacyVersion ? null : upstream.commit,
      scenario: release.metadata,
    })),
  };
}
export async function importContent(pool: Pool, bundle = contentBundle()) {
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
          )
        : v,
    );
  const fingerprint = (value: unknown) =>
    createHash("sha256").update(canonical(value)).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('life-in-order-content-import'))",
    );
    const source = await client.query(
      "SELECT metadata,manifest FROM source_versions WHERE commit_id=$1",
      [bundle.upstream.commit],
    );
    if (
      source.rows[0] &&
      fingerprint(source.rows[0].metadata) !== fingerprint(bundle.upstream)
    )
      throw new Error("同一来源提交的元数据不可覆盖");
    await client.query(
      "INSERT INTO source_versions(commit_id,metadata,manifest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [bundle.upstream.commit, bundle.upstream, bundle.manifest],
    );
    if (source.rows[0]) {
      const previousFiles = source.rows[0].manifest.files as {
        path: string;
        sha256: string;
      }[];
      if (
        previousFiles.some(
          (old) =>
            !bundle.manifest.files.some(
              (next) => next.path === old.path && next.sha256 === old.sha256,
            ),
        )
      )
        throw new Error("来源快照不能删除或更改，只能补充同提交文件");
      await client.query(
        "UPDATE source_versions SET manifest=$2 WHERE commit_id=$1",
        [bundle.upstream.commit, bundle.manifest],
      );
    }
    let insertedEntries = 0;
    for (const entry of bundle.entries) {
      const previous = await client.query(
        "SELECT data FROM knowledge_entries WHERE source_commit=$1 AND path=$2 AND entry_number=$3",
        [bundle.upstream.commit, entry.path, entry.entry],
      );
      if (
        previous.rows[0] &&
        fingerprint(previous.rows[0].data) !== fingerprint(entry.data)
      )
        throw new Error("同一来源条目不可覆盖");
      if (!previous.rows[0]) insertedEntries++;
      await client.query(
        "INSERT INTO knowledge_entries(source_commit,path,entry_number,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [bundle.upstream.commit, entry.path, entry.entry, entry.data],
      );
    }
    let imported = false;
    for (const release of bundle.releases) {
      const hash = fingerprint({
        version: release.version,
        tasks: release.tasks,
        stages: release.stages,
        sourceCommit: release.sourceCommit,
      });
      const existing = await client.query<{
        fingerprint: string;
        scenario: unknown;
      }>("SELECT fingerprint,scenario FROM content_releases WHERE version=$1", [
        release.version,
      ]);
      if (existing.rows[0]) {
        if (existing.rows[0].fingerprint !== hash)
          throw new Error("已发布版本内容发生变化，请创建新版本，不得覆盖");
        if (
          existing.rows[0].scenario &&
          fingerprint(existing.rows[0].scenario) !==
            fingerprint(release.scenario)
        )
          throw new Error("已发布场景配置不可覆盖");
        if (!existing.rows[0].scenario)
          await client.query(
            "UPDATE content_releases SET scenario=$2 WHERE version=$1",
            [release.version, release.scenario],
          );
        continue;
      }
      imported = true;
      await client.query(
        "INSERT INTO content_releases(version,source_commit,stages,fingerprint,scenario) VALUES($1,$2,$3,$4,$5)",
        [
          release.version,
          release.sourceCommit,
          JSON.stringify(release.stages),
          hash,
          release.scenario,
        ],
      );
      for (const [position, task] of release.tasks.entries())
        await client.query(
          "INSERT INTO action_tasks(version,task_id,position,data,source_commit,source_path,source_entry) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            release.version,
            task.id,
            position,
            task,
            release.sourceCommit,
            task.source?.chapter ?? null,
            task.source?.entry ?? null,
          ],
        );
    }
    let insertedDocuments=0,insertedChunks=0;
    for(const document of bundle.documents) {
      const {chunks,...data}=document;
      if(createHash("sha256").update(data.markdown).digest("hex")!==data.sha256)throw new Error("文档正文摘要不符");
      const old=await client.query("SELECT kind,title,markdown,introduction,topics,chapters,sha256,git_blob FROM source_documents WHERE source_commit=$1 AND path=$2",[bundle.upstream.commit,data.path]);
      if(old.rows[0]&&fingerprint(old.rows[0])!==fingerprint({kind:data.kind,title:data.title,markdown:data.markdown,introduction:data.introduction,topics:data.topics,chapters:data.chapters,sha256:data.sha256,git_blob:data.gitBlob}))throw new Error("同一来源文档不可覆盖");
      if(!old.rowCount) {
        insertedDocuments++;
        await client.query(`INSERT INTO source_documents(source_commit,path,kind,title,markdown,introduction,topics,chapters,sha256,git_blob)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[bundle.upstream.commit,data.path,data.kind,data.title,data.markdown,data.introduction,data.topics,data.chapters,data.sha256,data.gitBlob]);
      }
      const records=chunks.map(chunk=>({chunk_number:chunk.number,start_offset:chunk.start,end_offset:chunk.end,heading:chunk.heading,text:chunk.text,content_hash:chunk.hash}));
      const oldChunks=await client.query("SELECT chunk_number,start_offset,end_offset,heading,text,content_hash FROM document_chunks WHERE source_commit=$1 AND path=$2 ORDER BY chunk_number",[bundle.upstream.commit,data.path]);
      if(oldChunks.rows.some(row=>fingerprint(row)!==fingerprint(records[row.chunk_number-1])))throw new Error("同一来源文档分块不可覆盖");
      const existing=new Set(oldChunks.rows.map(row=>row.chunk_number));
      const missing=records.filter(row=>!existing.has(row.chunk_number));
      insertedChunks+=missing.length;
      if(missing.length)await client.query(`INSERT INTO document_chunks(source_commit,path,chunk_number,start_offset,end_offset,heading,text,content_hash)
        SELECT $1,$2,c.chunk_number,c.start_offset,c.end_offset,c.heading,c.text,c.content_hash FROM jsonb_to_recordset($3::jsonb)
        AS c(chunk_number integer,start_offset integer,end_offset integer,heading text,text text,content_hash text)`,[bundle.upstream.commit,data.path,JSON.stringify(missing)]);

    }
    await client.query("COMMIT");
    return {
      imported: imported || insertedEntries > 0 || insertedDocuments > 0 || insertedChunks > 0,
      insertedDocuments,insertedChunks,
      documents:bundle.documents.length,
      chunks:bundle.documents.reduce((sum,document)=>sum+document.chunks.length,0),
      insertedEntries,
      tasks: currentScenarios.reduce(
        (total, scenario) => total + scenario.tasks.length,
        0,
      ),
      scenarios: currentScenarios.length,
      entries: bundle.entries.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
