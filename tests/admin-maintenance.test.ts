import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AdminMaintenance} from '../src/lib/admin-maintenance';
import {upstream} from '../content/moving';
test('隔离库：报告绑定审阅、未完成不可发布、任务串行与重启中断',async()=>{
 const url=new URL(process.env.DATABASE_URL!),name='lio_admin_'+randomUUID().replaceAll('-','').slice(0,12),admin=new Pool({connectionString:url.toString(),max:1});url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString(),max:3}),directory=mkdtempSync(join(tmpdir(),'lio-admin-db-'));
 try{
  await admin.query(`CREATE DATABASE "${name}"`);execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env:{...process.env,DATABASE_URL:url.toString()},stdio:'pipe'});
  const service=new AdminMaintenance(pool,directory),target='a'.repeat(40),report={base:upstream.commit,target,createdAt:'fixture',counts:{documents:1,entries:1},blockers:[],files:[{path:'docs/专题.md',change:'修改',beforeHash:'b'.repeat(64),afterHash:'c'.repeat(64),before:'原文',after:'新原文'}]};
  const path=join(directory,'content/updates',target);mkdirSync(path,{recursive:true});const text=JSON.stringify(report);writeFileSync(join(path,'review.json'),text);const hash=createHash('sha256').update(text).digest('hex');
  await pool.query('INSERT INTO source_versions(commit_id,metadata,manifest) VALUES($1,$2,$3)',[target,{},{}]);await pool.query('INSERT INTO content_candidates(commit_id,base_commit,report_hash,report) VALUES($1,$2,$3,$4)',[target,upstream.commit,hash,report]);
  const op={action:'publish',target,expected:upstream.commit,hash,note:'审核备注'};
  await assert.rejects(service.enqueue(op),/逐一审阅/);await assert.rejects(service.markReviewed(target,'wrong','docs/专题.md'),/报告已变化/);
  await service.markReviewed(target,hash,'docs/专题.md');await service.validate(op);
  const id=await service.enqueue(op);await assert.rejects(service.enqueue({action:'check'}),/已有维护任务/);
  Object.defineProperty(service,'execute',{value:async(args:string[])=>{assert.ok(args.includes('--approve-report'));assert.ok(args.includes(hash));return {ok:false,output:'模拟校验失败，未切换版本'};}});
  await service.runNext();const job=(await pool.query('SELECT * FROM content_admin_jobs WHERE id=$1',[id])).rows[0];assert.equal(job.status,'failed');assert.match(job.output,/未切换/);
  const next=await service.enqueue({action:'check'});await service.recover();assert.equal((await pool.query('SELECT status FROM content_admin_jobs WHERE id=$1',[next])).rows[0].status,'failed');
  writeFileSync(join(path,'review.json'),JSON.stringify({...report,createdAt:'changed'}));await assert.rejects(service.validate(op),/报告摘要已变化/);
 }finally{await pool.end();await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end();rmSync(directory,{recursive:true,force:true});}
});
