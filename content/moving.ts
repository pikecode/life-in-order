import { previousTasks } from "./moving-v2";
export type Task = {
  id: string;
  title: string;
  stage: number;
  condition?: "oldLease" | "needHousing";
  when?: Partial<
    Record<
      | "employment"
      | "newJob"
      | "relocation"
      | "transferInsurance"
      | "localBenefits"
      | "nonCompete"
      | "rentalStage"
      | "rentalAgent"
      | "rentalAgency"
      | "depositDispute"
      | "joblossStage"
      | "owedWages"
      | "needsAid"
      | "birthStage"
      | "birthInsurance"
      | "birthDocuments"
      | "birthSupport",
      readonly string[]
    >
  >;
  prerequisites?: readonly string[];
  body: string;
  materials: readonly string[];
  contact: string;
  source?: {
    path?: string;
    section: string;
    item: number;
    chapter?: string;
    entry?: number;
  };
};
export const contentVersion = "moving-v3";
export const stages = ["离职交接", "找房搬家", "入职准备", "落地安顿"] as const;
export const upstream = {
  title: "高性价比人生指南",
  author: "eternity4719",
  repository: "https://github.com/eternity4719/HowToLiveBetter",
  commit: "dff814dcbb0a2e968acc0af48e418814655ba1df",
  syncedAt: "2026-11-09",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  scenarioPath: "docs/换工作、换城市之前.md",
  modifications:
    "精选、重写为行动任务；补充准备材料、确认对象与条件；不沿用上游数值作为个人适用性结论。",
} as const;
export const tasks: readonly Task[] = previousTasks
  .map<Task>((task) => ({
    ...task,
    id: `${task.id}-v3`,
    ...(task.id === "read-contract" ? { title: "核对并留存入职文件" } : {}),
    ...(task.id === "probation-check"
      ? { title: "确认合同、试用和参保安排" }
      : {}),
    when: {
      ...([
        "work-records",
        "exit-document",
        "return-access",
        "company-data",
      ].includes(task.id)
        ? { employment: ["employed", "left"] }
        : {}),
      ...(["read-contract", "probation-check", "commute-check"].includes(
        task.id,
      )
        ? { newJob: ["offer", "joined"] }
        : {}),
      ...(task.id === "insurance-transfer"
        ? { newJob: ["offer", "joined"], transferInsurance: ["yes"] }
        : {}),
      ...(task.id === "local-eligibility" ? { localBenefits: ["yes"] } : {}),
      ...(task.id === "social-contact" ? { relocation: ["arrived"] } : {}),
    },
    prerequisites:
      task.id === "return-access"
        ? ["work-records-v3", "company-data-v3"]
        : task.id === "probation-check"
          ? ["read-contract-v3"]
          : task.id === "rental-contract"
            ? ["commute-check-v3"]
            : [],
  }))
  .concat([
    {
      id: "competition-check-v3",
      title: "确认竞业约定是否影响新岗位",
      stage: 0,
      body: "整理自己签署的竞业与保密文件，核对约束范围、补偿约定和新岗位情况。不能确定是否适用时，向原公司及专业人士核实，不自行推断约定有效或无效。",
      materials: ["竞业与保密文件", "新岗位说明"],
      contact: "原公司人事及劳动法律专业人士",
      when: { employment: ["employed", "left"], nonCompete: ["yes"] },
      source: {
        section: "递辞职之前",
        item: 1,
        chapter: "book/11-程序员和技术人容易踩的红线.md",
        entry: 12,
      },
      prerequisites: [],
    },
  ]);
export function upstreamUrl(
  path: string,
  source: Pick<typeof upstream, "repository" | "commit"> = upstream,
) {
  return `${source.repository}/blob/${source.commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
