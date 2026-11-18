"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import type {DiscoveryItem} from '@/lib/discovery';
export default function RandomDiscovery({initialItems,sourceCommit}:{initialItems:DiscoveryItem[];sourceCommit:string}){
 const [items,setItems]=useState(initialItems),[pending,setPending]=useState(false),[status,setStatus]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const refresh=async()=>{
  if(request.current)return;
  const controller=new AbortController();request.current=controller;setPending(true);setStatus('');
  try{
   const response=await fetch('/api/discovery?'+new URLSearchParams({source:sourceCommit,seen:JSON.stringify(items.map(item=>item.id))}),{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error('请求失败');
   const result:{items:DiscoveryItem[]}=await response.json();
   setItems(result.items);setStatus(`换好啦，${result.items.length} 条内容，看看有没有感兴趣的。`);
  }catch{if(!controller.signal.aborted)setStatus('暂时没换成功，原来的内容还在，可以再试一次。');}
  finally{request.current=null;if(!controller.signal.aborted)setPending(false);}
 };
 return <section id="home-discovery" className="random-discovery" aria-labelledby="discovery-title"><header><div><p>偶然遇见，也许正好需要</p><h2 id="discovery-title">随便翻翻</h2></div><button type="button" onClick={refresh} aria-disabled={pending}>{pending?'正在换…':'换一组 ↻'}</button></header><p className="discovery-intro">随机几条短知识、两篇专题，挑一条顺着读。</p>
  <div className="discovery-grid" aria-busy={pending}>{items.map(item=><article className="discovery-card" key={item.id} data-kind={item.kind}><small>{item.label}</small><h3><Link href={item.href} prefetch={false}>{item.title}<span aria-hidden="true"> ↗</span></Link></h3></article>)}</div>
  {!items.length&&<p>暂时没有可展示的内容，先从上面的主题读起。</p>}<p className="discovery-status" role="status">{status}</p>
 </section>;
}
