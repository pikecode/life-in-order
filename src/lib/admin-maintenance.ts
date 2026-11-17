import type {Pool} from 'pg';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {activeCommit} from './content-publication';
import {upstream} from '../../content/moving';
import {commitSchema,readMaintenanceReport} from './maintenance-report';
export async function migrateAdmin(pool:Pick<Pool,'query'>){
 await pool.query(`CREATE TABLE IF NOT EXISTS content_admin_checks(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),status text NOT NULL,target_commit text,message text NOT NULL,checked_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS content_admin_reviews(
   commit_id text NOT NULL,report_hash text NOT NULL,path text NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(commit_id,report_hash,path));
 CREATE TABLE IF NOT EXISTS content_admin_jobs(
   id uuid PRIMARY KEY,action text NOT NULL CHECK(action IN ('check','prepare','publish','rollback')),payload jsonb NOT NULL,
   status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),output text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);`);
}
export const operationSchema=z.object({action:z.enum(['check','prepare','publish','rollback']),target:commitSchema.optional(),expected:commitSchema.optional(),hash:z.string().regex(/^[a-f0-9]{64}$/).optional(),note:z.string().trim().max(900).optional()}).strict();
export type AdminOperation=z.infer<typeof operationSchema>;
export type AdminJob={id:string;action:AdminOperation['action'];payload:AdminOperation;status:'queued'|'running'|'succeeded'|'failed';output:string;created_at:Date;finished_at:Date|null};
export class AdminMaintenance {
 readonly reportsRoot:string;
 private running=false;
 constructor(readonly pool:Pool,readonly workdir:string){this.reportsRoot=resolve(workdir,'content/updates');}
 reports(){
  let directories:string[];try{directories=readdirSync(this.reportsRoot);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  return directories.filter(dir=>commitSchema.safeParse(dir).success).map(target=>{
   try{return {target,...readMaintenanceReport(this.reportsRoot,target),error:''};}catch{return {target,report:null,hash:'',error:'报告尚未完成或校验失败，请查看任务记录。'};}
  }).sort((a,b)=>(b.report?.createdAt??'').localeCompare(a.report?.createdAt??''));
 }
 report(target:string){return readMaintenanceReport(this.reportsRoot,target);}
 async reviewed(target:string,hash:string){return new Set((await this.pool.query<{path:string}>('SELECT path FROM content_admin_reviews WHERE commit_id=$1 AND report_hash=$2',[target,hash])).rows.map(r=>r.path));}
 async markReviewed(target:string,hash:string,path:string){
  const data=this.report(target);if(data.hash!==hash||!data.report.files.some(file=>file.path===path))throw new Error('报告已变化或文件无效，请重新审阅');
  await this.pool.query('INSERT INTO content_admin_reviews(commit_id,report_hash,path) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[target,hash,path]);
 }
 async validate(input:unknown){
  const op=operationSchema.parse(input);
  if(op.action==='check')return op;
  if(!op.target)throw new Error('缺少目标版本');
  if(op.action==='rollback'){
   if(op.target!==upstream.commit&&!(await this.pool.query('SELECT 1 FROM content_publication_events WHERE target_commit=$1',[op.target])).rowCount)throw new Error('只能回退到已发布的版本');
  }else{
   const data=this.report(op.target);
   if(data.report.blockers.length)throw new Error('报告存在阻断项，不能准备或发布');
   if(data.report.base!==await activeCommit(this.pool))throw new Error('线上版本已变化，请重新生成报告');
   if(op.action==='publish'){
    if(op.hash!==data.hash)throw new Error('报告摘要已变化');
    const reviewed=await this.reviewed(op.target,data.hash);if(data.report.files.some(file=>!reviewed.has(file.path)))throw new Error('请先逐一审阅全部变更文件');
    const row=(await this.pool.query('SELECT report_hash FROM content_candidates WHERE commit_id=$1',[op.target])).rows[0];
    if(row?.report_hash!==op.hash)throw new Error('请先准备并校验这个版本');
   }
  }
  if(['publish','rollback'].includes(op.action)){
   if(!op.note||!op.expected)throw new Error('需要审核备注和预期线上版本');
   if(op.expected!==await activeCommit(this.pool))throw new Error('线上版本已变化，请刷新后重试');
   if(op.expected===op.target)throw new Error('目标版本已在线，无需切换');
  }
  return op;
 }
 async enqueue(input:unknown){
  const op=await this.validate(input),client=await this.pool.connect();
  try{
   await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('life-in-order-admin-queue'))");
   if((await client.query("SELECT 1 FROM content_admin_jobs WHERE status IN ('queued','running')")).rowCount)throw new Error('已有维护任务在执行，请等待完成');
   const id=randomUUID();await client.query("INSERT INTO content_admin_jobs(id,action,payload,status) VALUES($1,$2,$3,'queued')",[id,op.action,op]);await client.query('COMMIT');return id;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async recover(){await this.pool.query("UPDATE content_admin_jobs SET status='failed',output=output||E'\\n管理服务重启，任务已中断；请核对线上状态后重试。',finished_at=now() WHERE status IN ('queued','running')");}
 async runNext(){
  if(this.running)return;this.running=true;
  try{
   const row=(await this.pool.query<AdminJob>("UPDATE content_admin_jobs SET status='running' WHERE id=(SELECT id FROM content_admin_jobs WHERE status='queued' ORDER BY created_at LIMIT 1) RETURNING *")).rows[0];
   if(!row)return;
   try{
    const op=await this.validate(row.payload),args:string[]=[op.action];
    if(op.target)args.push(op.target);
    if(op.expected)args.push('--expected',op.expected);
    if(op.hash)args.push('--approve-report',op.hash);
    if(op.note)args.push('--note','[网页管理员] '+op.note);
    if(op.action==='rollback')args.push('--confirm',op.target!);
    const result=await this.execute(args);
    await this.pool.query('UPDATE content_admin_jobs SET status=$2,output=$3,finished_at=now() WHERE id=$1',[row.id,result.ok?'succeeded':'failed',result.output]);
   }catch(error){await this.pool.query("UPDATE content_admin_jobs SET status='failed',output=$2,finished_at=now() WHERE id=$1",[row.id,error instanceof Error?error.message:'维护失败']);}
  }finally{this.running=false;}
 }
 private execute(args:string[]):Promise<{ok:boolean;output:string}>{
  return new Promise(resolve=>{
   const child=spawn(process.execPath,['--import','tsx','scripts/content-maintenance.ts',...args],{cwd:this.workdir,env:process.env,detached:true,stdio:['ignore','pipe','pipe']});
   let output='',timedOut=false;
   const collect=(chunk:Buffer)=>{output=(output+chunk.toString()).slice(-200000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
   const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid!,'SIGKILL');}catch{}},10*60*1000);
   child.once('error',()=>{clearTimeout(timer);resolve({ok:false,output:'无法启动维护命令，请检查管理服务配置。'});});
   child.once('close',code=>{clearTimeout(timer);resolve({ok:code===0&&!timedOut,output:output+(timedOut?'\n任务执行超时，已停止本任务进程。':'')});});
  });
 }
}
