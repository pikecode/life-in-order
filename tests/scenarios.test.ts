import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  currentScenarios,
  releases,
  scenarioForVersion,
} from "../content/scenarios";
import {
  buildPlan,
  planSchema,
  emptyAnswers,
  validateTaskDependencies,
  changeStatus,
  updateFollowup,
} from "../src/lib/domain";
test("四场景独立，所有任务有正文定位和有效前置，条件来自本场景问题", () => {
  assert.equal(currentScenarios.length, 4);
  assert.equal(new Set(currentScenarios.map((s) => s.metadata.id)).size, 4);
  for (const scene of currentScenarios) {
    validateTaskDependencies(scene.tasks);
    const questions = new Map(scene.metadata.questions.map((q) => [q.key, q]));
    for (const task of scene.tasks) {
      assert.ok(task.stage >= 0 && task.stage < scene.metadata.stages.length);
      for (const [field, values] of Object.entries(task.when ?? {})) {
        assert.ok(questions.has(field));
        assert.ok(
          values!.every((value) =>
            questions.get(field)!.options.some(([option]) => option === value),
          ),
        );
      }
      assert.ok(task.source?.chapter);
      const chapter = readFileSync(
        new URL("../content/upstream/" + task.source.chapter, import.meta.url),
        "utf8",
      );
      assert.match(chapter, new RegExp(`^### ${task.source.entry}\\. `, "m"));
    }
  }
  assert.equal(
    new Set(releases.map((s) => s.metadata.version)).size,
    releases.length,
  );
});
test("租房、失业、出生按各自阶段区分，未知不默认满足", () => {
  const leaving = buildPlan(
    { ...emptyAnswers, rentalStage: "leaving" },
    "rental-v1",
  );
  assert.equal(
    leaving.find((t) => t.id === "rent-contract")?.applicability,
    "excluded",
  );
  assert.equal(
    leaving.find((t) => t.id === "rent-return")?.applicability,
    "applicable",
  );
  const notice = buildPlan(
    { ...emptyAnswers, joblossStage: "notice" },
    "jobloss-v1",
  );
  assert.equal(
    notice.find((t) => t.id === "job-benefits")?.applicability,
    "excluded",
  );
  const left = buildPlan(
    { ...emptyAnswers, joblossStage: "left" },
    "jobloss-v1",
  );
  assert.equal(
    left.find((t) => t.id === "job-benefits")?.applicability,
    "applicable",
  );
  const before = buildPlan(
    { ...emptyAnswers, birthStage: "expecting", birthDocuments: "yes" },
    "birth-v1",
  );
  assert.equal(
    before.find((t) => t.id === "birth-certificate")?.applicability,
    "excluded",
  );
  const after = buildPlan(
    { ...emptyAnswers, birthStage: "born", birthDocuments: "yes" },
    "birth-v1",
  );
  assert.equal(
    after.find((t) => t.id === "birth-certificate")?.applicability,
    "applicable",
  );
  assert.equal(
    buildPlan(emptyAnswers, "birth-v1").find(
      (t) => t.id === "birth-certificate",
    )?.applicability,
    "unknown",
  );
});
test("跨场景任务与回答被拒绝，场景计划进度跟进可导出恢复", () => {
  const rental = {
    contentVersion: "rental-v1" as const,
    answers: { ...emptyAnswers, rentalStage: "leaving" as const },
    progress: {},
  };
  assert.ok(planSchema.safeParse(rental).success);
  assert.equal(
    planSchema.safeParse({
      ...rental,
      answers: { ...rental.answers, birthStage: "born" },
    }).success,
    false,
  );
  assert.equal(
    planSchema.safeParse({
      ...rental,
      answers: { ...rental.answers, rentalStage: "born" },
    }).success,
    false,
  );
  const recorded = updateFollowup(
    changeStatus(rental, "rent-return", "waiting"),
    "rent-return",
    { blockedReason: "等待结算", nextAction: "核对明细" },
  );
  assert.deepEqual(
    planSchema.parse(JSON.parse(JSON.stringify(recorded))),
    recorded,
  );
  assert.equal(
    planSchema.safeParse({ ...recorded, contentVersion: "birth-v1" }).success,
    false,
  );
  assert.equal(scenarioForVersion("moving-v1")?.metadata.id, "moving");
});
