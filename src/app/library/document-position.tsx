"use client";
import {useEffect,useRef,useState} from 'react';
import {documentPositionKey,parseDocumentPosition,type DocumentPosition} from '@/lib/reader-preferences';
export default function DocumentPosition({sourceCommit,path}:{sourceCommit:string;path:string}){
 const marker=useRef<HTMLDivElement>(null);
 const pending=useRef(false);
 const [saved,setSaved]=useState<(DocumentPosition&{label:string})|null>(null);
 const key=documentPositionKey(sourceCommit,path);
 useEffect(()=>{
  const content=marker.current?.parentElement?.querySelector<HTMLElement>('.source-markdown');if(!content)return;
  const headings=[...content.querySelectorAll<HTMLElement>('h2[id],h3[id]')];
  const anchors=[content,...headings];
  let frame=0,last='',moved=false;
  let previous:DocumentPosition|null=null;
  try{previous=parseDocumentPosition(localStorage.getItem(key));}catch{}
  if(previous&&(!previous.anchor||headings.some(heading=>heading.id===previous!.anchor))&&!location.hash&&(previous.anchor||previous.fraction>.01)){pending.current=true;setSaved({...previous,label:headings.find(heading=>heading.id===previous!.anchor)?.textContent??"正文开头"});}else{pending.current=false;setSaved(null);}
  const save=()=>{
   frame=0;if(pending.current||!moved||document.visibilityState!=='visible'||!document.hasFocus())return;
   const rect=content.getBoundingClientRect(),line=Math.max(120,innerHeight*.25);
   if(rect.bottom<=line||rect.top>=innerHeight-24)return;
   const index=Math.max(0,anchors.findLastIndex(anchor=>anchor.getBoundingClientRect().top<=line));
   const anchor=anchors[index],top=anchor.getBoundingClientRect().top;
   const bottom=anchors[index+1]?.getBoundingClientRect().top??rect.bottom;
   const position={anchor:index?anchor.id:'',fraction:Math.max(0,Math.min(1,(line-top)/Math.max(1,bottom-top)))};
   const value=JSON.stringify(position);if(value===last)return;
   try{localStorage.setItem(key,value);last=value;}catch{}
  };
  const schedule=()=>{moved=true;if(!frame)frame=requestAnimationFrame(save);};
  window.addEventListener('scroll',schedule,{passive:true});
  return ()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule);};
 },[key]);
 const continueAt=(position:DocumentPosition|null)=>{
  const content=marker.current?.parentElement?.querySelector<HTMLElement>('.source-markdown');if(!content)return;
  setSaved(null);
  requestAnimationFrame(()=>{
   pending.current=false;
   if(!position){try{localStorage.removeItem(key);}catch{}window.scrollTo({top:0,behavior:'instant'});return;}
   const headings=[...content.querySelectorAll<HTMLElement>('h2[id],h3[id]')];
   const anchors=[content,...headings],index=position.anchor?anchors.findIndex(anchor=>anchor.id===position.anchor):0;
   if(index<0)return;
   const anchor=anchors[index],top=anchor.getBoundingClientRect().top+scrollY;
   const bottom=(anchors[index+1]?.getBoundingClientRect().top??content.getBoundingClientRect().bottom)+scrollY;
   window.scrollTo({top:Math.max(0,top+(bottom-top)*position.fraction-Math.max(120,innerHeight*.25)),behavior:'instant'});
   anchor.setAttribute('tabindex','-1');anchor.focus({preventScroll:true});
  });
 };
 return <div ref={marker} className="document-resume">{saved&&<aside aria-label="继续上次长文阅读"><p>上次读到 <strong>{saved.label}</strong></p><div><button type="button" onClick={()=>continueAt(saved)}>接着读 ↓</button><button type="button" onClick={()=>continueAt(null)}>从头读</button></div><small>仅保存在此浏览器，不代表已读完</small></aside>}</div>;
}
