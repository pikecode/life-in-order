import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, access, link, unlink, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { Pool } from "pg";
const execute = promisify(execFile);
function connection(url: string) {
  const parsed = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.pathname.slice(1)
  )
    throw new Error("需要有效 PostgreSQL 数据库 URL");
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    ? "localhost"
    : parsed.hostname;
  return {
    identity: `${host}:${parsed.port || 5432}/${database}`,
    env: {
      ...process.env,
      PGHOST: parsed.hostname,
      PGPORT: parsed.port || "5432",
      PGDATABASE: database,
      PGUSER:
        decodeURIComponent(parsed.username) ||
        process.env.PGUSER ||
        userInfo().username,
      PGPASSWORD: decodeURIComponent(parsed.password),
      PGCONNECT_TIMEOUT: "5",
      ...(parsed.searchParams.has("sslmode")
        ? { PGSSLMODE: parsed.searchParams.get("sslmode")! }
        : {}),
    },
  };
}
async function run(command: string, args: string[], url: string) {
  try {
    await execute(command, args, {
      env: connection(url).env,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error(
      `${command} 执行失败，请检查工具版本、连接权限和输入文件；未输出连接凭据。`,
    );
  }
}
export async function backupDatabase(url: string, file: string) {
  const target = resolve(file),
    temp = `${target}.partial-${randomUUID()}`;
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  try {
    await access(target);
    throw new Error("备份文件已存在，拒绝覆盖");
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ))
      throw error;
  }
  try {
    // 私有临时文件和硬链接避免覆盖已存在的备份。
    const { open } = await import("node:fs/promises");
    const handle = await open(temp, "wx", 0o600);
    await handle.close();
    await run(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl", "--file", temp],
      url,
    );
    await chmod(temp, 0o600);
    await link(temp, target);
    return target;
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function restoreDatabase(
  sourceUrl: string,
  targetUrl: string,
  file: string,
) {
  if (connection(sourceUrl).identity === connection(targetUrl).identity)
    throw new Error("恢复目标不能是源数据库");
  const target = new Pool({
    connectionString: targetUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const objects = await target.query(
      "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1",
    );
    if (objects.rowCount) throw new Error("恢复目标必须是空数据库，拒绝覆盖");
    await run("pg_restore", ["--list", resolve(file)], targetUrl);
    await run(
      "pg_restore",
      [
        "--single-transaction",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "--dbname",
        "dbname='" +
          connection(targetUrl)
            .env.PGDATABASE.replaceAll("\\", "\\\\")
            .replaceAll("'", "\\'") +
          "'",
        resolve(file),
      ],
      targetUrl,
    );
  } finally {
    await target.end();
  }
}
