import { contentVersion, tasks, stages } from "./moving";
import { previousVersion, previousTasks } from "./moving-v2";
import { legacyVersion, legacyTasks } from "./moving-legacy";
import { workflowQuestions } from "./questions";
import {
  additionalScenarios,
  type ScenarioMetadata,
} from "./additional-scenarios";
export type { ScenarioMetadata } from "./additional-scenarios";
const housingQuestions = [
  {
    key: "oldLease",
    title: "旧住处需要退租吗？",
    options: [
      ["yes", "需要"],
      ["no", "不需要"],
      ["unknown", "暂不确定"],
    ],
  },
  {
    key: "needHousing",
    title: "新城市还需要找住处吗？",
    options: [
      ["yes", "需要"],
      ["no", "不需要"],
      ["unknown", "暂不确定"],
    ],
  },
] as const;
const moving: ScenarioMetadata = {
  id: "moving",
  version: contentVersion,
  title: "换工作与跨城生活",
  description: "从离职交接到新城市安顿，知道下一步。",
  intro: "新生活，一步步安顿好。",
  cityLabel: "目的城市",
  dateLabel: "计划入职日期",
  stages,
  questions: [...workflowQuestions, ...housingQuestions],
};
export const currentScenarios: readonly {
  metadata: ScenarioMetadata;
  tasks: readonly import("./moving").Task[];
}[] = [{ metadata: moving, tasks }, ...additionalScenarios];
export const releases: readonly {
  metadata: ScenarioMetadata;
  tasks: readonly import("./moving").Task[];
}[] = [
  {
    metadata: {
      ...moving,
      version: legacyVersion,
      questions: housingQuestions,
    },
    tasks: legacyTasks,
  },
  {
    metadata: {
      ...moving,
      version: previousVersion,
      questions: housingQuestions,
    },
    tasks: previousTasks,
  },
  ...currentScenarios,
];
export const scenarioForVersion = (version: string) =>
  releases.find((release) => release.metadata.version === version);
export const allQuestions = releases.flatMap(
  (release) => release.metadata.questions,
);
