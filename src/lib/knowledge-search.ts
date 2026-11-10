export const knowledgeTopics = [
  { id: "health", title: "身体与就医", chapters: ["02", "16", "24", "28", "34"] },
  { id: "work", title: "工作与学习", chapters: ["11", "12", "19", "23", "26", "31", "32"] },
  { id: "housing", title: "租房与买房", chapters: ["15"] },
  { id: "family", title: "家庭与照护", chapters: ["10", "17", "18", "20", "25", "27", "30", "33"] },
  { id: "money", title: "金钱与保障", chapters: ["05", "07"] },
  { id: "safety", title: "安全与权益", chapters: ["01", "08", "09", "13", "14", "21"] },
  { id: "daily", title: "日常与情绪", chapters: ["03", "04", "06", "22", "29"] },
];
export const commonQuestions = ["押金不给退", "被裁后怎么办", "医保断缴", "睡不好", "孩子出生办什么"];
// shortcut: 只维护有明确含义的整句别名，真实查询积累后再评估分词或语义检索。
const aliases: Record<string, string[]> = {
  "押金不给退": ["押金"], "房东不退押金": ["押金"],
  "被裁后怎么办": ["裁员", "失业", "被裁"], "丢工作": ["失业", "裁员"],
  "医保断缴": ["医保"], "睡不好": ["睡眠", "失眠"],
  "孩子出生办什么": ["出生证明", "出生医学证明", "新生儿", "出生登记"],
};
export function knowledgeSearchTerms(query: string) {
  const q = query.trim().slice(0, 500);
  return { query: q, terms: [...new Set([q, ...(aliases[q] ?? [])])].filter(Boolean),
    words: q.split(/\s+/).filter(Boolean) };
}
export function searchPattern(term: string) {
  return "%" + term.replace(/[\\%_]/g, "\\$&") + "%";
}
export function knowledgeExcerpt(body: string, terms: string[], limit = 160) {
  const plainLanguage = body.match(/^- 说人话：(.+)$/m)?.[1];
  const source = plainLanguage && !terms.some(term => body.toLocaleLowerCase().includes(term.toLocaleLowerCase())) ? plainLanguage : body;
  const clean = source.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#{1,6} .+$/gm, "").replace(/https?:\/\/[^\s>]+/g, "")
    .replace(/^[-*]\s*(说人话|备注|成本|收益|证据等级|来源)：/gm, "")
    .replace(/\s+/g, " ").trim();
  const hits = terms.map(term => clean.toLocaleLowerCase().indexOf(term.toLocaleLowerCase())).filter(i => i >= 0);
  const start = hits.length ? Math.max(0, Math.min(...hits) - 35) : 0;
  return (start ? "…" : "") + clean.slice(start, start + limit) + (clean.length > start + limit ? "…" : "");
}
export function highlightParts(text: string, terms: string[]) {
  if (!terms.length) return [{ text, match: false }];
  const escaped = [...terms].sort((a,b) => b.length-a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "giu");
  return text.split(pattern).filter(Boolean).map((part) => ({ text: part,
    match: terms.some(term => term.toLocaleLowerCase() === part.toLocaleLowerCase()) }));
}
