"use client";
import {useEffect,useRef} from 'react';
import {readingPositionKey,type ReadingPosition as Position} from '@/lib/reading-position';
export default function ReadingPosition({positions}:{positions:Position[]}){
  const marker=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const stream=marker.current?.parentElement;if(!stream)return;
    const articles=[...stream.querySelectorAll<HTMLElement>('[data-reading-entry]')];
    let frame=0,last='';
    const save=()=>{
      frame=0;if(document.visibilityState!=='visible'||!document.hasFocus())return;
      const line=Math.max(24,innerHeight*.3);
      const article=articles.find(article=>{const rect=article.getBoundingClientRect();return rect.bottom>line&&rect.top<innerHeight-24;});
      if(!article)return;
      const position=positions.find(position=>article.id===`reading-${position.chapter}-${position.entry}`);
      if(!position)return;
      const value=JSON.stringify(position);if(value===last)return;
      try{localStorage.setItem(readingPositionKey,value);last=value;}catch{}
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(save);};
    const observer=new IntersectionObserver(schedule);articles.forEach(article=>observer.observe(article));
    schedule();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',schedule);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);window.removeEventListener('focus',schedule);document.removeEventListener('visibilitychange',schedule);};
  },[positions]);
  return <span ref={marker} hidden/>;
}
