import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {db} from '../src/lib/db';
import {embeddingConfig} from '../src/lib/embeddings';
import {buildDocumentEmbeddings,documentCandidates} from '../src/lib/document-search';
import {searchDocuments} from '../src/lib/documents';
test('文档语义索引按分段摘要更新、限定类型主题并回退',async(context)=>{
 if(!(await db.query("SELECT to_regclass('document_embeddings') AS ready")).rows[0].ready){context.skip('需迁移语义表');await db.end();return;}
 const commit='document-test-'+randomUUID(),previous={...process.env};let wrong=false;
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:'fixture',digest:wrong?'wrong':'fixture'}]}));
  let body='';for await(const chunk of req)body+=chunk;
  const {input}=JSON.parse(body);res.end(JSON.stringify({embeddings:input.map(()=>[1,0,0])}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 try{
  process.env.EMBEDDING_MODEL='fixture';process.env.EMBEDDING_MODEL_DIGEST='fixture';process.env.EMBEDDING_URL=`http://127.0.0.1:${address.port}`;
  const config=embeddingConfig()!;
  await db.query('INSERT INTO source_versions(commit_id,metadata,manifest) VALUES($1,$2,$3)',[commit,{},{}]);
  for(const [path,kind,topic] of [['article.md','article','housing'],['review.md','verification','family']]){
   await db.query(`INSERT INTO source_documents(source_commit,path,kind,title,markdown,introduction,topics,chapters,sha256,git_blob) VALUES($1,$2,$3,'原文','正文','',$4,'{}','fixture','fixture')`,[commit,path,kind,[topic]]);
   await db.query(`INSERT INTO document_chunks(source_commit,path,chunk_number,start_offset,end_offset,heading,text,content_hash) VALUES($1,$2,1,0,2,'','正文','fixture')`,[commit,path]);
  }
  assert.equal((await documentCandidates(commit,'自然语言','article','housing')).status,'incomplete');
  assert.deepEqual(await buildDocumentEmbeddings(db,config,commit),{inserted:2});assert.deepEqual(await buildDocumentEmbeddings(db,config,commit),{inserted:0});
  const result=await searchDocuments(commit,'自然语言','article','housing',1,true);assert.equal(result.semanticStatus,'ready');assert.deepEqual(result.entries.map(doc=>doc.path),['article.md']);
  assert.equal((await searchDocuments(commit,'自然语言','article','family',1,true)).total,0);
  await db.query("UPDATE document_chunks SET content_hash='changed' WHERE source_commit=$1 AND path='article.md'",[commit]);
  assert.equal((await documentCandidates(commit,'自然语言','article','housing')).status,'incomplete');assert.deepEqual(await buildDocumentEmbeddings(db,config,commit),{inserted:1});
  wrong=true;assert.equal((await searchDocuments(commit,'正文','article','',1,true)).semanticStatus,'unavailable');
  assert.equal((await searchDocuments(commit,'正文','article','',1,true)).total,1);
  delete process.env.EMBEDDING_MODEL;assert.equal((await documentCandidates(commit,'自然语言','article','')).status,'disabled');
 }finally{
  process.env=previous;
  await db.query('DELETE FROM document_embeddings WHERE source_commit=$1',[commit]);await db.query('DELETE FROM document_chunks WHERE source_commit=$1',[commit]);await db.query('DELETE FROM source_documents WHERE source_commit=$1',[commit]);await db.query('DELETE FROM source_versions WHERE commit_id=$1',[commit]);
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await db.end();
 }
});
