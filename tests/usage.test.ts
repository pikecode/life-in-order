import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { POST } from '../src/app/api/usage-events/route';
import { migrateUsage, recordUsage, pruneUsage } from '../src/lib/usage';
import { usageEventSchema, type UsageEvent } from '../src/lib/usage-schema';
import { VisibleDwell } from '../src/lib/usage-dwell';
import { upstream } from '../content/moving';

test('有效停留只累计前台活跃时间，十秒仅报告一次',()=>{
  const clock=new VisibleDwell();
  assert.equal(clock.tick(true,0),false);
  assert.equal(clock.tick(false,6000),false);
  assert.equal(clock.tick(false,60000),false);
  assert.equal(clock.tick(true,61000),false);
  assert.equal(clock.tick(true,64999),false);
  assert.equal(clock.tick(true,65000),true);
  assert.equal(clock.tick(false,90000),false);
  const background=new VisibleDwell();
  assert.equal(background.tick(false,0),false);
  assert.equal(background.tick(false,100000),false);
});
test('后台使用统计：白名单、去重、真实引用、限量、保留期和失败隔离',async(context)=>{
  const sessionId=randomUUID();
  const reference={sourceCommit:upstream.commit,path:'book/15-租房与买房.md',entry:1};
  const search={id:randomUUID(),sessionId,sourceCommit:upstream.commit,type:'search' as const,
    mode:'keyword' as const,topic:'',chapter:'',resultCount:0,semanticStatus:null};
  const request=(body:unknown,extra:Record<string,string>={})=>new Request('http://localhost:3000/api/usage-events',{
    method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json',...extra},body:JSON.stringify(body),
  });
  try {
    await migrateUsage(db);
    assert.equal((await POST(request(search))).status,204);
    assert.equal((await POST(request(search))).status,204);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM usage_events WHERE session_id=$1',[sessionId])).rows[0].n,1);
    assert.equal((await POST(request({...search,id:randomUUID(),query:'不应保存的私密描述'}))).status,400);
    assert.equal((await POST(request({...search,id:randomUUID(),email:'private@example.test'}))).status,400);
    assert.equal((await POST(request({...search,id:randomUUID(),padding:'x'.repeat(3000)}))).status,400);
    assert.equal((await POST(request(search,{origin:'https://foreign.example'}))).status,403);
    assert.equal((await POST(request(search,{'sec-fetch-site':'cross-site'}))).status,403);
    assert.equal((await POST(request({...search,id:randomUUID()},{DNT:'1'}))).status,204);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM usage_events WHERE session_id=$1',[sessionId])).rows[0].n,1);
    assert.equal((await POST(request({...search,id:randomUUID()},{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}))).status,204);
    const open={id:randomUUID(),sessionId,type:'knowledge_open' as const,...reference};
    assert.equal((await POST(request(open))).status,204);
    assert.equal((await POST(request({...open,id:randomUUID(),path:'book/15-不存在.md'}))).status,400);
    assert.equal((await POST(request({...open,id:randomUUID(),type:'action_click',scenario:'rental'}))).status,204);
    assert.equal((await POST(request({...open,id:randomUUID(),type:'action_click',scenario:'birth'}))).status,400);
    assert.equal(usageEventSchema.safeParse({...open,entry:-1}).success,false);
    const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='usage_events'")).rows.map(row=>row.column_name);
    assert.ok(!columns.some(name=>/email|user_id|query|ip_address|user_agent/.test(name)));
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      const database={query:client.query.bind(client)};
      const reading={...open,sessionId:randomUUID(),id:randomUUID()};
      assert.equal(await recordUsage(database,reading),'inserted');
      assert.equal(await recordUsage(database,{...reading,id:randomUUID()}),'ignored');
      assert.equal(await recordUsage(database,{...reading,id:randomUUID(),type:'knowledge_engaged'}),'inserted');
      const limitedSession=randomUUID();
      await client.query(`INSERT INTO usage_events(id,session_id,event_type,source_commit,search_mode,result_count)
        SELECT gen_random_uuid(),$1,'search',$2,'keyword',0 FROM generate_series(1,600)`,[limitedSession,upstream.commit]);
      assert.equal(await recordUsage(database,{...search,sessionId:limitedSession,id:randomUUID()}),'ignored');
      const oldId=randomUUID();
      await client.query(`INSERT INTO usage_events(id,session_id,event_type,source_commit,search_mode,result_count,created_at)
        VALUES($1,$2,'search',$3,'keyword',1,now()-interval '31 days')`,[oldId,sessionId,upstream.commit]);
      assert.ok(await pruneUsage(database)>=1);
      assert.equal((await client.query('SELECT 1 FROM usage_events WHERE id=$1',[oldId])).rowCount,0);
    } finally {await client.query('ROLLBACK');client.release();}
    context.mock.method(db,'query',async()=>{throw new Error('internal-private-error');});
    const failed=await POST(request({...search,id:randomUUID()}));
    assert.equal(failed.status,503);assert.equal(await failed.text(),'');
  } finally {
    context.mock.restoreAll();
    await db.query('DELETE FROM usage_events WHERE session_id=$1',[sessionId]);
    await db.end();
  }
});
