import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {contentBundle,importContent} from '../src/lib/content-import';
import {activeCommit,getPublicContent,verifyCandidate,switchPublication} from '../src/lib/content-publication';

test('隔离库：候选不公开、全量校验、审核摘要与并发保护、发布回退保留旧版',async()=>{
 const url=new URL(process.env.DATABASE_URL!),name='lio_publication_'+randomUUID().replaceAll('-','').slice(0,12);
 const admin=new Pool({connectionString:url.toString(),max:1});url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString(),max:2});
 const fixture=mkdtempSync(join(tmpdir(),'lio-maintenance-')),script=resolve('scripts/content-maintenance.ts');
 const run=(args:string[])=>execFileSync(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),script,...args],{cwd:fixture,env:{...process.env,DATABASE_URL:url.toString()},encoding:'utf8'});
 try{
  await admin.query(`CREATE DATABASE "${name}"`);
  execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env:{...process.env,DATABASE_URL:url.toString()},stdio:'pipe'});
  const base=contentBundle(),target='9'.repeat(40),candidate={...base,upstream:{...base.upstream,commit:target},releases:[]};
  const snapshotDir=join(fixture,'content/updates',target);cpSync('content/upstream',snapshotDir,{recursive:true});
  const manifest=JSON.parse(readFileSync(join(snapshotDir,'manifest.json'),'utf8')),inventory=JSON.parse(readFileSync(join(snapshotDir,'inventory.json'),'utf8'));
  manifest.commit=target;inventory.commit=target;inventory.checkedAt=base.upstream.syncedAt;
  writeFileSync(join(snapshotDir,'manifest.json'),JSON.stringify(manifest));writeFileSync(join(snapshotDir,'inventory.json'),JSON.stringify(inventory));
  const report=JSON.stringify({base:base.upstream.commit,target,createdAt:'fixture',files:[],counts:{documents:293,entries:772},blockers:[]},null,2)+'\n';
  writeFileSync(join(snapshotDir,'review.json'),report);
  const digest=createHash('sha256').update(report).digest('hex');
  assert.match(run(['prepare',target]),/线上未切换/);assert.match(run(['prepare',target]),/insertedDocuments: 0/);
  assert.throws(()=>run(['publish',target,'--expected',base.upstream.commit,'--approve-report','wrong','--note','未审核']),/必须通过/);
  await importContent(pool,candidate);
  assert.equal(await activeCommit(pool),base.upstream.commit);
  await assert.rejects(getPublicContent(target,pool),/未发布/);
  assert.equal((await getPublicContent(undefined,pool)).upstream.commit,base.upstream.commit);

  const client=await pool.connect();
  const attempt=async(overrides:Partial<Parameters<typeof switchPublication>[1]>={})=>{
   await client.query('BEGIN');try{await verifyCandidate(client,target,candidate.documents,candidate.entries);await switchPublication(client,{target,expected:base.upstream.commit,hash:digest,note:'隔离演练审核',backup:'fixture.dump',operation:'publish',...overrides});await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}
  };
  try{
   await assert.rejects(attempt({hash:'unapproved'}),/审核摘要/);
   await assert.rejects(attempt({expected:'8'.repeat(40)}),/线上版本已变化/);
   await pool.query("UPDATE source_documents SET markdown=markdown||'篡改' WHERE source_commit=$1 AND path=$2",[target,candidate.documents[0].path]);
   await assert.rejects(attempt(),/全文或元数据/);
   await pool.query('UPDATE source_documents SET markdown=$3 WHERE source_commit=$1 AND path=$2',[target,candidate.documents[0].path,candidate.documents[0].markdown]);
   assert.match(run(['publish',target,'--expected',base.upstream.commit,'--approve-report',digest,'--note','隔离审核发布']),/切换完成/);assert.equal(await activeCommit(pool),target);
   assert.equal((await getPublicContent(target,pool)).upstream.commit,target);
   assert.equal((await getPublicContent(base.upstream.commit,pool)).upstream.commit,base.upstream.commit);
   assert.match(run(['rollback',base.upstream.commit,'--expected',target,'--confirm',base.upstream.commit,'--note','隔离回退']),/切换完成/);
   assert.equal(await activeCommit(pool),base.upstream.commit);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM source_documents WHERE source_commit=$1',[target])).rows[0].n,293);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM content_publication_events')).rows[0].n,2);
  }finally{client.release();}
 }finally{await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end();rmSync(fixture,{recursive:true,force:true});}
});
