"use client";
import {useEffect,useRef,useState} from 'react';
type Heading={id:string;text:string};
export default function DocumentOutline({headings}:{headings:Heading[]}){
 const details=useRef<HTMLDetailsElement>(null);
 const [active,setActive]=useState('');
 useEffect(()=>{
  const desktop=matchMedia('(min-width: 761px)');
  const resize=()=>{if(details.current)details.current.open=desktop.matches;};
  resize();desktop.addEventListener('change',resize);
  const elements=headings.map(heading=>document.getElementById(heading.id)).filter((element):element is HTMLElement=>!!element);
  let frame=0;
  const update=()=>{frame=0;const passed=elements.filter(element=>element.getBoundingClientRect().top<=130);setActive((passed.at(-1)??elements[0])?.id??'');};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  schedule();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  return ()=>{cancelAnimationFrame(frame);desktop.removeEventListener('change',resize);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);};
 },[headings]);
 if(!headings.length)return null;
 return <aside className="document-outline"><details ref={details}><summary>文章目录 <span aria-hidden="true">⌄</span></summary><nav aria-label="文章章节">{headings.map(heading=><a key={heading.id} href={'#'+heading.id} aria-current={active===heading.id?'location':undefined} onClick={()=>{if(!matchMedia('(min-width: 761px)').matches&&details.current)details.current.open=false;}}>{heading.text}</a>)}</nav></details></aside>;
}
