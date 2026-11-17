import 'dotenv/config';
import type {PoolClient} from 'pg';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {db} from '../src/lib/db';
import {upstream} from '../content/moving';
import {contentBundle,importContent,parseEntry} from '../src/lib/content-import';
import {sourceDocuments,isContentFile} from '../src/lib/source-documents';
import {knowledgeTopics} from '../src/lib/knowledge-search';
import {activeCommit,verifyCandidate,switchPublication} from '../src/lib/content-publication';
import {backupDatabase} from './database-tools';
import {readMaintenanceReport,type MaintenanceReport} from '../src/lib/maintenance-report';
import baseManifest from '../content/upstream/manifest.json';
import baseInventory from '../content/upstream/inventory.json';

const root=resolve('content/updates'),cache=join(root,'.git-cache');
const hash=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const command=process.argv[2],args=process.argv.slice(3);
function option(name:string){const i=args.indexOf(name);return i<0?'':args[i+1]??'';}
function commit(value:string){if(!/^[a-f0-9]{40}$/.test(value))throw new Error('需要完整的 40 位提交摘要');return value;}
function git(...args:string[]){return execFileSync('git',['-c','http.version=HTTP/1.1','--git-dir',cache,...args],{timeout:120000,maxBuffer:30*1024*1024});}
function directory(id:string){return join(root,commit(id));}
function snapshot(id:string){
 const dir=directory(id),manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')) as typeof baseManifest;
 const inventory=JSON.parse(readFileSync(join(dir,'inventory.json'),'utf8')) as typeof baseInventory;
 if(manifest.commit!==id||inventory.commit!==id)throw new Error('快照版本不一致');
 const documents=sourceDocuments(dir,manifest,inventory);
 const entries=documents.filter(doc=>doc.kind==='chapter').flatMap(doc=>{
   if(!/^book\/\d{2}-[^/]+\.md$/.test(doc.path)||!knowledgeTopics.some(t=>t.chapters.includes(doc.path.slice(5,7))))throw new Error('新增或改变章节分类，需要先更新主题映射');
   const numbers=[...doc.markdown.matchAll(/^### (\d+)\. /gm)].map(m=>Number(m[1]));
   if(!numbers.length||numbers.some((n,i)=>n!==i+1))throw new Error('条号不连续或重复：'+doc.path);
   return numbers.map(entry=>({path:doc.path,entry,data:parseEntry(doc.markdown,entry)}));
 });
 const declared=Number(documents.find(doc=>doc.path==='README.md')?.markdown.match(/(\d+) 条建议/)?.[1]);
 if(!declared||declared!==entries.length)throw new Error('README 声明条目数量不符');
 if(new Set(documents.filter(d=>d.kind==='chapter').map(d=>d.path.slice(5,7))).size!==34)throw new Error('章节范围发生变化，需要人工调整解析规则');
 return {dir,manifest,inventory,documents,entries};
}
type Report=MaintenanceReport;
function reportFor(s:ReturnType<typeof snapshot>,base:string,oldDocs:{path:string;markdown:string;sha256:string}[],oldManifest:{files:{path:string;sha256:string}[]}){
 const before=new Map(oldDocs.map(d=>[d.path,d])),after=new Map(s.documents.map(d=>[d.path,d]));
 const paths=[...new Set([...before.keys(),...after.keys()])].sort();
 const files=paths.filter(p=>before.get(p)?.sha256!==after.get(p)?.sha256).map<Report['files'][number]>(path=>({path,change:!before.has(path)?'新增':!after.has(path)?'删除':'修改',beforeHash:before.get(path)?.sha256??null,afterHash:after.get(path)?.sha256??null,before:before.get(path)?.markdown??null,after:after.get(path)?.markdown??null}));
 const blockers=files.filter(f=>['LICENSE','LICENSE-CODE'].includes(f.path)||f.path==='README.md'&&f.before?.split('## 许可')[1]!==f.after?.split('## 许可')[1]).map(f=>'许可说明变化，需要先人工核实并更新导入规则：'+f.path);
 if(oldManifest.files.some(f=>!before.has(f.path)))throw new Error('线上快照文件与数据库不一致');
 const report:Report={base,target:s.manifest.commit,createdAt:new Date().toISOString(),files,counts:{documents:s.documents.length,entries:s.entries.length},blockers};
 return report;
}
function loadReport(id:string){const s=snapshot(id),data=readMaintenanceReport(root,id);return {s,report:data.report,digest:data.hash};}
async function validateReport(s:ReturnType<typeof snapshot>,report:Report){
 const source=(await db.query('SELECT manifest FROM source_versions WHERE commit_id=$1',[report.base])).rows[0];
 if(!source)throw new Error('报告基准版本不存在');
 const docs=(await db.query('SELECT path,markdown,sha256 FROM source_documents WHERE source_commit=$1',[report.base])).rows;
 const rebuilt=reportFor(s,report.base,docs,source.manifest);rebuilt.createdAt=report.createdAt;
 if(JSON.stringify(rebuilt)!==JSON.stringify(report))throw new Error('报告与原文不符，请重新检查更新');
 if(report.blockers.length)throw new Error(report.blockers.join('\n'));
}
async function recordCheck(status:string,message:string,target:string|null=null){await db.query('INSERT INTO content_admin_checks(id,status,target_commit,message) VALUES(true,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET status=excluded.status,target_commit=excluded.target_commit,message=excluded.message,checked_at=now()',[status,target,message]);}
let operationLock:PoolClient|undefined;
try {
 if(command!=='status'){operationLock=await db.connect();const lock=await operationLock.query("SELECT pg_try_advisory_lock(hashtext('life-in-order-maintenance-operation')) AS locked");if(!lock.rows[0].locked)throw new Error('另一个维护任务正在运行，请稍后重试');}
 if(command==='status'){
   console.log('线上版本：',await activeCommit());console.log('待发布版本：',(await db.query('SELECT commit_id,base_commit,report_hash,prepared_at FROM content_candidates ORDER BY prepared_at DESC LIMIT 10')).rows);
   console.log('最近发布记录：',(await db.query('SELECT previous_commit,target_commit,operation,note,created_at FROM content_publication_events ORDER BY id DESC LIMIT 10')).rows);
 }else if(command==='check'){
   await recordCheck('running','正在读取上游 main');
   mkdirSync(root,{recursive:true});
   if(!existsSync(cache))execFileSync('git',['init','--bare',cache],{stdio:'ignore'});
   git('fetch','--depth=1',upstream.repository+'.git','main');
   const target=commit(git('rev-parse','FETCH_HEAD').toString().trim()),base=await activeCommit();
   if(target===base){await recordCheck('succeeded','上游与线上版本一致，暂无更新',target);console.log('上游与线上版本一致：'+base);exitSuccess();}
   const source=(await db.query('SELECT manifest FROM source_versions WHERE commit_id=$1',[base])).rows[0];
   const oldDocs=(await db.query('SELECT path,markdown,sha256 FROM source_documents WHERE source_commit=$1',[base])).rows;
   const files=git('ls-tree','-rlz',target).toString().split('\0').filter(Boolean).map(line=>{
     const m=line.match(/^(\d+) blob ([a-f0-9]{40})\s+(\d+)\t(.+)$/s);if(!m||m[1]!=='100644')throw new Error('上游存在不支持的文件模式，需人工检查');
     return {path:m[4],gitBlob:m[2],size:Number(m[3]),status:isContentFile(m[4])?'included':'excluded',reason:isContentFile(m[4])?'正文或参考原文':'非读物：代码、配置、技能、图片或生成文件'};
   });
   if(files.length>5000||files.some(f=>f.size>10*1024*1024)||files.reduce((n,f)=>n+f.size,0)>100*1024*1024)throw new Error('上游体积异常，停止下载');
   const dir=directory(target);
   if(existsSync(join(dir,'review.json'))){await recordCheck('succeeded','发现上游更新，审核报告已存在',target);console.log('已存在固定审核报告，请使用该报告准备或发布：'+dir);exitSuccess();}
   mkdirSync(dir,{recursive:true});
   const selected=files.filter(f=>f.status==='included').map(file=>{
     if(file.path.startsWith('/')||file.path.split('/').some(p=>p==='..'||p==='.')||file.path.includes('\\'))throw new Error('不安全的上游路径');
     const bytes=git('cat-file','blob',file.gitBlob);
     if(bytes.length!==file.size||createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==file.gitBlob)throw new Error('上游文件摘要不符');
     const dest=join(dir,file.path);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,bytes);return {path:file.path,sha256:hash(bytes)};
   });
   const tree=git('rev-parse',target+'^{tree}').toString().trim();
   writeFileSync(join(dir,'inventory.json'),JSON.stringify({commit:target,tree,checkedAt:new Date().toISOString().slice(0,10),files},null,2)+'\n');
   const manifest={...baseManifest,commit:target,sourceTree:tree,files:selected,inventory:{commit:target,tree,checkedAt:new Date().toISOString().slice(0,10),files},checkedAt:new Date().toISOString().slice(0,10),chapters:files.filter(f=>f.path.startsWith('book/')&&f.path.endsWith('.md')).map(f=>({path:f.path,gitBlob:f.gitBlob}))};
   writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
   const s=snapshot(target),report=reportFor(s,base,oldDocs,source.manifest),text=JSON.stringify(report,null,2)+'\n';
   if((await db.query('SELECT 1 FROM content_candidates WHERE commit_id=$1',[target])).rowCount)throw new Error('该目标已有候选记录，不覆盖审核报告；请先查看 status');
   writeFileSync(join(dir,'review.json'),text);
   const summary=`# 上游内容更新审核\n\n基准：${base}\n目标：${target}\n报告 SHA-256：${hash(text)}\n\n文档 ${report.counts.documents}，短知识 ${report.counts.entries}，变更文件 ${report.files.length}。\n\n${report.files.map(f=>`- ${f.change}：${f.path}`).join('\n')}\n\n阻断项：${report.blockers.join('；')||'无自动阻断项；仍须人工阅读 review.json 中 before / after 全文，确认内容与许可。'}\n\n全部纳入/排除文件见 inventory.json。未生成自动正确性结论。\n`;
   writeFileSync(join(dir,'review.md'),summary);await recordCheck('succeeded','发现上游更新，已生成审核报告',target);console.log(summary);console.log('报告目录：'+dir);
 }else if(command==='prepare'){
   const target=commit(args[0]),{s,report,digest}=loadReport(target);await validateReport(s,report);
   if(await activeCommit()!==report.base)throw new Error('线上已更新，请重新生成差异报告');
   const bundle={...contentBundle(),upstream:{...upstream,commit:target,syncedAt:s.inventory.checkedAt},manifest:s.manifest,documents:s.documents,entries:s.entries,releases:[]};
   console.log(await importContent(db,bundle));
   const client=await db.connect();try{await client.query('BEGIN');await verifyCandidate(client,target,s.documents,s.entries);const old=(await client.query('SELECT report_hash,base_commit FROM content_candidates WHERE commit_id=$1',[target])).rows[0];if(old&&(old.report_hash!==digest||old.base_commit!==report.base))throw new Error('候选审核摘要不可覆盖');await client.query('INSERT INTO content_candidates(commit_id,base_commit,report_hash,report) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[target,report.base,digest,report]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   console.log('待发布版本已准备，线上未切换。审核摘要：'+digest);
 }else if(command==='publish'||command==='rollback'){
   const target=commit(args[0]),expected=commit(option('--expected')),note=option('--note');
   if(!note.trim()||note.length>1000)throw new Error('需要 --note 填写审核/回退原因（1—1000 字符）');
   const digest=option('--approve-report');let s:ReturnType<typeof snapshot>;
   if(target===upstream.commit&&command==='rollback'){
     const bundle=contentBundle();s={dir:'content/upstream',manifest:bundle.manifest,inventory:baseInventory,documents:bundle.documents,entries:bundle.entries};
     if(option('--confirm')!==target)throw new Error('回退需要 --confirm 完整目标提交');
   }else{
     const loaded=loadReport(target);s=loaded.s;await validateReport(s,loaded.report);
     if(command==='publish'&&digest!==loaded.digest)throw new Error('必须通过 --approve-report 明确提供已审阅报告 SHA-256');
     if(command==='rollback'&&option('--confirm')!==target)throw new Error('回退需要 --confirm 完整目标提交');
   }
   if(await activeCommit()!==expected)throw new Error('线上版本已变化，请重新检查');
   if(!process.env.DATABASE_URL)throw new Error('缺少数据库连接');
   const backup=await backupDatabase(process.env.DATABASE_URL,join('backups',`before-${command}-${Date.now()}.dump`));
   const client=await db.connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('life-in-order-content-import'))");await verifyCandidate(client,target,s.documents,s.entries);await switchPublication(client,{target,expected,hash:digest,note,backup,operation:command});await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   console.log('切换完成：'+target+'；切换前备份：'+backup);
 }else throw new Error('用法：content:manage status | check | prepare <提交> | publish <提交> --expected <线上提交> --approve-report <报告SHA256> --note <原因> | rollback <提交> --expected <线上提交> --confirm <目标提交> --note <原因>');
}catch(error){if(command==='check')await recordCheck('failed','检查失败，请查看维护任务或系统日志；线上内容未变动').catch(()=>{});console.error(error instanceof Error?error.message:'维护失败');process.exitCode=1;}finally{if(operationLock){await operationLock.query("SELECT pg_advisory_unlock(hashtext('life-in-order-maintenance-operation'))");operationLock.release();}await db.end();}
function exitSuccess():never{process.exit(0);}
