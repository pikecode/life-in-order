import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { searchKnowledge } from "../src/lib/content-db";
import { upstream } from "../content/moving";
const cases = [
  { query:"房东说墙脏了，要扣我的两千块钱，怎么办", path:"book/15-租房与买房.md", entry:1 },
  { query:"老板让我走人了，我要怎么维护自己的权益", path:"book/19-在职离职和工伤.md", entry:8 },
  { query:"每天躺在床上翻来覆去到半夜也睡不着", path:"book/03-不要浪费精力.md", entry:26 },
  { query:"孩子刚生下来，证件和保险应该怎么弄", path:"book/27-怀孕和生产.md", entry:14 },
  { query:"下个月去杭州工作，原来的房子没退，社保也不知道怎么办", path:"book/19-在职离职和工伤.md", entry:19 },
];
try {
  for (const sample of cases) {
    const start=performance.now();
    const result=await searchKnowledge(upstream.commit,sample.query,1,'','',true);
    assert.equal(result.semanticStatus,'ready','本地模型和完整索引需要就绪');
    assert.ok(result.entries.slice(0,5).some(entry=>entry.path===sample.path && entry.entry_number===sample.entry),`前五条未找到目标：${sample.query}`);
    console.log(JSON.stringify({query:sample.query,total:result.total,ms:Math.round(performance.now()-start),top:result.entries.slice(0,5).map(entry=>entry.data.title)}));
  }
  const unrelated=await searchKnowledge(upstream.commit,"用火星上的石头给飞船修一个曲速引擎",1,'','',true);
  assert.equal(unrelated.semanticStatus,'ready');
  assert.equal(unrelated.total,0,'明显超出知识范围时不强行匹配');
  console.log('5 个自然语言样例前五条命中；1 个范围外样例无匹配。此样本不代表真实准确率。');
} finally { await db.end(); }
