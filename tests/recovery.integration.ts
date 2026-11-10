import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { backupDatabase, restoreDatabase } from "../scripts/database-tools";
import { contentVersion } from "../content/moving";
const execute = promisify(execFile);
test("独立数据库备份恢复，拒绝覆盖文件、源库与非空目标", async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("需要专用开发环境 DATABASE_URL");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12),
    sourceName = `lio_recovery_source_${suffix}`,
    targetName = `lio_recovery_target_${suffix}`;
  const admin = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
  const urlFor = (name: string) => {
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/" + name;
    return url.toString();
  };
  const sourceUrl = urlFor(sourceName),
    targetUrl = urlFor(targetName),
    directory = await mkdtemp(join(tmpdir(), "lio-recovery-")),
    file = join(directory, "backup.dump");
  let sourceCreated = false,
    targetCreated = false;
  const source = new Pool({ connectionString: sourceUrl, max: 1 }),
    target = new Pool({ connectionString: targetUrl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${sourceName}"`);
    sourceCreated = true;
    await admin.query(`CREATE DATABASE "${targetName}"`);
    targetCreated = true;
    await execute(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
      env: { ...process.env, DATABASE_URL: sourceUrl },
      maxBuffer: 1024 * 1024,
    });
    const vectorAvailable = (await admin.query("SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector') AS available")).rows[0].available;
    if (vectorAvailable) {
      await execute(process.execPath, ["--import", "tsx", "scripts/migrate-semantic.ts"], {
        env: {...process.env, DATABASE_URL:sourceUrl}, maxBuffer:1024*1024,
      });
      await source.query(`INSERT INTO knowledge_embeddings(source_commit,path,entry_number,model_id,content_hash,embedding)
        SELECT source_commit,path,entry_number,'recovery-fixture','fixture-hash','[1,0,0]'::vector FROM knowledge_entries ORDER BY path,entry_number LIMIT 1`);
    }
    if(vectorAvailable)await source.query(`INSERT INTO document_embeddings(source_commit,path,chunk_number,model_id,content_hash,embedding)
      SELECT source_commit,path,chunk_number,'recovery-fixture',content_hash,'[1,0,0]'::vector FROM document_chunks ORDER BY path,chunk_number LIMIT 1`);
    assert.equal((await source.query("SELECT to_regclass('public.user') AS existing")).rows[0].existing,null);
    // 仅在隔离演练库模拟历史表，正式迁移不再创建或删除账号数据。
    await source.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" boolean,"createdAt" timestamptz,"updatedAt" timestamptz);
      CREATE TABLE plans(id uuid PRIMARY KEY,user_id text REFERENCES "user"(id) ON DELETE CASCADE,data jsonb NOT NULL);`);
    const userId = randomUUID(),
      planId = randomUUID();
    await source.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
      [userId, "恢复演练", `${userId}@example.test`],
    );
    const plan = {
      contentVersion,
      answers: {
        city: "恢复测试城市",
        date: "",
        oldLease: "unknown",
        needHousing: "unknown",
      },
      progress: {
        "work-records-v3": {
          status: "waiting",
          updatedAt: new Date().toISOString(),
          blockedReason: "等待回复",
          nextAction: "联系测试人事",
        },
      },
    };
    await source.query("INSERT INTO plans(id,user_id,data) VALUES($1,$2,$3)", [
      planId,
      userId,
      plan,
    ]);
    await execute(process.execPath,["--import","tsx","scripts/migrate.ts"],{
      env:{...process.env,DATABASE_URL:sourceUrl},maxBuffer:1024*1024,
    });
    assert.equal((await source.query('SELECT count(*)::int AS n FROM "user"')).rows[0].n,1);
    assert.deepEqual((await source.query('SELECT data FROM plans WHERE id=$1',[planId])).rows[0].data,plan);
    const usageId=randomUUID();
    await source.query(`INSERT INTO usage_events(id,session_id,event_type,source_commit,search_mode,result_count)
      SELECT $1,$2,'search',commit_id,'keyword',0 FROM source_versions ORDER BY commit_id LIMIT 1`,[usageId,randomUUID()]);
    await backupDatabase(sourceUrl, file);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(backupDatabase(sourceUrl, file), /拒绝覆盖/);
    await assert.rejects(
      restoreDatabase(sourceUrl, sourceUrl, file),
      /不能是源/,
    );
    await target.query(
      "CREATE SCHEMA pgfixture; CREATE TABLE pgfixture.sentinel(id integer)",
    );
    await assert.rejects(
      restoreDatabase(sourceUrl, targetUrl, file),
      /必须是空数据库/,
    );
    await target.query("DROP TABLE pgfixture.sentinel; DROP SCHEMA pgfixture");
    await restoreDatabase(sourceUrl, targetUrl, file);
    assert.equal((await target.query('SELECT event_type,result_count FROM usage_events WHERE id=$1',[usageId])).rows[0].event_type,'search');
    if (vectorAvailable) {
      const restored = await target.query("SELECT model_id,embedding::text AS embedding FROM knowledge_embeddings");
      assert.deepEqual(restored.rows,[{model_id:'recovery-fixture',embedding:'[1,0,0]'}]);
      assert.deepEqual((await target.query("SELECT model_id,embedding::text AS embedding FROM document_embeddings")).rows,[{model_id:'recovery-fixture',embedding:'[1,0,0]'}]);
    }
    assert.deepEqual(
      (await target.query("SELECT data FROM plans WHERE id=$1", [planId]))
        .rows[0].data,
      plan,
    );
    assert.equal(
      (
        await target.query(
          "SELECT count(*)::int AS count FROM knowledge_entries",
        )
      ).rows[0].count,
      772,
    );
    assert.equal((await target.query("SELECT count(*)::int AS n FROM source_documents")).rows[0].n,293);
    assert.equal((await target.query("SELECT count(*)::int AS n FROM document_chunks")).rows[0].n,1837);
    const tables = (
      await source.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows as { tablename: string }[];
    for (const { tablename } of tables) {
      assert.match(tablename, /^[a-zA-Z_]+$/);
      const query = `SELECT count(*)::int AS count FROM "${tablename}"`;
      assert.equal(
        (await source.query(query)).rows[0].count,
        (await target.query(query)).rows[0].count,
      );
    }
    await assert.rejects(
      restoreDatabase(sourceUrl, targetUrl, file),
      /必须是空数据库/,
    );
    await assert.rejects(
      target.query("INSERT INTO plans(id,user_id,data) VALUES($1,$2,$3)", [
        randomUUID(),
        randomUUID(),
        plan,
      ]),
    );
  } finally {
    await source.end();
    await target.end();
    if (targetCreated) await admin.query(`DROP DATABASE "${targetName}"`);
    if (sourceCreated) await admin.query(`DROP DATABASE "${sourceName}"`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
