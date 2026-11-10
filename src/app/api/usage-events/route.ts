import { db } from "@/lib/db";
import { readBody } from "@/lib/http";
import { usageEventSchema } from "@/lib/usage-schema";
import { recordUsage } from "@/lib/usage";
const headers = {"Cache-Control":"no-store"};
export async function POST(request:Request) {
  const target=new URL(request.url);
  // Next 的内部 URL 可能使用 localhost，以实际请求 Host 校验浏览器同源。
  target.host=request.headers.get('host') ?? target.host;
  const origins=[target.origin,new URL(process.env.APP_URL ?? request.url).origin];
  if(!origins.includes(request.headers.get('origin') ?? '') || request.headers.get('sec-fetch-site')==='cross-site')
    return new Response(null,{status:403,headers});
  if(request.headers.get('DNT')==='1' || request.headers.get('Sec-GPC')==='1')
    return new Response(null,{status:204,headers});
  let event;
  try { event=usageEventSchema.parse(await readBody(request,2048)); }
  catch { return new Response(null,{status:400,headers}); }
  try {
    const result=await recordUsage(db,event);
    return new Response(null,{status:result==='invalid'?400:204,headers});
  } catch(error) {
    const code=error && typeof error==='object' && 'code' in error ? error.code : '';
    return new Response(null,{status:code==='23503'||code==='23514'?400:503,headers});
  }
}
