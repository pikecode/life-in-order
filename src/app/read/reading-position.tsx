"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {readingPositionKey,type ReadingPosition as Position} from '@/lib/reading-position';
export default function ReadingPosition({positions,topic,chapters,range}:{positions:Position[];topic:{id:string;title:string};chapters:{id:string;title:string}[];range:{start:number;end:number;total:number}}){
  const marker=useRef<HTMLDetailsElement>(null);
  const [current,setCurrent]=useState(positions[0]);
  useEffect(()=>{
    const stream=marker.current?.closest('[data-reader]');if(!stream)return;
    const articles=[...stream.querySelectorAll<HTMLElement>('[data-reading-entry]')];
    let frame=0,last='';
    const save=()=>{
      frame=0;if(document.visibilityState!=='visible'||!document.hasFocus())return;
      const line=Math.max(24,innerHeight*.3);
      const article=articles.find(article=>{const rect=article.getBoundingClientRect();return rect.bottom>line&&rect.top<innerHeight-24;});
      if(!article)return;
      const position=positions.find(position=>article.id===`reading-${position.chapter}-${position.entry}`);
      if(!position)return;
      setCurrent(previous=>previous.chapter===position.chapter&&previous.entry===position.entry?previous:position);
      const value=JSON.stringify(position);if(value===last)return;
      try{localStorage.setItem(readingPositionKey,value);last=value;}catch{}
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(save);};
    const observer=new IntersectionObserver(schedule);articles.forEach(article=>observer.observe(article));
    schedule();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',schedule);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);window.removeEventListener('focus',schedule);document.removeEventListener('visibilitychange',schedule);};
  },[positions]);
  return <details ref={marker} className="reading-location">
    <summary><span className="reading-topic"><span className="reading-current-title">{current.chapterTitle}</span><small className="reading-range">第 {current.entry} 条 · {topic.title}</small></span><span className="reading-directory-label">切换章节 <span aria-hidden="true">⌄</span></span></summary>
    <nav aria-label="阅读章节">{chapters.map(chapter=><Link key={chapter.id} aria-current={chapter.id===current.chapter?'location':undefined} href={`/read/${chapter.id}/1?source=${positions[0].sourceCommit}`} onNavigate={()=>{if(marker.current)marker.current.open=false;}}>{chapter.title}</Link>)}</nav>
    <p className="reading-batch-range">本组第 {range.start}–{range.end} / {range.total} 条</p>
    <Link className="reading-all" href={`/knowledge?topic=${topic.id}`}>查看全部条目 →</Link>
  </details>;
}
