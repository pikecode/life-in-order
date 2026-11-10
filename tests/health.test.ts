import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { GET } from "../src/app/api/health/route";
test("健康检查确认内容就绪，数据库失败时不泄露内部错误", async (context) => {
  try {
    const ready = await GET();
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready" });
    context.mock.method(db, "query", async () => {
      throw new Error("internal-secret-connection");
    });
    const failed = await GET();
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await failed.json(), { status: "unavailable" });
  } finally {
    context.mock.restoreAll();
    await db.end();
  }
});
