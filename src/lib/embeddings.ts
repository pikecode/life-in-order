import { createHash } from "node:crypto";

export function embeddingConfig() {
  if (!process.env.EMBEDDING_MODEL) return null;
  const endpoint = new URL(process.env.EMBEDDING_URL ?? "http://127.0.0.1:11434");
  // 本阶段仅允许本机 Ollama，避免环境误配后将搜索描述发送到外部。
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.protocol !== 'http:' || endpoint.username || endpoint.password)
    throw new Error("嵌入服务仅支持本机 HTTP 地址");
  const model = process.env.EMBEDDING_MODEL;
  const digest = process.env.EMBEDDING_MODEL_DIGEST;
  if (!digest) throw new Error("需要固定嵌入模型摘要，请先运行 content:embed");
  return { endpoint: endpoint.origin, model, digest, id: `ollama:${model}:${digest}:text-v1` };
}

export function validateEmbeddings(value: unknown, count: number): number[][] {
  if (!Array.isArray(value) || value.length !== count || !count) throw new Error("嵌入数量错误");
  let dimensions = 0;
  for (const vector of value) {
    if (!Array.isArray(vector) || !vector.length || vector.length > 4096 || vector.some(n => typeof n !== 'number' || !Number.isFinite(n)) || !vector.some(n => n !== 0))
      throw new Error("嵌入向量无效");
    if (dimensions && dimensions !== vector.length) throw new Error("嵌入维度不一致");
    dimensions = vector.length;
  }
  return value;
}

export async function embedTexts(texts: string[], config: NonNullable<ReturnType<typeof embeddingConfig>>, timeout = 5000) {
  const signal = AbortSignal.timeout(timeout);
  const tags = await fetch(`${config.endpoint}/api/tags`, { signal, cache: 'no-store', redirect: 'error' });
  if (!tags.ok) throw new Error("无法确认嵌入模型版本");
  const models = await tags.json();
  if (!Array.isArray(models.models) || !models.models.some((item: {name?: string; digest?: string}) =>
    (item.name === config.model || item.name === `${config.model}:latest`) && item.digest === config.digest))
    throw new Error("嵌入模型版本不匹配，请重新建立索引");
  const response = await fetch(`${config.endpoint}/api/embed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, input: texts, truncate: false, keep_alive: '30m' }),
    signal, cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw new Error("嵌入服务暂时不可用");
  return validateEmbeddings((await response.json()).embeddings, texts.length);
}

export function embeddingText(data: {title: string; body: string}) {
  // 不把引用网址、证据标签混进检索语义，原文与来源仍由知识表保留。
  return `${data.title}\n${data.body.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6} .+$/gm, '').replace(/^- (来源|证据等级)：.*$/gm, '')
    .replace(/https?:\/\/[^\s>]+/g, '').trim()}`;
}
export function contentHash(text: string) {
  return createHash('sha256').update(text).digest('hex');
}
