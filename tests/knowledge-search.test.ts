import { test } from "node:test";
import assert from "node:assert/strict";
import { knowledgeTopics, knowledgeSearchTerms, knowledgeExcerpt, highlightParts, searchPattern } from "../src/lib/knowledge-search";
test("主题完整且不重复，口语别名范围明确", () => {
  const chapters = knowledgeTopics.flatMap(topic => topic.chapters).sort();
  assert.deepEqual(chapters, Array.from({length: 34}, (_, i) => String(i+1).padStart(2,"0")));
  assert.deepEqual(knowledgeSearchTerms(" 押金不给退 ").terms, ["押金不给退", "押金"]);
  assert.deepEqual(knowledgeSearchTerms("未知问题").terms, ["未知问题"]);
  assert.deepEqual(knowledgeSearchTerms("租房  押金").words, ["租房", "押金"]);
  assert.equal(knowledgeSearchTerms("x".repeat(520)).query.length, 500);
  assert.equal(searchPattern("%_\\"), "%\\%\\_\\\\%");
});
test("摘要保留命中上下文并移除标签，高亮按纯文本处理", () => {
  const body = "### 1. 标题\n<!-- 成本标签: 内部 -->\n- 成本：低\n- 说人话：先写好押金返还时间。";
  assert.equal(knowledgeExcerpt(body, []), "先写好押金返还时间。");
  assert.ok(!knowledgeExcerpt(body, ["押金"]).includes("<!--"));
  assert.match(knowledgeExcerpt("前".repeat(200)+"押金返还"+"后".repeat(200), ["押金"]), /^….*押金.*…$/);
  const raw = "<script>alert(1)</script> C++ [押金]";
  const parts = highlightParts(raw, ["C++", "[押金]"]);
  assert.equal(parts.map(p => p.text).join(""), raw);
  assert.deepEqual(parts.filter(p => p.match).map(p => p.text), ["C++", "[押金]"]);
  assert.deepEqual(highlightParts("医保", []), [{text:"医保",match:false}]);
});
