import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VisibleDwell} from '../src/lib/usage-dwell';
test('单次计时按剩余时长预约，后台暂停，完成后仅上报一次',()=>{
 const clock=new VisibleDwell();assert.equal(clock.remaining,10000);
 assert.equal(clock.tick(true,0),false);
 assert.equal(clock.tick(false,3200),false);assert.equal(clock.remaining,6800);
 assert.equal(clock.tick(false,20000),false);assert.equal(clock.remaining,6800);
 assert.equal(clock.tick(true,21000),false);
 assert.equal(clock.tick(true,27799),false);assert.equal(clock.remaining,1);
 assert.equal(clock.tick(true,27800),true);assert.equal(clock.remaining,0);
 assert.equal(clock.tick(false,30000),false);
});
