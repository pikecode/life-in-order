import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmbeddings, embeddingText, contentHash, embeddingConfig } from '../src/lib/embeddings';

test('嵌入向量拒绝非有限数、零向量、空值和不同维度', () => {
  assert.deepEqual(validateEmbeddings([[1,0],[0,1]],2),[[1,0],[0,1]]);
  for(const [value,count] of [[[],1],[[[0,0]],1],[[[Infinity]],1],[[['1']],1],[[[1],[1,0]],2],[[[1]],2]] as const)
    assert.throws(()=>validateEmbeddings(value,count));
});
test('嵌入文本保留标题与建议，摘要稳定且不混入引用标签', () => {
  const text=embeddingText({title:'押金返还',body:'### 1. 押金返还\n<!-- 标签 -->\n- 说人话：合同写清返还时间\n- 来源：原文 https://example.test\n- 证据等级：A'});
  assert.match(text,/合同写清返还时间/);
  assert.ok(!text.includes('https://') && !text.includes('<!--') && !text.includes('证据等级'));
  assert.equal(contentHash(text),contentHash(text));
  assert.notEqual(contentHash(text),contentHash(text+'改动'));
});
test('本机嵌入配置拒绝外部地址与未固定模型', () => {
  const previous={...process.env};
  try {
    delete process.env.EMBEDDING_MODEL;
    assert.equal(embeddingConfig(),null);
    process.env.EMBEDDING_MODEL='test';
    process.env.EMBEDDING_URL='https://external.example';
    assert.throws(()=>embeddingConfig(),/仅支持本机/);
    process.env.EMBEDDING_URL='http://127.0.0.1:11434';
    delete process.env.EMBEDDING_MODEL_DIGEST;
    assert.throws(()=>embeddingConfig(),/固定嵌入模型/);
  } finally { process.env=previous; }
});
