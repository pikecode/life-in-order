import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {AdminSessions,LoginLimiter,createAdminConfig,validPassword,equalToken} from '../src/lib/admin-security';
import {AdminMaintenance} from '../src/lib/admin-maintenance';
import {createAdminHandler} from '../src/lib/admin-http';
import {reportView} from '../src/lib/admin-view';

test('管理员密码摘要、会话过期与撤销、恒定令牌比较及登录限速',()=>{
 const config=createAdminConfig('admin','A'.repeat(24));assert.equal(config.passwordHash.length,128);assert.ok(!JSON.stringify(config).includes('A'.repeat(24)));
 assert.ok(validPassword(config,'admin','A'.repeat(24)));assert.ok(!validPassword(config,'other','A'.repeat(24)));assert.ok(!validPassword(config,'admin','wrong'));
 const sessions=new AdminSessions(),created=sessions.create(1000);assert.ok(sessions.get(created.token,1001));assert.equal(sessions.get(created.token,1000+8*60*60*1000),null);
 const another=sessions.create();sessions.delete(another.token);assert.equal(sessions.get(another.token),null);
 assert.ok(equalToken('a'.repeat(64),'a'.repeat(64)));assert.ok(!equalToken('a','a'.repeat(64)));assert.ok(!equalToken('b'.repeat(64),'a'.repeat(64)));
 const limiter=new LoginLimiter();for(let i=0;i<5;i++)assert.ok(limiter.allow('ip',1000));assert.ok(!limiter.allow('ip',1001));assert.ok(limiter.allow('ip',1000+15*60*1000));
});
test('管理 HTTP：匿名隔离、登录、Cookie 属性、跨站与 CSRF 拒绝、退出失效',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lio-admin-http-'));let queued=0;
 const pool={query:async()=>({rows:[],rowCount:0})} as unknown as Pool;
 const service=new AdminMaintenance(pool,directory);service.enqueue=async()=>{queued++;return '11111111-1111-4111-8111-111111111111';};service.runNext=async()=>{};
 const server=createServer(createAdminHandler(service,createAdminConfig('admin','A'.repeat(24)),'https://ompeak.com'));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const send=(path:string,method='GET',body='',headers:Record<string,string>={})=>new Promise<{status:number;headers:import('node:http').IncomingHttpHeaders;body:string}>((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port:address.port,path,method,headers:{host:'ompeak.com',...(method==='POST'?{'content-type':'application/x-www-form-urlencoded','content-length':String(Buffer.byteLength(body))}:{}),...headers}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body:text}));});req.on('error',reject);req.end(body);
 });
 try{
  for(const path of ['/admin/','/admin/review?commit='+'a'.repeat(40),'/admin/job?id=x'])assert.equal((await send(path)).headers.location,'/admin/login');
  const evil=await send('/admin/login','POST','username=admin&password='+ 'A'.repeat(24),{origin:'https://evil.invalid'});assert.equal(evil.status,403);
  const login=await send('/admin/login','POST','username=admin&password='+ 'A'.repeat(24),{origin:'https://ompeak.com'});assert.equal(login.status,303);
  const setCookie=login.headers['set-cookie']![0];for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/admin'])assert.ok(setCookie.includes(flag));
  const cookie=setCookie.split(';')[0],dashboard=await send('/admin/','GET','',{cookie});assert.equal(dashboard.status,200);assert.equal(dashboard.headers['cache-control'],'no-store');assert.equal(dashboard.headers['referrer-policy'],'same-origin');
  const csrf=dashboard.body.match(/name="csrf" value="([a-f0-9]{64})"/)![1];
  assert.equal((await send('/admin/operation','POST','action=check&csrf=bad',{origin:'https://ompeak.com',cookie})).status,403);assert.equal(queued,0);
  assert.equal((await send('/admin/operation','POST','action=check&csrf='+csrf,{origin:'https://evil.invalid',cookie})).status,403);assert.equal(queued,0);
  assert.equal((await send('/admin/operation','POST','action=publish&csrf='+csrf,{origin:'https://ompeak.com',cookie})).status,400);assert.equal(queued,0);
  assert.equal((await send('/admin/operation','POST','action=check&csrf='+csrf,{origin:'https://ompeak.com',cookie})).status,303);assert.equal(queued,1);
  await send('/admin/logout','POST','csrf='+csrf,{origin:'https://ompeak.com',cookie});assert.equal((await send('/admin/','GET','',{cookie})).headers.location,'/admin/login');
  assert.equal((await send('/admin/login','POST','x'.repeat(9000),{origin:'https://ompeak.com'})).status,400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}
});
test('前后原文与文件名 HTML 转义，完整文本不执行外部脚本',()=>{
 const malicious='<script>alert("x")</script>',target='a'.repeat(40),base='b'.repeat(40);
 const html=reportView({hash:'c'.repeat(64),report:{base,target,createdAt:'fixture',counts:{documents:1,entries:1},blockers:[],files:[{path:malicious,change:'修改',beforeHash:'d'.repeat(64),afterHash:'e'.repeat(64),before:malicious,after:'新原文'}]}},new Set(),0,'f'.repeat(64),base,false);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('新原文'));assert.ok(html.includes('标记已审阅'));
});
