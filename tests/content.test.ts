import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tasks, upstream, upstreamUrl } from "../content/moving";
import manifest from "../content/upstream/manifest.json";
import { legacyTasks, legacyVersion } from "../content/moving-legacy";
import {
  buildPlan,
  changeStatus,
  emptyAnswers,
  planSchema,
} from "../src/lib/domain";
test("上游快照摘要、许可和固定提交一致", () => {
  assert.equal(manifest.commit, upstream.commit);
  assert.match(upstream.commit, /^[a-f0-9]{40}$/);
  for (const file of manifest.files)
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            new URL(`../content/upstream/${file.path}`, import.meta.url),
          ),
        )
        .digest("hex"),
      file.sha256,
    );
  assert.match(
    readFileSync(
      new URL("../content/upstream/LICENSE", import.meta.url),
      "utf8",
    ),
    /Attribution 4.0 International/,
  );
  assert.equal(upstream.license, "CC BY 4.0");
});
test("来源版任务编号独立、定位到实际场景项与正文章节", () => {
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length);
  const scene = readFileSync(
    new URL("../content/upstream/" + upstream.scenarioPath, import.meta.url),
    "utf8",
  );
  for (const task of tasks) {
    assert.ok(!legacyTasks.some((t) => t.id === task.id));
    assert.ok(task.source);
    assert.ok(task.source.chapter);
    const section = scene
      .split(`## ${task.source.section}\n`)[1]
      ?.split("\n## ")[0];
    assert.ok(
      section?.match(new RegExp(`^${task.source.item}\\. `, "m")),
      task.id,
    );
    const chapter = readFileSync(
      new URL("../content/upstream/" + task.source.chapter, import.meta.url),
      "utf8",
    );
    assert.ok(
      chapter.match(new RegExp(`^### ${task.source.entry}\\. `, "m")),
      task.id,
    );
    assert.ok(upstreamUrl(task.source.chapter).includes(upstream.commit));
    assert.ok(
      chapter
        .split(new RegExp(`^### ${task.source.entry}\\. `, "m"))[1]
        ?.split("\n### ")[0]
        .includes("- 来源："),
    );
  }
});
test("旧版计划继续解析并使用原任务，新旧进度不能串用", () => {
  const old = changeStatus(
    { contentVersion: legacyVersion, answers: emptyAnswers, progress: {} },
    "lease",
    "done",
  );
  assert.ok(planSchema.safeParse(old).success);
  assert.ok(
    buildPlan(old.answers, old.contentVersion).some((t) => t.id === "lease"),
  );
  assert.equal(old.progress.lease.completedVersion, "moving-v1");
  assert.equal(
    planSchema.safeParse({ ...old, contentVersion: "moving-v2" }).success,
    false,
  );
  assert.throws(() => changeStatus(old, tasks[0].id, "done"));
});
