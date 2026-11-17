import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {db} from '../src/lib/db';
import {upstream} from '../content/moving';
import {searchKnowledge} from '../src/lib/content-db';
import {getDocument,getChapterPreviews,relatedChapters} from '../src/lib/documents';
import {knowledgeAdvice} from '../src/lib/knowledge-search';
import KnowledgeCard from '../src/app/knowledge/knowledge-card';
import DocumentCard from '../src/app/library/document-card';
import ChapterEnding from '../src/app/read/chapter-ending';

test('手册卡片：真实章节预览、折叠不计阅读、版本入口与内容类型分开',async()=>{
 try{
  const paths=['book/01-不要早死.md','book/10-恋爱和结婚划不划算.md'];
  const previews=await getChapterPreviews(upstream.commit,paths);
  assert.equal(previews[paths[0]].count,49);assert.deepEqual(previews[paths[0]].entries.map(entry=>entry.entry),[1,2]);
  assert.deepEqual(await getChapterPreviews(upstream.commit,[]),{});
  assert.deepEqual(await getChapterPreviews(upstream.commit,['not-present']),{});
  const result=await searchKnowledge(upstream.commit,'',1,'safety','01');
  assert.equal(previews[paths[0]].entries[0].title,result.entries[0].data.title);
  const card=renderToStaticMarkup(createElement(KnowledgeCard,{entry:result.entries.find(entry=>(knowledgeAdvice(entry.data.body)?.length??0)>90)!,terms:[],upstream}));
  assert.ok(card.includes('note-card'));assert.ok(card.includes('展开阅读'));assert.ok(card.includes('aria-expanded="false"'));assert.ok(card.includes('?source='+upstream.commit));assert.ok(!card.includes('data-reading-entry'));
  const shortCard=renderToStaticMarkup(createElement(KnowledgeCard,{entry:{...result.entries[0],data:{...result.entries[0].data,body:'- 说人话：简短的完整建议。'}},terms:[],upstream}));assert.ok(!shortCard.includes('展开阅读'));
  const advice=knowledgeAdvice(result.entries[0].data.body)!;assert.ok(advice.length>0);assert.equal(knowledgeAdvice('原文无此字段'),null);
  const document=await getDocument(upstream.commit,paths[0]);assert.ok(document);
  const chapter=renderToStaticMarkup(createElement(DocumentCard,{document:{...document,excerpt:document.introduction},preview:previews[paths[0]]}));
  assert.ok(chapter.includes('chapter-spine'));assert.ok(chapter.includes('49 条知识'));assert.ok(chapter.includes(result.entries[0].data.title));assert.ok(chapter.includes('/read/01/1?source='+upstream.commit));
  const article=await getDocument(upstream.commit,'docs/结婚划不划算.md');assert.ok(article);
  const feature=renderToStaticMarkup(createElement(DocumentCard,{document:{...article,excerpt:article.markdown}}));assert.ok(feature.includes('feature-card'));assert.ok(!feature.includes('chapter-spine'));
  const related=await relatedChapters(upstream.commit,['10']);assert.deepEqual(related.map(doc=>doc.path),[paths[1]]);assert.deepEqual(await relatedChapters(upstream.commit,[]),[]);
  const ending=renderToStaticMarkup(createElement(ChapterEnding,{title:'恋爱和结婚划不划算',articles:[{...article,excerpt:article.markdown}],next:{href:'#reading-17-1',title:'家庭常备药'}}));
  assert.ok(ending.includes('?source='+upstream.commit));assert.ok(ending.includes('#reading-17-1'));assert.ok(ending.includes('延伸阅读'));
 }finally{await db.end();}
});
