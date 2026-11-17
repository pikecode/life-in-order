import type {Pool,PoolClient} from 'pg';
import {db} from './db';
import {upstream} from '../../content/moving';
import initialInventory from '../../content/upstream/inventory.json';
import type {SourceDocument} from './source-documents';
export class UnpublishedSourceError extends Error {}
export async function migratePublication(pool:Pick<Pool,'query'>) {
 await pool.query(`CREATE TABLE IF NOT EXISTS content_candidates(
   commit_id text PRIMARY KEY REFERENCES source_versions(commit_id),base_commit text NOT NULL REFERENCES source_versions(commit_id),
   report_hash text NOT NULL,report jsonb NOT NULL,prepared_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS content_publication(id boolean PRIMARY KEY DEFAULT true CHECK(id),commit_id text NOT NULL REFERENCES source_versions(commit_id));
 CREATE TABLE IF NOT EXISTS content_publication_events(
   id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,previous_commit text NOT NULL,target_commit text NOT NULL REFERENCES source_versions(commit_id),
   operation text NOT NULL CHECK(operation IN ('publish','rollback')),note text NOT NULL,report_hash text NOT NULL,backup_file text NOT NULL,
   created_at timestamptz NOT NULL DEFAULT now());
 INSERT INTO content_publication(id,commit_id) VALUES(true,'${upstream.commit}') ON CONFLICT DO NOTHING;`);
}
export async function activeCommit(pool:Pick<Pool,'query'>=db) {
 return (await pool.query<{commit_id:string}>('SELECT commit_id FROM content_publication WHERE id=true')).rows[0]?.commit_id??upstream.commit;
}
export async function getPublicContent(source?:string,pool:Pick<Pool,'query'>=db) {
 const commit=source??await activeCommit(pool);
 if(!/^[a-f0-9]{40}$/.test(commit))throw new UnpublishedSourceError('来源版本无效');
 // 仅当前版本、初始版本和实际发布过的版本可公开读取，准备版本不泄露到前台。
 const {rows}=await pool.query<{metadata:typeof upstream;manifest:{files:{path:string}[];inventory?:typeof initialInventory;checkedAt?:string}}>(`SELECT metadata,manifest FROM source_versions s WHERE commit_id=$1 AND
 (commit_id=$2 OR EXISTS(SELECT 1 FROM content_publication WHERE commit_id=s.commit_id) OR EXISTS(SELECT 1 FROM content_publication_events WHERE target_commit=s.commit_id))`,[commit,upstream.commit]);
 if(!rows[0])throw new UnpublishedSourceError('来源版本未发布');
 return {upstream:rows[0].metadata,manifest:{...rows[0].manifest,...(commit===upstream.commit?{inventory:initialInventory,checkedAt:initialInventory.checkedAt}:{})}};
}
export async function verifyCandidate(client:Pick<PoolClient,'query'>,commit:string,documents:SourceDocument[],entries:{path:string;entry:number;data:unknown}[]) {
 const stored=(await client.query('SELECT path,markdown,kind,title,introduction,topics,chapters,sha256,git_blob FROM source_documents WHERE source_commit=$1',[commit])).rows;
 if(stored.length!==documents.length)throw new Error('文档数量不一致');
 const canonical=(v:unknown)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 for(const doc of documents){const {chunks,gitBlob,...data}=doc;const row=stored.find(row=>row.path===doc.path);if(canonical(row)!==canonical({...data,git_blob:gitBlob}))throw new Error(`数据库全文或元数据不一致：${doc.path}`);}
 const knowledge=(await client.query('SELECT path,entry_number,data FROM knowledge_entries WHERE source_commit=$1',[commit])).rows;
 if(knowledge.length!==entries.length)throw new Error('短知识数量不一致');
 for(const entry of entries)if(canonical(knowledge.find(row=>row.path===entry.path&&row.entry_number===entry.entry)?.data)!==canonical(entry.data))throw new Error('短知识不一致');
 const chunks=(await client.query('SELECT path,chunk_number,start_offset,end_offset,heading,text,content_hash FROM document_chunks WHERE source_commit=$1',[commit])).rows;
 const expected=documents.flatMap(doc=>doc.chunks.map(c=>({path:doc.path,chunk_number:c.number,start_offset:c.start,end_offset:c.end,heading:c.heading,text:c.text,content_hash:c.hash})));
 const key=(row:{path:string;chunk_number:number})=>`${row.path}:${row.chunk_number}`;
 const map=new Map(chunks.map(c=>[key(c),c]));
 if(chunks.length!==expected.length||expected.some(c=>canonical(map.get(key(c)))!==canonical(c)))throw new Error('文档分段不一致');
}
export async function switchPublication(client:PoolClient,args:{target:string;expected:string;hash:string;note:string;backup:string;operation:'publish'|'rollback'}) {
 await client.query("SELECT pg_advisory_xact_lock(hashtext('life-in-order-publication'))");
 const current=await activeCommit(client);
 if(current!==args.expected)throw new Error('线上版本已变化，请重新检查');
 if(current===args.target)throw new Error('目标已经在线，无需切换');
 const candidate=(await client.query('SELECT base_commit,report_hash FROM content_candidates WHERE commit_id=$1',[args.target])).rows[0];
 if(args.operation==='publish'&&(!candidate||candidate.base_commit!==current||candidate.report_hash!==args.hash))throw new Error('候选版本或审核摘要与当前线上版本不符');
 if(args.operation==='rollback'&&args.target!==upstream.commit&&!(await client.query('SELECT 1 FROM content_publication_events WHERE target_commit=$1',[args.target])).rowCount)throw new Error('只能回退到实际发布过的版本');
 await client.query('UPDATE content_publication SET commit_id=$1 WHERE id=true',[args.target]);
 await client.query('INSERT INTO content_publication_events(previous_commit,target_commit,operation,note,report_hash,backup_file) VALUES($1,$2,$3,$4,$5,$6)',[current,args.target,args.operation,args.note,args.hash,args.backup]);
}
