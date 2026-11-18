import {z} from 'zod';
import {getPublicContent,UnpublishedSourceError} from '@/lib/content-publication';
import {getDiscovery} from '@/lib/discovery';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,source=params.get('source')??undefined,raw=params.get('seen');
 let seen:string[];
 try{
  if(source!==undefined&&!/^[a-f0-9]{40}$/.test(source))throw new Error('来源格式无效');
  if(raw&&raw.length>2000)throw new Error('参数过长');
  seen=z.array(z.string().max(200)).max(6).parse(raw?JSON.parse(raw):[]);
 }catch{return Response.json({error:'参数无效'},{status:400,headers});}
 try{
  const {upstream}=await getPublicContent(source);
  return Response.json({items:await getDiscovery(upstream.commit,seen)},{headers});
 }catch(error){return Response.json({error:'暂时无法获取内容'},{status:error instanceof UnpublishedSourceError?404:503,headers});}
}
