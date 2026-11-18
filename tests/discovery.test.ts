import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getDiscovery} from '../src/lib/discovery';
import {GET} from '../src/app/api/discovery/route';
import {upstream} from '../content/moving';
import {db} from '../src/lib/db';
test('随机导航：分类分散、真实版本链接、换组排除与来源边界',async()=>{
 try{
  const first=await getDiscovery(upstream.commit);assert.equal(first.length,6);
  assert.equal(new Set(first.map(item=>item.id)).size,6);
  const short=first.filter(item=>item.kind==='knowledge');assert.equal(short.length,4);
  assert.equal(new Set(short.map(item=>item.label)).size,4);
  assert.equal(first.filter(item=>item.kind==='article').length,2);
  for(const item of first){assert.ok(item.title.trim());assert.ok(item.href.startsWith('/'));assert.ok(item.href.includes(`source=${upstream.commit}`));assert.ok(!item.id.includes('verification'));}
  const next=await getDiscovery(upstream.commit,first.map(item=>item.id));assert.equal(next.length,6);assert.ok(next.every(item=>!first.some(old=>old.id===item.id)));
  const response=await GET(new Request('https://example.test/api/discovery?'+new URLSearchParams({source:upstream.commit,seen:JSON.stringify(first.map(item=>item.id))})));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.json()).items.length,6);
  assert.equal((await GET(new Request('https://example.test/api/discovery?source=bad'))).status,400);
  assert.equal((await GET(new Request('https://example.test/api/discovery?seen=not-json'))).status,400);
  const tooMany='https://example.test/api/discovery?seen='+encodeURIComponent(JSON.stringify(Array(7).fill('a')));
  assert.equal((await GET(new Request(tooMany))).status,400);
  assert.equal((await GET(new Request('https://example.test/api/discovery?source='+'0'.repeat(40)))).status,404);
 }finally{await db.end();}
});
