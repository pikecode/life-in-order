"use client";
import {useId,useState} from 'react';
import Link from 'next/link';
export default function HomeTopicDirectory({topics}:{topics:{id:string;title:string}[]}){
 const id=useId(),[open,setOpen]=useState(false);
 return <aside className="home-topic-directory" aria-label="主题选择">
  <p>主题目录</p>
  <button type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>选择主题 <span aria-hidden="true">{open?'−':'＋'}</span></button>
  <nav id={id} className="home-topic-jumps" data-open={open} aria-label="快速选择阅读主题">
   {topics.map(topic=><Link key={topic.id} href={`#topic-${topic.id}`} onNavigate={()=>setOpen(false)}>{topic.title}</Link>)}
  </nav>
 </aside>;
}
