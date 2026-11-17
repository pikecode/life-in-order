import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import ReadingPage from '../src/app/read/[chapter]/[entry]/page';
import {upstream} from '../content/moving';
import {db} from '../src/lib/db';
import {getReadingBatch,getKnowledgeChapters} from '../src/lib/content-db';

test('连续阅读按章节合页，跨章保留逐条锚点和来源入口',async()=>{
 try{
  const render=async(chapter:string,entry:string)=>renderToStaticMarkup(await ReadingPage({params:Promise.resolve({chapter,entry}),searchParams:Promise.resolve({source:upstream.commit})}));
  const single=await render('12','1');
  assert.equal((single.match(/class="chapter-sheet"/g)??[]).length,1);
  assert.equal((single.match(/data-reading-entry="true"/g)??[]).length,8);
  for(let i=1;i<=8;i++)assert.ok(single.includes(`id="reading-12-${i}"`));
  assert.equal((single.match(/class="knowledge-details evidence-link"/g)??[]).length,8);
  assert.ok(single.includes('上游成本'));assert.ok(single.includes('完整原始条目'));
  assert.ok(single.includes(`?source=${upstream.commit}`));
  const next=await getReadingBatch(upstream.commit,'12',1);
  assert.equal(next?.upcoming.length,3);assert.deepEqual(next?.upcoming.map(item=>item.entry),[9,10,11]);
  for(const item of next!.upcoming)assert.ok(single.includes(item.title));
  const chapters=await getKnowledgeChapters(upstream.commit);
  const housing=chapters.find(chapter=>chapter.id==='15')!;
  const almostLast=await getReadingBatch(upstream.commit,'15',housing.count-9);
  assert.equal(almostLast?.upcoming.length,2);
  const end=await getReadingBatch(upstream.commit,'15',housing.count);
  assert.equal(end?.next,null);assert.deepEqual(end?.upcoming,[]);
  assert.ok(!(await render('15',String(housing.count))).includes('下一组内容预告'));
  const crossing=await render('10','20');
  assert.equal((crossing.match(/class="chapter-sheet"/g)??[]).length,2);
  for(let i=20;i<=23;i++)assert.ok(crossing.includes(`id="reading-10-${i}"`));
  for(let i=1;i<=4;i++)assert.ok(crossing.includes(`id="reading-17-${i}"`));
  assert.ok(crossing.includes('href="#reading-17-1"'));
 }finally{await db.end();}
});
