import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createHash} from 'node:crypto';
import {sourceDocuments} from '../src/lib/source-documents';
import {documentChunks} from '../src/lib/document-chunks';
import {documentHref,resolveDocumentLink} from '../src/lib/document-links';
import SourceMarkdown,{documentHeadings,documentExcerpt} from '../src/app/library/markdown';
import {upstream} from '../content/moving';
import {db} from '../src/lib/db';
import {getDocument,searchDocuments,documentCounts,relatedArticles,searchChapterTitles} from '../src/lib/documents';
import {contentBundle,importContent} from '../src/lib/content-import';
test('完整来源、连续分段、目录与安全 Markdown 展示',()=>{
 const documents=sourceDocuments();assert.equal(documents.length,293);
 assert.deepEqual(['chapter','article','verification','reference'].map(kind=>documents.filter(doc=>doc.kind===kind).length),[34,9,244,6]);
 assert.equal(documents.reduce((sum,doc)=>sum+doc.chunks.length,0),1837);
 for(const doc of documents){let end=0;for(const chunk of doc.chunks){assert.equal(chunk.start,end);assert.ok(chunk.end>chunk.start);assert.equal(chunk.hash,createHash('sha256').update(chunk.text).digest('hex'));end=chunk.end;}assert.equal(end,doc.markdown.length);}
 const emoji='a'.repeat(1799)+'😀'+ 'b'.repeat(2000),chunks=documentChunks('表情',emoji);
 assert.equal(chunks.map(chunk=>emoji.slice(chunk.start,chunk.end)).join(''),emoji);
 assert.ok(chunks.every(chunk=>!/[\uD800-\uDBFF]$/.test(emoji.slice(chunk.start,chunk.end))));
 assert.equal(documentExcerpt('# 标题\n\n[← 回总目录](../README.md)\n\n阅读[正文](../book/a.md)。'),'阅读正文。');
 assert.deepEqual(documentHeadings('# 标题\n## 同名\n```md\n## 假标题\n```\n## 同名').map(item=>item.id),['标题','同名','同名-1']);
 const paths=new Set(documents.map(doc=>doc.path)),marriage='docs/结婚划不划算.md',book='book/10-恋爱和结婚划不划算.md';
 const resolve=(href:string)=>resolveDocumentLink(href,book,upstream.repository,upstream.commit,paths);
 assert.equal(resolve('../docs/结婚划不划算.md#婚姻'),documentHref(marriage)+'#%E5%A9%9A%E5%A7%BB');
 assert.equal(resolve(upstream.repository+'/blob/main/'+marriage),documentHref(marriage));
 assert.equal(resolve('#本章'),'#本章');
 assert.ok(resolve('../tools/build.js').includes('/blob/'+upstream.commit+'/tools/build.js'));
 const html=renderToStaticMarkup(React.createElement(SourceMarkdown,{path:book,upstream,markdown:'## 标题\n\n[专题](../docs/结婚划不划算.md)\n\n| 项目 | 值 |\n|---|---|\n| 阅读 | 全文 |\n\n<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)'}));
 assert.ok(html.includes('id="标题"'));assert.ok(html.includes('<table>'));assert.ok(html.includes(documentHref(marriage)));assert.ok(!html.includes('<script'));assert.ok(!html.includes('javascript:'));
});
test('完整长文入库、检索、分页、幂等及拒绝正文覆盖',async()=>{
 try {
 const bundle=contentBundle(),commit=bundle.upstream.commit,path='docs/结婚划不划算.md',expected=bundle.documents.find(doc=>doc.path===path)!;
 const doc=await getDocument(commit,path);assert.equal(doc?.markdown,expected.markdown);assert.equal(doc.sha256,expected.sha256);
 assert.equal(await getDocument(commit,'../README.md'),null);
 assert.equal(await getDocument(commit,"x' OR true --"),null);
 assert.deepEqual(await documentCounts(commit),{article:9,chapter:34,reference:6,verification:244});
 const chapterPath='book/01-不要早死.md';
 for(const title of ['不要早死','不要 早死','  不要早死  '])assert.ok((await searchChapterTitles(commit,title)).some(doc=>doc.path===chapterPath),title);
 for(const chapter of bundle.documents.filter(doc=>doc.kind==='chapter')) {
   const title=chapter.path.replace(/^book\/\d+-/,'').replace(/\.md$/,'');
   assert.ok((await searchChapterTitles(commit,title)).some(doc=>doc.path===chapter.path),title);
 }
 assert.deepEqual(await searchChapterTitles(commit,''),[]);
 assert.deepEqual(await searchChapterTitles(commit,'不要早死','housing'),[]);
 assert.deepEqual(await searchChapterTitles(commit,'不要早死','safety','15'),[]);
 assert.ok((await searchChapterTitles(commit,'不要早死','safety','01')).some(doc=>doc.path===chapterPath));
 assert.deepEqual(await searchChapterTitles(commit,"' OR true --"),[]);
 assert.deepEqual(await searchChapterTitles(commit,'%'),[]);
 const found=await searchDocuments(commit,'结婚划不划算','article');assert.equal(found.entries[0].path,path);
 const family=await relatedArticles(commit,'family','10');assert.ok(family.some(item=>item.path===path));
 assert.equal((await searchDocuments(commit,'','verification','',99999)).page,13);
 assert.equal((await searchDocuments(commit,"' OR true --",'article')).total,0);
 assert.equal((await searchDocuments(commit,'结婚划不划算','article','housing')).total,0);
 assert.ok((await searchDocuments(commit,'','chapter')).entries.every(item=>item.kind==='chapter'));
 const repeated=await importContent(db,bundle);assert.equal(repeated.insertedDocuments,0);assert.equal(repeated.insertedChunks,0);assert.equal(repeated.insertedEntries,0);
 const changed=structuredClone(bundle);changed.documents[0].markdown+='\n改文';
 await assert.rejects(importContent(db,changed),/摘要不符/);
 const changedChunk=structuredClone(bundle);changedChunk.documents[0].chunks[0].text+='改文';
 await assert.rejects(importContent(db,changedChunk),/分块不可覆盖/);
 assert.equal((await getDocument(commit,path))?.markdown,expected.markdown);
 }finally{await db.end();}
});
