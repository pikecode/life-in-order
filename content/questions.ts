export const workflowQuestions = [
  {
    key: "employment",
    title: "原工作的状态是？",
    options: [
      ["employed", "还在职，准备离职"],
      ["left", "已经离职"],
      ["firstJob", "首次入职，没有原单位"],
      ["unknown", "暂不确定"],
    ],
  },
  {
    key: "newJob",
    title: "新工作的进展是？",
    options: [
      ["searching", "还在找工作"],
      ["offer", "已拿到录用通知，尚未入职"],
      ["joined", "已经入职"],
      ["unknown", "暂不确定"],
    ],
  },
  {
    key: "relocation",
    title: "搬迁进行到哪一步？",
    options: [
      ["preparing", "准备搬过去"],
      ["arrived", "已到新城市"],
      ["unknown", "暂不确定"],
    ],
  },
  {
    key: "transferInsurance",
    title: "需要核实原有养老或医保关系的跨城衔接吗？",
    options: [
      ["yes", "需要"],
      ["no", "没有原有关系需要衔接"],
      ["unknown", "暂不确定，先列出核实事项"],
    ],
  },
  {
    key: "localBenefits",
    title: "有当地住房、落户或积分申请计划吗？",
    options: [
      ["yes", "有计划"],
      ["no", "暂时没有"],
      ["unknown", "暂不确定"],
    ],
  },
  {
    key: "nonCompete",
    title: "签过竞业约定，或不确定是否受约束吗？",
    options: [
      ["yes", "签过，需要核实"],
      ["no", "确认没有"],
      ["unknown", "暂不确定"],
    ],
  },
] as const;
