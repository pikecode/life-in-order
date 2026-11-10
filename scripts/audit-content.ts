import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {db} from '../src/lib/db';
import {contentBundle} from '../src/lib/content-import';
import {contentHash,embeddingConfig,embeddingText} from '../src/lib/embeddings';
import inventory from '../content/upstream/inventory.json';

// 对账只读数据库；只有显式 --report 才写入本地公开来源报告。
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
try {
 const bundle=contentBundle(),commit=bundle.upstream.commit,failures:string[]=[];
 const check=(condition:boolean,message:string)=>{if(!condition)failures.push(message);};
 const compare=(expected:Map<string,unknown>,actual:Map<string,unknown>,label:string)=>{
   for(const [key,value] of expected)check(canonical(actual.get(key))===canonical(value),`${label}缺失或不符：${key}`);
   for(const key of actual.keys())check(expected.has(key),`${label}多余：${key}`);
 };
 // 从全部 blob 路径重建 Git 目录树，防止清单本身漏掉上游文件。
 type Directory=Map<string,Directory|string>;
 const root:Directory=new Map();
 for(const file of inventory.files){let dir=root;const parts=file.path.split('/');for(const part of parts.slice(0,-1)){if(!dir.has(part))dir.set(part,new Map());dir=dir.get(part) as Directory;}dir.set(parts.at(-1)!,file.gitBlob);}
 const treeHash=(dir:Directory):string=>{
   const entries=[...dir].sort(([a,av],[b,bv])=>Buffer.compare(Buffer.from(a+(av instanceof Map?'/':'')),Buffer.from(b+(bv instanceof Map?'/':''))));
   const bytes=Buffer.concat(entries.map(([name,value])=>Buffer.concat([Buffer.from(`${value instanceof Map?'40000':'100644'} ${name}\0`),Buffer.from(value instanceof Map?treeHash(value):value,'hex')])));
   return createHash('sha1').update(`tree ${bytes.length}\0`).update(bytes).digest('hex');
 };
 check(treeHash(root)===inventory.tree,'全部来源路径不能重建固定 Git 目录树');
 let remoteHead:string|null=null;
 if(process.argv.includes('--upstream')){
  try {
   remoteHead=execFileSync('git',['ls-remote',bundle.upstream.repository+'.git','refs/heads/main'],{encoding:'utf8',timeout:30000}).trim().split(/\s/)[0];
   check(remoteHead===commit,'上游 main 已变动，需要按新提交重新同步');
  }catch{check(false,'上游 main 引用核对失败（网络或超时），不能确认当前最新提交');}
 }
 const storedVersion=(await db.query('SELECT manifest FROM source_versions WHERE commit_id=$1',[commit])).rows[0];
 check(canonical(storedVersion?.manifest)===canonical(bundle.manifest),'数据库来源清单不符');
 const storedDocs=(await db.query('SELECT path,kind,title,markdown,introduction,topics,chapters,sha256,git_blob FROM source_documents WHERE source_commit=$1',[commit])).rows;
 compare(new Map(bundle.documents.map(({chunks,gitBlob,...doc})=>[doc.path,{...doc,git_blob:gitBlob}])),new Map(storedDocs.map(doc=>[doc.path,doc])),'文档');
 const storedEntries=(await db.query('SELECT path,entry_number,data FROM knowledge_entries WHERE source_commit=$1',[commit])).rows;
 compare(new Map(bundle.entries.map(entry=>[`${entry.path}:${entry.entry}`,entry.data])),new Map(storedEntries.map(entry=>[`${entry.path}:${entry.entry_number}`,entry.data])),'短知识');
 const expectedChunks=new Map<string,unknown>();
 for(const document of bundle.documents){let end=0;for(const chunk of document.chunks){
   check(chunk.start===end&&chunk.end>chunk.start,`分段不连续：${document.path}:${chunk.number}`);end=chunk.end;
   expectedChunks.set(`${document.path}:${chunk.number}`,{path:document.path,chunk_number:chunk.number,start_offset:chunk.start,end_offset:chunk.end,heading:chunk.heading,text:chunk.text,content_hash:chunk.hash});
 }check(end===document.markdown.length,`分段未覆盖全文：${document.path}`);}
 const storedChunks=(await db.query('SELECT path,chunk_number,start_offset,end_offset,heading,text,content_hash FROM document_chunks WHERE source_commit=$1',[commit])).rows;
 compare(expectedChunks,new Map(storedChunks.map(chunk=>[`${chunk.path}:${chunk.chunk_number}`,chunk])),'分段');
 const config=embeddingConfig();assert.ok(config,'核对语义覆盖需要配置当前模型');
 const vectorCoverage=async(table:string,number:string,expected:Map<string,string>)=>{
   const rows=(await db.query(`SELECT path,${number} AS number,content_hash,vector_dims(embedding) AS dimensions FROM ${table} WHERE source_commit=$1 AND model_id=$2`,[commit,config.id])).rows;
   compare(expected,new Map(rows.map(row=>[`${row.path}:${row.number}`,row.content_hash])),table);
   check(rows.length>0&&rows.every(row=>row.dimensions===rows[0].dimensions),`${table}向量维度不一致`);
   return {expected:expected.size,indexed:rows.length,dimensions:rows[0]?.dimensions??null};
 };
 const entriesIndex=await vectorCoverage('knowledge_embeddings','entry_number',new Map(bundle.entries.map(entry=>[`${entry.path}:${entry.entry}`,contentHash(embeddingText(entry.data))])));
 const documentsIndex=await vectorCoverage('document_embeddings','chunk_number',new Map(storedChunks.map(chunk=>[`${chunk.path}:${chunk.chunk_number}`,chunk.content_hash])));
 check(entriesIndex.dimensions===documentsIndex.dimensions,'两类当前模型向量维度不一致');
 const kinds=Object.fromEntries(['chapter','article','verification','reference'].map(kind=>[kind,bundle.documents.filter(doc=>doc.kind===kind).length]));
 const report={checkedAt:new Date().toISOString(),commit,tree:inventory.tree,remoteHead,scope:"fixed-source-commit",upstreamCheck:process.argv.includes('--upstream')?'requested':'not-requested',passed:failures.length===0,sourceFiles:inventory.files.length,included:bundle.documents.length,excluded:inventory.files.filter(file=>file.status==='excluded'),kinds,shortEntries:storedEntries.length,chunks:storedChunks.length,index:{entries:entriesIndex,documents:documentsIndex},failures,files:bundle.documents.map(doc=>({path:doc.path,kind:doc.kind,sha256:doc.sha256,gitBlob:doc.gitBlob,bytes:Buffer.byteLength(doc.markdown),chunks:doc.chunks.length,matched:!failures.some(message=>message.includes(doc.path))}))};
 if(process.argv.includes('--report')){mkdirSync('docs/reports',{recursive:true});writeFileSync('docs/reports/source-coverage.json',JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({...report,excluded:report.excluded.length,files:report.files.length},null,2));
 if(failures.length)process.exitCode=1;
} finally {await db.end();}
