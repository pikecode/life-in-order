import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReadingPosition,readingPositionHref} from '../src/lib/reading-position';
const position={sourceCommit:'a'.repeat(40),chapter:'12',entry:6,chapterTitle:'创业与做生意'};
test('本机位置校验及精确版本链接',()=>{
 assert.deepEqual(parseReadingPosition(JSON.stringify(position)),position);
 assert.equal(readingPositionHref(position),`/read/12/6?source=${'a'.repeat(40)}#reading-12-6`);
 for(const raw of [null,'broken','{}','null',JSON.stringify({...position,entry:0}),JSON.stringify({...position,entry:1.5}),JSON.stringify({...position,chapter:'99'}),JSON.stringify({...position,sourceCommit:'javascript:alert(1)'}),JSON.stringify({...position,extra:'unexpected'})])assert.equal(parseReadingPosition(raw),null);
});
