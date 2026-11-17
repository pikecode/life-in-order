import type {IncomingMessage,ServerResponse} from 'node:http';
import {AdminMaintenance,type AdminJob} from './admin-maintenance';
import {activeCommit} from './content-publication';
import {upstream} from '../../content/moving';
import {AdminSessions,LoginLimiter,validPassword,equalToken,sameOrigin,type AdminConfig} from './admin-security';
import {escapeHtml as h,layout,loginPage,form,hidden,short,jobCard,reportView,actionNames,statusNames} from './admin-view';

export function createAdminHandler(service:AdminMaintenance,config:AdminConfig,origin:string){
 const sessions=new AdminSessions(),limiter=new LoginLimiter(),globalLimiter=new LoginLimiter(60);
 const secure=new URL(origin).protocol==='https:',cookieName=secure?'__Secure-lio-admin':'lio-admin';
 function cookie(token:string,clear=false){return `${cookieName}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${clear?0:8*60*60}${secure?'; Secure':''}`;}
 function send(res:ServerResponse,status:number,body:string){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(body);}
 function redirect(res:ServerResponse,path:string){res.writeHead(303,{Location:path});res.end();}
 async function readForm(req:IncomingMessage){
  if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))throw new Error('表单格式不支持');
  if(Number(req.headers['content-length']??0)>8192)throw new Error('表单过大');
  let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw new Error('表单过大');text+=chunk.toString();}
  return new URLSearchParams(text);
 }
 return async function handle(req:IncomingMessage,res:ServerResponse){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const url=new URL(req.url??'/admin/',origin),path=url.pathname;
  const token=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)??'';
  const session=sessions.get(token);
  try{
   if(!path.startsWith('/admin/')){send(res,404,layout('找不到页面','<h1>找不到这个管理页面。</h1>'));return;}
   if(!['GET','POST'].includes(req.method??'')){res.setHeader('Allow','GET, POST');send(res,405,layout('操作不支持','<h1>操作方式不支持。</h1>'));return;}
   if(req.method==='POST'){
    if(!sameOrigin(req,origin)){send(res,403,layout('来源校验失败','<h1>请从管理页提交操作。</h1>'));return;}
    if(path==='/admin/login'){
     const ip=String(req.headers['x-real-ip']??req.socket.remoteAddress??'unknown');
     if(!limiter.allow(ip)||!globalLimiter.allow('all')){res.setHeader('Retry-After','900');send(res,429,loginPage('尝试次数过多，请在 15 分钟后重试。'));return;}
     const fields=await readForm(req);
     if(!validPassword(config,fields.get('username')??'',fields.get('password')??'')){send(res,401,loginPage('账号或密码不正确。'));return;}
     const created=sessions.create();res.setHeader('Set-Cookie',cookie(created.token));redirect(res,'/admin/');return;
    }
    if(!session){redirect(res,'/admin/login');return;}
    const fields=await readForm(req);
    if(!equalToken(fields.get('csrf')??'',session.csrf)){send(res,403,layout('确认失效','<h1>安全确认已失效。</h1><p>请刷新页面后重试。</p>',{csrf:session.csrf}));return;}
    if(path==='/admin/logout'){sessions.delete(token);res.setHeader('Set-Cookie',cookie('',true));redirect(res,'/admin/login');return;}
    if(path==='/admin/review'){
     if(fields.get('confirmed')!=='yes')throw new Error('请确认已审阅这个文件');
     const target=fields.get('target')??'',index=Number(fields.get('index'));
     if(!Number.isSafeInteger(index)||index<0)throw new Error('文件序号无效');
     await service.markReviewed(target,fields.get('hash')??'',fields.get('path')??'');
     redirect(res,`/admin/review?commit=${encodeURIComponent(target)}&file=${index}`);return;
    }
    if(path==='/admin/operation'){
     const action=fields.get('action')??'',target=fields.get('target')??undefined;
     if(['publish','rollback'].includes(action)&&fields.get('confirmed')!=='yes')throw new Error('请明确确认版本切换');
     const payload={action,...(target?{target}:{}),...(fields.has('expected')?{expected:fields.get('expected')!}:{}),...(fields.has('hash')?{hash:fields.get('hash')!}:{}),...(fields.has('note')?{note:fields.get('note')!}:{})};
     const id=await service.enqueue(payload);void service.runNext();redirect(res,'/admin/job?id='+id);return;
    }
    send(res,404,layout('操作不存在','<h1>没有这个管理操作。</h1>',{csrf:session.csrf}));return;
   }
   if(path==='/admin/login'){if(session){redirect(res,'/admin/');return;}send(res,200,loginPage());return;}
   if(!session){redirect(res,'/admin/login');return;}
   const csrf=session.csrf;
   if(path==='/admin/'){
    const current=await activeCommit(service.pool),reports=service.reports();
    const lastCheck=(await service.pool.query<{status:string;message:string;checked_at:Date}>('SELECT status,message,checked_at FROM content_admin_checks WHERE id=true')).rows[0];
    const jobs=(await service.pool.query<AdminJob>('SELECT * FROM content_admin_jobs ORDER BY created_at DESC LIMIT 12')).rows;
    const candidates=(await service.pool.query<{commit_id:string}>('SELECT commit_id FROM content_candidates')).rows;
    const events=(await service.pool.query<{target_commit:string;previous_commit:string;operation:'publish'|'rollback';note:string;created_at:Date}>('SELECT target_commit,previous_commit,operation,note,created_at FROM content_publication_events ORDER BY id DESC LIMIT 12')).rows;
    const busy=jobs.some(j=>['queued','running'].includes(j.status));
    const heading=`<div class="dashboard-heading"><div><p class="eyebrow">生活有序 / 管理台</p><h1>把每次更新，核对清楚。</h1><p class="muted">查看差异、逐项审阅，再将准备好的版本发布给读者。</p></div>${form('/admin/operation',csrf,hidden('action','check')+`<button class="primary" ${busy?'disabled':''}>${busy?'维护任务执行中…':'检查上游更新 ↗'}</button>`)}</div><div class="version-strip"><span>当前线上 <code>${current}</code></span><span>普通阅读不需要登录</span></div>`;
    const cards=reports.map(data=>data.report?`<a class="report-row" href="/admin/review?commit=${data.target}"><span><strong>${short(data.target)}</strong><small>${h(data.report.createdAt)} · ${data.report.files.length} 个文件变化</small><small>基准 ${short(data.report.base)}</small></span><span class="badge">${current===data.target?'当前线上':data.report.blockers.length?'有阻断项':data.report.base!==current?'报告需更新':candidates.some(c=>c.commit_id===data.target)?'已准备，待发布':'待审阅'}</span></a>`:`<div class="report-row"><span><code>${data.target}</code><small>${h(data.error)}</small></span></div>`).join('');
    const history=events.map(event=>`<div class="history-item"><span class="badge">${event.operation==='publish'?'发布':'回退'}</span><p><code>${short(event.previous_commit)} → ${short(event.target_commit)}</code></p><p>${h(event.note)}</p><small>${h(new Date(event.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</small>${event.target_commit!==current?`<a href="/admin/confirm?action=rollback&target=${event.target_commit}">确认回退到此版本 →</a>`:''}</div>`).join('');
    const original=current!==upstream.commit?`<p><a href="/admin/confirm?action=rollback&target=${upstream.commit}">回退到最初固定版本 →</a></p>`:'';
    send(res,200,layout('内容管理',heading+`<div class="dashboard-grid"><section><div class="panel"><h2>更新报告</h2>${lastCheck?`<p class="small" role="status">${h(lastCheck.message)}<small>最近检查 ${h(new Date(lastCheck.checked_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</small></p>`:''}${cards||'<p class="empty">暂时没有更新报告。点击“检查上游更新”，结果会显示在右侧任务记录中。</p>'}</div><div class="panel"><h2>发布历史</h2>${history||'<p class="muted">还没有发布新版本，当前使用最初固定快照。</p>'}${original}</div></section><aside><div class="panel"><h2>维护任务</h2>${jobs.map(jobCard).join('')||'<p class="empty">尚未通过管理页执行任务。</p>'}</div><div class="panel"><h2>审核顺序</h2><p class="small">检查更新 → 查看原文变化 → 标记已审阅 → 准备版本 → 确认发布</p><p class="small muted">自动校验负责完整性。发布前仍需核对建议的来源、时效和适用条件。</p></div></aside></div>`,{csrf,refresh:busy}));return;
   }
   if(path==='/admin/review'){
    const target=url.searchParams.get('commit')??'',data=service.report(target),index=Number(url.searchParams.get('file')??0);
    if(!Number.isSafeInteger(index)||index<0||index>=Math.max(1,data.report.files.length))throw new Error('文件序号无效');
    const reviewed=await service.reviewed(target,data.hash),current=await activeCommit(service.pool);
    const prepared=Boolean((await service.pool.query('SELECT 1 FROM content_candidates WHERE commit_id=$1 AND report_hash=$2',[target,data.hash])).rowCount);
    send(res,200,layout('逐文件审核',reportView(data,reviewed,index,csrf,current,prepared),{csrf}));return;
   }
   if(path==='/admin/confirm'){
    const action=url.searchParams.get('action'),target=url.searchParams.get('target')??'';
    if(action!=='publish'&&action!=='rollback')throw new Error('版本操作无效');
    const current=await activeCommit(service.pool),hash=action==='publish'?service.report(target).hash:undefined;
    await service.validate({action,target,expected:current,...(hash?{hash}:{}),note:'确认页校验'});
    const title=action==='publish'?'确认发布这个版本':'确认回退到历史版本';
    const body=`<section class="confirm-panel"><a class="back" href="/admin/">← 返回维护首页</a><p class="eyebrow">最后确认 / ${action==='publish'?'发布':'回退'}</p><h1>${title}。</h1><dl><dt>当前线上</dt><dd><code>${current}</code></dd><dt>切换目标</dt><dd><code>${h(target)}</code></dd>${hash?`<dt>报告摘要</dt><dd><code>${hash}</code></dd>`:''}</dl><p class="muted">执行前会备份数据库，再校验原文并切换线上版本。失败时不会把不完整内容发布给读者。</p>${form('/admin/operation',csrf,hidden('action',action)+hidden('target',target)+hidden('expected',current)+(hash?hidden('hash',hash):'')+`<label>审核或回退备注<textarea name="note" required maxlength="900" placeholder="记录已核对的内容或回退原因"></textarea></label><label class="checkbox"><input type="checkbox" name="confirmed" value="yes" required>我确认目标版本及本次操作，${action==='publish'?'已审阅全部变更及适用条件':'了解这会切回旧版内容'}</label><button class="primary">${action==='publish'?'备份并发布':'备份并回退'} →</button>`)}</section>`;
    send(res,200,layout(title,body,{csrf}));return;
   }
   if(path==='/admin/job'){
    const id=url.searchParams.get('id')??'';if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('任务编号无效');
    const job=(await service.pool.query<AdminJob>('SELECT * FROM content_admin_jobs WHERE id=$1',[id])).rows[0];if(!job)throw new Error('任务不存在');
    const busy=['queued','running'].includes(job.status);
    send(res,200,layout('任务结果',`<a class="back" href="/admin/">← 维护首页</a><p class="eyebrow">维护任务 / ${job.id.slice(0,8)}</p><h1>${actionNames[job.action]}</h1><p><span class="badge ${job.status}">${statusNames[job.status]}</span> ${busy?'本页每 5 秒刷新一次，关闭页面不会取消任务。':''}</p><section class="panel"><h2>执行记录</h2><pre class="job-output">${h(job.output||'任务执行中，完成后显示结果。')}</pre></section><a class="button" href="/admin/">返回首页查看更新报告 →</a>`,{csrf,refresh:busy}));return;
   }
   send(res,404,layout('页面不存在','<h1>找不到这个管理页面。</h1>',{csrf}));
  }catch(error){
   const message=error instanceof Error&&error.name!=='ZodError'?error.message:'提交信息无效，请刷新后重试。';
   if(!session){send(res,400,loginPage('提交信息无效，请检查后重试。'));return;}
   send(res,400,layout('操作未完成',`<a class="back" href="/admin/">← 返回维护首页</a><h1>本次操作未完成。</h1><p class="warning">${h(message)}</p><p>可以刷新报告或查看维护任务，再重新操作。</p>`,{csrf:session.csrf}));
  }
 };
}
