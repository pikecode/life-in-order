export async function readBody(request: Request, maxBytes = 64 * 1024) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("请求为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("请求过大");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
