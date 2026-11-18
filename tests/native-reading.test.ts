import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReaderSettings from '../src/app/reader-settings';
import ReadingPosition from '../src/app/read/reading-position';
import ContinueReading from '../src/app/continue-reading';
import {generateMetadata as readingMetadata} from '../src/app/read/[chapter]/[entry]/page';
import {generateMetadata as documentMetadata} from '../src/app/library/[...path]/page';
import {db} from '../src/lib/db';
import {upstream} from '../content/moving';
test('设置入口关联原生浮层，首次渲染保留可用续读区域',()=>{
 const html=renderToStaticMarkup(createElement(ReaderSettings));
 const target=html.match(/popovertarget="([^"]+)"/i)?.[1];assert.ok(target);
 assert.ok(html.includes(`id="${target}"`));assert.ok(html.includes('popover="auto"'));
 assert.ok(html.includes('aria-pressed="true"'));assert.ok(!html.includes('<details'));
 const home=renderToStaticMarkup(createElement(ContinueReading));
 assert.ok(home.includes('continue-reading-slot'));assert.ok(home.includes('href="#home-topics"'));assert.ok(home.includes('下次接着读'));
});
test('章节定位首屏显示真实章节与条号，保留版本导航和本组范围',()=>{
 const html=renderToStaticMarkup(createElement(ReadingPosition,{positions:[{sourceCommit:upstream.commit,chapter:'12',entry:3,chapterTitle:'创业与做生意'}],topic:{id:'work',title:'工作与学习'},chapters:[{id:'12',title:'创业与做生意'}],range:{start:24,end:31,total:141}}));
 assert.ok(html.includes('reading-current-title'));assert.ok(html.includes('创业与做生意'));assert.ok(html.includes('第 3 条'));
 assert.ok(html.includes(`/read/12/1?source=${upstream.commit}`));assert.ok(html.includes('aria-current="location"'));assert.ok(html.includes('24–31 / 141'));
});
test('动态标题对应真实条目和文章，未公开来源不可借元数据访问',async()=>{
 try{
  const reading={params:Promise.resolve({chapter:'12',entry:'1'}),searchParams:Promise.resolve({source:upstream.commit})};
  assert.match((await readingMetadata(reading)).title,/只拿亏得起的钱/);
  const article={params:Promise.resolve({path:['docs','结婚划不划算.md']}),searchParams:Promise.resolve({source:upstream.commit})};
  assert.match((await documentMetadata(article)).title,/结婚划不划算/);
  await assert.rejects(documentMetadata({...article,searchParams:Promise.resolve({source:'0'.repeat(40)})}));
  await assert.rejects(readingMetadata({...reading,params:Promise.resolve({chapter:'99',entry:'1'})}));
 }finally{await db.end();}
});
