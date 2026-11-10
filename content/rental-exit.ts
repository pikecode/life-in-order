export const rentalExitTaskIds = ["rent-handover", "rent-return", "rent-dispute"] as const;
export const rentalExitDirections = [
  {id:"handover",title:"先把退租交接安排好",description:"核对房屋、读数、钥匙和双方记录。",tasks:["rent-handover","rent-return"]},
  {id:"deposit",title:"先弄清押金怎么结算",description:"查看约定、交接记录与结算明细。",tasks:["rent-handover","rent-return"]},
  {id:"dispute",title:"已经有扣费或押金争议",description:"先确认事实，再整理记录和处理渠道。",tasks:["rent-handover","rent-return","rent-dispute"]},
] as const;
