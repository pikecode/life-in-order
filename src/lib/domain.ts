import { z } from "zod";
import { rentalExitTaskIds } from "../../content/rental-exit";
import { tasks, contentVersion, type Task } from "../../content/moving";
import { legacyTasks, legacyVersion } from "../../content/moving-legacy";
import { previousTasks, previousVersion } from "../../content/moving-v2";
import {
  allQuestions as workflowQuestions,
  scenarioForVersion,
} from "../../content/scenarios";
export const statusLabels = {
  todo: "待办",
  doing: "进行中",
  waiting: "等待他人",
  verify: "待核实",
  done: "完成",
} as const;
const answer = z.enum(["yes", "no", "unknown"]);
export const answersSchema = z
  .object({
    city: z.string().trim().max(40),
    date: z.union([z.literal(""), z.iso.date()]),
    oldLease: answer,
    needHousing: answer,
    employment: z.enum(["employed", "left", "firstJob", "unknown"]).optional(),
    newJob: z.enum(["searching", "offer", "joined", "unknown"]).optional(),
    relocation: z.enum(["preparing", "arrived", "unknown"]).optional(),
    transferInsurance: answer.optional(),
    localBenefits: answer.optional(),
    nonCompete: answer.optional(),
    rentalStage: z
      .enum(["searching", "signing", "living", "leaving", "unknown"])
      .optional(),
    rentalAgent: answer.optional(),
    rentalAgency: answer.optional(),
    depositDispute: answer.optional(),
    joblossStage: z.enum(["notice", "left", "searching", "unknown"]).optional(),
    owedWages: answer.optional(),
    needsAid: answer.optional(),
    birthStage: z.enum(["expecting", "born", "unknown"]).optional(),
    birthInsurance: answer.optional(),
    birthDocuments: answer.optional(),
    birthSupport: answer.optional(),
  })
  .strict();
export type Answers = z.infer<typeof answersSchema>;
export const emptyAnswers: Answers = {
  city: "",
  date: "",
  oldLease: "unknown",
  needHousing: "unknown",
};
const followupFields = {
  blockedReason: z.string().max(500).optional(),
  nextAction: z.string().max(300).optional(),
};
const followupSchema = z.object(followupFields).strict();
const progressSchema = z.record(
  z.string(),
  z
    .object({
      status: z.enum(["todo", "doing", "waiting", "verify", "done"]),
      updatedAt: z.iso.datetime(),
      completedVersion: z.string().optional(),
      ...followupFields,
    })
    .strict(),
);
export const rentalWorkspaceSchema = z.object({
  kind:z.literal("rental-exit"), problem:z.string().trim().min(1).max(500),
  focus:z.enum(["handover","deposit","dispute"]).nullable(),
  choices:z.partialRecord(z.enum(rentalExitTaskIds),z.enum(["include","uncertain","later"])),
  step:z.enum(["choose","act"]),
}).strict();
export const planSchema = z
  .object({
    contentVersion: z.enum([
      contentVersion,
      previousVersion,
      legacyVersion,
      "rental-v1",
      "jobloss-v1",
      "birth-v1",
    ]),
    answers: answersSchema,
    progress: progressSchema,
    workspace: rentalWorkspaceSchema.optional(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if(plan.workspace && (plan.contentVersion!=="rental-v1" ||
      (plan.answers.rentalStage && !["leaving","unknown"].includes(plan.answers.rentalStage))))
      ctx.addIssue({code:"custom",message:"退租处理台仅支持租房退租阶段"});
    const allowed = scenarioForVersion(plan.contentVersion)!.tasks;
    const definition = scenarioForVersion(plan.contentVersion)!;
    const questionKeys = new Set(
      (definition.metadata.id === "moving"
        ? scenarioForVersion(contentVersion)!.metadata.questions
        : definition.metadata.questions
      ).map((question) => question.key),
    );
    for (const key of Object.keys(plan.answers))
      if (
        !["city", "date", "oldLease", "needHousing"].includes(key) &&
        !questionKeys.has(key)
      )
        ctx.addIssue({ code: "custom", message: "回答字段不属于此场景" });
    if (
      Object.keys(plan.progress).some((id) => !allowed.some((t) => t.id === id))
    )
      ctx.addIssue({ code: "custom", message: "包含不属于此版本的任务" });
  });
export type PlanData = z.infer<typeof planSchema>;
export type Plan = PlanData & {
  id: string;
  revision: number;
  updatedAt: string;
};
export function buildPlan(
  answers: Answers,
  version: PlanData["contentVersion"] = contentVersion,
  catalogue?: readonly Task[],
) {
  const list: readonly Task[] = catalogue ?? scenarioForVersion(version)!.tasks;
  return list.map((task) => {
    const conditions = Object.entries(task.when ?? {}).map(([key, values]) => {
      const value = answers[key as keyof Answers];
      return {
        key,
        result:
          !value || value === "unknown"
            ? "unknown"
            : values!.includes(value)
              ? "applicable"
              : "excluded",
      };
    });
    if (task.condition)
      conditions.push({
        key: task.condition,
        result:
          answers[task.condition] === "unknown"
            ? "unknown"
            : answers[task.condition] === "yes"
              ? "applicable"
              : "excluded",
      });
    const applicability = conditions.some((c) => c.result === "excluded")
      ? "excluded"
      : conditions.some((c) => c.result === "unknown")
        ? "unknown"
        : "applicable";
    const labels: Record<string, string> = {
      oldLease: "退租安排",
      needHousing: "新住处安排",
      ...Object.fromEntries(
        workflowQuestions.map((q) => [q.key, q.title.replace(/[？?]$/, "")]),
      ),
    };
    return {
      ...task,
      applicability,
      reason: conditions.length
        ? conditions
            .map((c) =>
              c.result === "unknown"
                ? `待确认：${labels[c.key]}`
                : `${labels[c.key]}：${workflowQuestions.find((q) => q.key === c.key)?.options.find((option) => option[0] === answers[c.key as keyof Answers])?.[1] ?? (answers[c.key as keyof Answers] === "yes" ? "需要" : "不需要")}（${c.result === "excluded" ? "当前不适用" : "适用"}）`,
            )
            .join("；")
        : "当前场景的通用准备事项",
    };
  });
}
export function differences(
  before: Answers,
  after: Answers,
  version: PlanData["contentVersion"] = contentVersion,
  catalogue?: readonly Task[],
) {
  const old = buildPlan(before, version, catalogue);
  const next = buildPlan(after, version, catalogue);
  return {
    added: next.filter(
      (t, i) =>
        t.applicability !== "excluded" && old[i].applicability === "excluded",
    ),
    removed: next.filter(
      (t, i) =>
        t.applicability === "excluded" && old[i].applicability !== "excluded",
    ),
  };
}
export function changeStatus(
  plan: PlanData,
  id: string,
  status: keyof typeof statusLabels,
  catalogue?: readonly Task[],
): PlanData {
  if (
    !buildPlan(plan.answers, plan.contentVersion, catalogue).some(
      (t) => t.id === id,
    )
  )
    throw new Error("未知任务");
  const previous = { ...plan.progress[id] };
  delete previous.completedVersion;
  return {
    ...plan,
    progress: {
      ...plan.progress,
      [id]: {
        ...previous,
        status,
        updatedAt: new Date().toISOString(),
        ...(status === "done" ? { completedVersion: plan.contentVersion } : {}),
      },
    },
  };
}
export function planData(plan: PlanData): PlanData {
  return {
    contentVersion: plan.contentVersion,
    answers: plan.answers,
    progress: plan.progress,
    ...(plan.workspace ? {workspace:plan.workspace} : {}),
  };
}

export function taskReadiness(plan: PlanData, catalogue?: readonly Task[]) {
  const matched = buildPlan(plan.answers, plan.contentVersion, catalogue);
  return matched.map((task) => {
    const blockers = (task.prerequisites ?? [])
      .map((id) => matched.find((t) => t.id === id))
      .filter(
        (t) =>
          t &&
          t.applicability !== "excluded" &&
          plan.progress[t.id]?.status !== "done",
      );
    return {
      ...task,
      blockers: blockers.map((t) => t!.title),
      ready:
        task.applicability === "applicable" &&
        blockers.length === 0 &&
        !["done", "waiting", "verify"].includes(
          plan.progress[task.id]?.status ?? "todo",
        ),
    };
  });
}

export function validateTaskDependencies(catalogue: readonly Task[]) {
  const ids = new Set(catalogue.map((task) => task.id));
  if (ids.size !== catalogue.length) throw new Error("任务编号重复");
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("前置事项存在循环");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of catalogue.find((task) => task.id === id)!
      .prerequisites ?? []) {
      if (!ids.has(dependency)) throw new Error("前置任务不存在");
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of catalogue) visit(task.id);
}

export function updateFollowup(
  plan: PlanData,
  id: string,
  patch: z.infer<typeof followupSchema>,
  catalogue?: readonly Task[],
): PlanData {
  if (
    !buildPlan(plan.answers, plan.contentVersion, catalogue).some(
      (task) => task.id === id,
    )
  )
    throw new Error("未知任务");
  const valid = followupSchema.parse(patch);
  return {
    ...plan,
    progress: {
      ...plan.progress,
      [id]: {
        ...plan.progress[id],
        status: plan.progress[id]?.status ?? "todo",
        ...valid,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}
export function followupTasks(plan: PlanData, catalogue?: readonly Task[]) {
  return buildPlan(plan.answers, plan.contentVersion, catalogue).filter(
    (task) => {
      const progress = plan.progress[task.id];
      return (
        task.applicability !== "excluded" &&
        progress &&
        progress.status !== "done" &&
        (["waiting", "verify"].includes(progress.status) ||
          !!progress.blockedReason?.trim() ||
          !!progress.nextAction?.trim())
      );
    },
  );
}
