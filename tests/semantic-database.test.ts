import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { db } from '../src/lib/db';
import { embeddingConfig, embedTexts } from '../src/lib/embeddings';
import { buildEmbeddingIndex, semanticCandidates } from '../src/lib/semantic-search';
import { searchKnowledge } from '../src/lib/content-db';

test('语义索引幂等、模型隔离、章节过滤、混合匹配与故障回退', async (context) => {
  const enabled=await db.query("SELECT to_regclass('knowledge_embeddings') IS NOT NULL AS ready");
  if(!enabled.rows[0].ready) { context.skip('需先执行 npm run db:semantic'); await db.end(); return; }
  const commit=`semantic-test-${randomUUID()}`, previous={...process.env};
  let wrongModel=false, stall=false, malformed=false;
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/tags') return res.end(JSON.stringify({models:[{name:'fixture:latest',digest:wrongModel?'changed':'fixture-digest'}]}));
    if(stall) return;
    let body='';for await(const chunk of req) body+=chunk;
    const input=JSON.parse(body).input as string[];
    if(malformed) return res.end(JSON.stringify({embeddings:[[null]]}));
    res.end(JSON.stringify({embeddings:input.map(text=>text.includes('睡眠')?[0,1,0]:text.includes('租房押金')?[0.8,0.2,0]:[1,0,0])}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address || typeof address==='string') throw new Error('测试服务启动失败');
  try {
    process.env.EMBEDDING_URL=`http://127.0.0.1:${address.port}`;
    process.env.EMBEDDING_MODEL='fixture:latest';process.env.EMBEDDING_MODEL_DIGEST='fixture-digest';
    const config=embeddingConfig()!;
    await db.query('INSERT INTO source_versions(commit_id,metadata,manifest) VALUES($1,$2,$3)',[commit,{},{}]);
    for(const [path,number,title] of [['book/15-租房与买房.md',1,'押金返还'],['book/15-租房与买房.md',2,'租房押金'],['book/02-不要慢慢死.md',1,'睡眠建议']] as const)
      await db.query('INSERT INTO knowledge_entries(source_commit,path,entry_number,data) VALUES($1,$2,$3,$4)',[commit,path,number,{title,body:title}]);
    assert.equal((await semanticCandidates(commit,'房东扣我的钱',[])).status,'incomplete');
    assert.deepEqual(await buildEmbeddingIndex(db,config,commit),{total:3,inserted:3});
    assert.deepEqual(await buildEmbeddingIndex(db,config,commit),{total:3,inserted:0});
    const result=await searchKnowledge(commit,'房东扣我的钱',1,'housing','15',true);
    assert.equal(result.semanticStatus,'ready');assert.equal(result.total,2);
    assert.equal(result.entries[0].data.title,'押金返还');
    assert.ok(result.entries.every(entry=>entry.semantic_match && !entry.lexical_match && entry.path.startsWith('book/15-')));
    const hybrid=await searchKnowledge(commit,'押金',1,'housing','',true);
    assert.ok(hybrid.entries.every(entry=>entry.lexical_match && entry.semantic_match));
    assert.equal((await searchKnowledge(commit,'房东扣我的钱',1,'housing','15',false)).total,0);
    assert.equal((await searchKnowledge('other-version','房东扣我的钱',1,'','',true)).total,0);
    malformed=true;
    await assert.rejects(embedTexts(['query'],config),/向量无效/);
    malformed=false;stall=true;
    await assert.rejects(embedTexts(['query'],config,30));
    stall=false;
    wrongModel=true;
    await assert.rejects(embedTexts(['query'],config),/版本不匹配/);
    assert.equal((await searchKnowledge(commit,'押金',1,'housing','',true)).semanticStatus,'unavailable');
    wrongModel=false;
    process.env.EMBEDDING_MODEL_DIGEST='different-model';
    assert.equal((await semanticCandidates(commit,'押金',[])).status,'incomplete');
    process.env.EMBEDDING_MODEL_DIGEST='fixture-digest';
    process.env.EMBEDDING_URL='http://127.0.0.1:1';
    const fallback=await searchKnowledge(commit,'押金',1,'housing','15',true);
    assert.equal(fallback.semanticStatus,'unavailable');assert.equal(fallback.total,2);
    delete process.env.EMBEDDING_MODEL;
    assert.equal((await semanticCandidates(commit,'押金',[])).status,'disabled');
  } finally {
    process.env=previous;
    await db.query('DELETE FROM knowledge_embeddings WHERE source_commit=$1',[commit]);
    await db.query('DELETE FROM knowledge_entries WHERE source_commit=$1',[commit]);
    await db.query('DELETE FROM source_versions WHERE commit_id=$1',[commit]);
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await db.end();
  }
});
