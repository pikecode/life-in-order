import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReaderPreferences,defaultReaderPreferences,parseDocumentPosition,documentPositionKey} from '../src/lib/reader-preferences';
test('阅读设置拒绝损坏与未知配置，并恢复默认',()=>{
 assert.deepEqual(parseReaderPreferences('{"size":"largest","spacing":"relaxed"}'),{size:'largest',spacing:'relaxed'});
 for(const raw of [null,'broken','{}','{"size":"giant","spacing":"relaxed"}','{"size":"large","spacing":"relaxed","extra":1}'])assert.deepEqual(parseReaderPreferences(raw),defaultReaderPreferences);
});
test('长文位置校验且按来源和文章隔离',()=>{
 const position={anchor:'三、怎么看',fraction:.4};assert.deepEqual(parseDocumentPosition(JSON.stringify(position)),position);
 for(const raw of [null,'broken','{}','{"anchor":"a","fraction":-1}','{"anchor":"a","fraction":1.1}','{"anchor":"a","fraction":null}'])assert.equal(parseDocumentPosition(raw),null);
 assert.notEqual(documentPositionKey('a','docs/a.md'),documentPositionKey('b','docs/a.md'));
 assert.notEqual(documentPositionKey('a','docs/a.md'),documentPositionKey('a','docs/b.md'));
});
