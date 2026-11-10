import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan,
  updateFollowup,
  followupTasks,
  taskReadiness,
  validateTaskDependencies,
  changeStatus,
  differences,
  emptyAnswers,
  planSchema,
} from "../src/lib/domain";
import { contentVersion } from "../content/moving";
test("未知条件不默认为满足，不需要时移出", () => {
  assert.equal(
    buildPlan(emptyAnswers).find((t) => t.id === "rental-deposit-v3")
      ?.applicability,
    "unknown",
  );
  assert.equal(
    buildPlan({ ...emptyAnswers, oldLease: "no" }).find(
      (t) => t.id === "rental-deposit-v3",
    )?.applicability,
    "excluded",
  );
  assert.equal(
    buildPlan({ ...emptyAnswers, oldLease: "yes" }).find(
      (t) => t.id === "rental-deposit-v3",
    )?.applicability,
    "applicable",
  );
});
test("条件变化保留完成记录和完成内容版本", () => {
  const done = changeStatus(
    {
      contentVersion,
      answers: { ...emptyAnswers, oldLease: "yes" },
      progress: {},
    },
    "rental-deposit-v3",
    "done",
  );
  const after = {
    ...done,
    answers: { ...done.answers, oldLease: "no" as const },
  };
  assert.equal(after.progress["rental-deposit-v3"].status, "done");
  assert.equal(
    after.progress["rental-deposit-v3"].completedVersion,
    contentVersion,
  );
  assert.deepEqual(
    differences(done.answers, after.answers).removed.map((t) => t.id),
    ["rental-deposit-v3"],
  );
});
test("导入拒绝未知任务、非法状态、日期、旧版本与额外身份字段", () => {
  const base = { contentVersion, answers: emptyAnswers, progress: {} };
  assert.ok(planSchema.safeParse(base).success);
  for (const data of [
    { ...base, userId: "other" },
    { ...base, contentVersion: "v0" },
    { ...base, answers: { ...emptyAnswers, date: "2026-02-30" } },
    {
      ...base,
      progress: {
        missing: { status: "done", updatedAt: new Date().toISOString() },
      },
    },
    {
      ...base,
      progress: {
        lease: { status: "broken", updatedAt: new Date().toISOString() },
      },
    },
  ])
    assert.equal(planSchema.safeParse(data).success, false);
});

test("不同阶段与未知条件按三态匹配，明确不满足优先于未知", () => {
  const first = buildPlan({
    ...emptyAnswers,
    employment: "firstJob",
    newJob: "offer",
    nonCompete: "unknown",
  });
  assert.equal(
    first.find((t) => t.id === "work-records-v3")?.applicability,
    "excluded",
  );
  assert.equal(
    first.find((t) => t.id === "competition-check-v3")?.applicability,
    "excluded",
  );
  assert.equal(
    first.find((t) => t.id === "read-contract-v3")?.applicability,
    "applicable",
  );
  assert.equal(
    buildPlan(emptyAnswers).find((t) => t.id === "read-contract-v3")
      ?.applicability,
    "unknown",
  );
  const searching = buildPlan({
    ...emptyAnswers,
    newJob: "searching",
    transferInsurance: "unknown",
  });
  assert.equal(
    searching.find((t) => t.id === "insurance-transfer-v3")?.applicability,
    "excluded",
  );
  assert.equal(
    planSchema.safeParse({
      contentVersion,
      answers: { ...emptyAnswers, employment: "invalid" },
      progress: {},
    }).success,
    false,
  );
});

test("前置事项控制开始建议，完成解锁；等待状态不重复推荐", () => {
  let plan = {
    contentVersion,
    answers: {
      ...emptyAnswers,
      employment: "employed" as const,
      newJob: "offer" as const,
    },
    progress: {},
  } as import("../src/lib/domain").PlanData;
  assert.equal(
    taskReadiness(plan).find((t) => t.id === "return-access-v3")?.ready,
    false,
  );
  assert.equal(
    taskReadiness(plan).find((t) => t.id === "work-records-v3")?.ready,
    true,
  );
  plan = changeStatus(plan, "work-records-v3", "done");
  plan = changeStatus(plan, "company-data-v3", "done");
  assert.equal(
    taskReadiness(plan).find((t) => t.id === "return-access-v3")?.ready,
    true,
  );
  plan = changeStatus(plan, "return-access-v3", "waiting");
  assert.equal(
    taskReadiness(plan).find((t) => t.id === "return-access-v3")?.ready,
    false,
  );
});

test("前置事项校验拒绝缺失引用、重复和循环", () => {
  const task = {
    id: "a",
    title: "a",
    stage: 0,
    body: "",
    materials: [],
    contact: "",
  };
  assert.throws(
    () => validateTaskDependencies([{ ...task, prerequisites: ["missing"] }]),
    /不存在/,
  );
  assert.throws(() => validateTaskDependencies([task, task]), /重复/);
  assert.throws(
    () =>
      validateTaskDependencies([
        { ...task, prerequisites: ["b"] },
        { ...task, id: "b", prerequisites: ["a"] },
      ]),
    /循环/,
  );
});

test("v2旧计划保持旧问答及完成记录，不静默套用新条件", () => {
  const old = {
    contentVersion: "moving-v2",
    answers: emptyAnswers,
    progress: {
      "work-records": {
        status: "done",
        updatedAt: "2026-11-09T00:00:00.000Z",
        completedVersion: "moving-v2",
      },
    },
  };
  assert.ok(planSchema.safeParse(old).success);
  assert.equal(
    buildPlan(emptyAnswers, "moving-v2").find((t) => t.id === "work-records")
      ?.applicability,
    "applicable",
  );
  assert.equal(planSchema.safeParse({ ...old, contentVersion }).success, false);
});

test("跟进记录切换状态保留，完成后移出跟进且仍可导出恢复", () => {
  let plan = {
    contentVersion,
    answers: emptyAnswers,
    progress: {},
  } as import("../src/lib/domain").PlanData;
  plan = updateFollowup(plan, "rental-deposit-v3", {
    blockedReason: "等待房东回复",
    nextAction: "明天确认交房安排",
  });
  assert.equal(followupTasks(plan).length, 1);
  plan = changeStatus(plan, "rental-deposit-v3", "waiting");
  assert.equal(
    plan.progress["rental-deposit-v3"].blockedReason,
    "等待房东回复",
  );
  plan = changeStatus(plan, "rental-deposit-v3", "done");
  assert.equal(followupTasks(plan).length, 0);
  const restored = planSchema.parse(JSON.parse(JSON.stringify(plan)));
  assert.equal(
    restored.progress["rental-deposit-v3"].nextAction,
    "明天确认交房安排",
  );
  plan = changeStatus(plan, "rental-deposit-v3", "doing");
  assert.equal(plan.progress["rental-deposit-v3"].completedVersion, undefined);
  assert.equal(
    followupTasks({ ...plan, answers: { ...emptyAnswers, oldLease: "no" } })
      .length,
    0,
  );
  assert.equal(
    plan.progress["rental-deposit-v3"].blockedReason,
    "等待房东回复",
  );
});
test("跟进记录校验长度与任务；旧进度、空白记录仍兼容", () => {
  const plan: import("../src/lib/domain").PlanData = { contentVersion, answers: emptyAnswers, progress: {} };
  assert.throws(
    () => updateFollowup(plan, "missing", { blockedReason: "卡点" }),
    /未知任务/,
  );
  assert.throws(() =>
    updateFollowup(plan, "rental-deposit-v3", {
      blockedReason: "字".repeat(501),
    }),
  );
  const blank = updateFollowup(plan, "rental-deposit-v3", {
    blockedReason: "  ",
    nextAction: "",
  });
  assert.equal(followupTasks(blank).length, 0);
  assert.equal(
    followupTasks(changeStatus(blank, "rental-deposit-v3", "verify")).length,
    1,
  );
  assert.equal(
    planSchema.safeParse({
      ...blank,
      progress: {
        "rental-deposit-v3": {
          ...blank.progress["rental-deposit-v3"],
          nextAction: "字".repeat(301),
        },
      },
    }).success,
    false,
  );
});
