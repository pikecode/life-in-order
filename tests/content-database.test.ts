import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import {
  contentBundle,
  importContent,
  parseEntry,
} from "../src/lib/content-import";
import {
  getContent,
  getKnowledge,
  getKnowledgeChapters,
  getKnowledgeHighlights,
  getReadingEntry,
  getReadingBatch,
  searchKnowledge,
} from "../src/lib/content-db";
import { commonQuestions } from "../src/lib/knowledge-search";
import { contentVersion, tasks } from "../content/moving";
import { legacyTasks } from "../content/moving-legacy";
test("知识正文提取、数据库读取、幂等与不可覆盖发布版", async () => {
  try {
    const bundle = contentBundle();
    assert.equal(bundle.entries.length, 772);
    assert.equal(bundle.manifest.chapters.length, 34);
    for (const entry of bundle.entries) {
      assert.ok(entry.data.cost);
      assert.ok(entry.data.benefit);
      assert.ok(entry.data.evidence);
      assert.ok(entry.data.sources);
      if (!entry.data.sourceUrls.length)
        assert.match(entry.data.sources, /作者经验/);
    }
    assert.throws(() => parseEntry("### 1. 缺少依据\n- 成本：零", 1));
    assert.throws(() => parseEntry("### 2. 其他\n", 1));
    assert.equal(
      bundle.entries.filter((entry) => !entry.data.sourceUrls.length).length,
      5,
    );
    await importContent(db);
    const all = await searchKnowledge(bundle.upstream.commit);
    assert.equal(all.total, 772);
    assert.equal(all.entries.length, 20);
    const last = await searchKnowledge(bundle.upstream.commit, "", 99999);
    assert.equal(last.page, 39);
    assert.equal(last.entries.length, 12);
    const found = await searchKnowledge(bundle.upstream.commit, "社保");
    assert.ok(found.total > 0);
    assert.ok(
      found.entries.every((entry) =>
        (entry.data.title + entry.data.body).includes("社保"),
      ),
    );
    for (const question of commonQuestions) {
      assert.ok((await searchKnowledge(bundle.upstream.commit, question)).total > 0, question);
    }
    const ranked = await searchKnowledge(bundle.upstream.commit, "睡眠");
    assert.ok(ranked.entries[0].data.title.includes("睡眠"));
    let bodyOnlySeen = false;
    for (const entry of ranked.entries) {
      if (!entry.data.title.includes("睡眠")) bodyOnlySeen = true;
      else assert.equal(bodyOnlySeen, false, "正文匹配不得排在标题匹配前面");
    }
    const chapters = await getKnowledgeChapters(bundle.upstream.commit);
    const highlights=await getKnowledgeHighlights(bundle.upstream.commit);
    assert.equal(highlights.length,7);
    assert.equal(highlights.reduce((sum,topic)=>sum+topic.count,0),772);
    for(const topic of highlights) {
      assert.equal(topic.entries.length,2);
      for(const preview of topic.entries) {
        assert.ok(topic.chapters.includes(preview.chapter));
        assert.ok(bundle.entries.some(entry=>entry.path.slice(5,7)===preview.chapter&&entry.entry===preview.entry&&entry.data.title===preview.title));
      }
    }
    assert.equal(chapters.length, 34);
    assert.equal(chapters.reduce((sum, chapter) => sum + chapter.count, 0), 772);
    assert.deepEqual(chapters.find(chapter => chapter.id === "19"), { id: "19", title: "在职离职和工伤", count: 25 });
    const firstReading=await getReadingEntry(bundle.upstream.commit,"15",1);
    assert.equal(firstReading!.previous,null);
    assert.equal(firstReading!.next?.entry,2);
    assert.equal(firstReading!.position,1);
    assert.equal(firstReading!.total,18);
    const lastReading=await getReadingEntry(bundle.upstream.commit,"15",18);
    assert.equal(lastReading!.next,null);
    assert.equal(lastReading!.previous?.entry,17);
    const acrossPage=await getReadingEntry(bundle.upstream.commit,"02",20);
    assert.equal(acrossPage!.next?.entry,21,"阅读不受二十条列表分页限制");
    const acrossChapter=await getReadingEntry(bundle.upstream.commit,"02",47);
    assert.equal(acrossChapter!.next?.chapter,"16");
    assert.equal(acrossChapter!.next?.entry,1);
    const nextChapter=await getReadingEntry(bundle.upstream.commit,"16",1);
    assert.equal(nextChapter!.previous?.chapter,"02");
    assert.equal(nextChapter!.previous?.entry,47);
    assert.equal(nextChapter!.chapter_position,1);
    for(const [chapter,number] of [["00",1],["15",0],["15",99999],["15",1.5],["15' OR true --",1]] as const)
      assert.equal(await getReadingEntry(bundle.upstream.commit,chapter,number),null);
    assert.equal(await getReadingEntry("0".repeat(40),"15",1),null);
    const batch=await getReadingBatch(bundle.upstream.commit,"02",20);
    assert.equal(batch!.entries.length,8);
    assert.deepEqual(batch!.entries.map(item=>item.entry_number),[20,21,22,23,24,25,26,27]);
    assert.equal(batch!.next!.entry,28);
    assert.equal(batch!.previous!.entry,12);
    const crossBatch=await getReadingBatch(bundle.upstream.commit,"02",45);
    assert.deepEqual(crossBatch!.entries.map(item=>[item.path.slice(5,7),item.entry_number]),[["02",45],["02",46],["02",47],["16",1],["16",2],["16",3],["16",4],["16",5]]);
    assert.equal(crossBatch!.next!.entry,6);
    const shortBatch=await getReadingBatch(bundle.upstream.commit,"15",16);
    assert.equal(shortBatch!.entries.length,3);
    assert.equal(shortBatch!.next,null);
    assert.equal((await getReadingBatch(bundle.upstream.commit,"15",1))!.previous,null);
    assert.equal(await getReadingBatch(bundle.upstream.commit,"15",9999),null);
    const chapterOnly = await searchKnowledge(bundle.upstream.commit, "", 99, "", "19");
    assert.equal(chapterOnly.total, 25);
    assert.equal(chapterOnly.topic, "work");
    assert.equal(chapterOnly.page, 2);
    assert.ok(chapterOnly.entries.every(entry => entry.path.startsWith("book/19-")));
    const conflicting = await searchKnowledge(bundle.upstream.commit, "", 1, "housing", "19");
    assert.equal(conflicting.topic, "work");
    assert.equal(conflicting.total, 25);
    const invalidChapter = await searchKnowledge(bundle.upstream.commit, "", 1, "housing", "19' OR true --");
    assert.equal(invalidChapter.chapter, "");
    assert.equal(invalidChapter.total, 18);
    const chapterQuery = await searchKnowledge(bundle.upstream.commit, "押金", 1, "housing", "15");
    assert.ok(chapterQuery.total > 0);
    assert.ok(chapterQuery.entries.every(entry => entry.path.startsWith("book/15-")));
    const colloquial = await searchKnowledge(bundle.upstream.commit, "押金不给退");
    assert.ok(colloquial.total > 0);
    assert.ok(colloquial.entries[0].data.title.includes("押金"));
    const housing = await searchKnowledge(bundle.upstream.commit, "", 1, "housing");
    assert.equal(housing.total, 18);
    assert.ok(housing.entries.every(entry => entry.path.startsWith("book/15-")));
    assert.equal((await searchKnowledge(bundle.upstream.commit, "", 1, "unknown")).total, 772);
    const combined = await searchKnowledge(bundle.upstream.commit, "租房 押金");
    assert.ok(combined.total > 0);
    assert.ok(combined.entries.every(entry => ["租房", "押金"].every(word => (entry.data.title + entry.data.body).includes(word))));
    assert.equal((await searchKnowledge(bundle.upstream.commit, "不存在的知识", 1, "housing")).total, 0);
    const rental = await searchKnowledge(
      bundle.upstream.commit,
      "租房时押金的数额",
    );
    const deposit = rental.entries.find(
      (entry) =>
        entry.path === "book/15-租房与买房.md" && entry.entry_number === 1,
    );
    assert.ok(deposit);
    assert.deepEqual(
      deposit.scenarios.map((scene) => scene.id),
      ["moving", "rental"],
    );
    assert.equal(
      new Set(deposit.scenarios.map((scene) => scene.id)).size,
      deposit.scenarios.length,
    );
    assert.ok(all.entries.some((entry) => entry.scenarios.length === 0));
    const literal = await searchKnowledge(bundle.upstream.commit, "%");
    assert.ok(
      literal.entries.every((entry) =>
        (entry.data.title + entry.data.body).includes("%"),
      ),
    );
    assert.equal(
      (await searchKnowledge(bundle.upstream.commit, "' OR true --")).total,
      0,
    );
    assert.equal(
      (await getKnowledge(bundle.upstream.commit)).length,
      new Set(
        bundle.releases
          .flatMap((release) => release.tasks)
          .filter((task) => task.source?.chapter)
          .map((task) => `${task.source!.chapter}:${task.source!.entry}`),
      ).size,
    );
    const repeated = await importContent(db);
    assert.equal(repeated.imported, false);
    assert.equal(repeated.insertedEntries, 0);
    const changedScenario = structuredClone(bundle);
    changedScenario.releases.find(
      (release) => release.version === "rental-v1",
    )!.scenario.title = "不允许覆盖的场景";
    await assert.rejects(
      importContent(db, changedScenario),
      /场景配置不可覆盖/,
    );
    const incomplete = structuredClone(bundle);
    incomplete.manifest.files = incomplete.manifest.files.slice(1);
    await assert.rejects(
      importContent(db, incomplete),
      /来源快照不能删除或更改/,
    );
    assert.deepEqual((await getContent(contentVersion)).tasks, tasks);
    assert.deepEqual((await getContent("moving-v1")).tasks, legacyTasks);
    const changed = structuredClone(bundle);
    changed.entries.push({
      ...structuredClone(bundle.entries[0]),
      path: "__rollback_test__",
    });
    changed.releases[1].tasks = changed.releases[1].tasks.map((t, i) =>
      i === 0 ? { ...t, title: "不允许覆盖的改动" } : t,
    );
    await assert.rejects(importContent(db, changed), /不得覆盖/);
    assert.deepEqual((await getContent(contentVersion)).tasks, tasks);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM knowledge_entries WHERE path='__rollback_test__'",
        )
      ).rows[0].count,
      0,
    );
    const invalid = structuredClone(bundle);
    invalid.entries[0].data.cost = "修改已存在来源";
    await assert.rejects(importContent(db, invalid), /不可覆盖/);
    await assert.rejects(getContent("unknown-version"), /尚未导入/);
  } finally {
    await db.end();
  }
});
