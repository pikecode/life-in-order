'use client';
import {useId,useState} from 'react';
import Link from 'next/link';
import Highlight from './highlight';
import ReadingTracker from './reading-tracker';
import type {KnowledgeReference} from '@/lib/usage-schema';
export default function InlineNote({advice,preview,terms,href,reference}:{advice:string;preview:string;terms:string[];href:string;reference:KnowledgeReference}) {
 const [open,setOpen]=useState(false),id=useId(),canExpand=preview!==advice;
 return <div className={`inline-note${open?' is-expanded':''}`}>
  {canExpand&&<button className="note-unfold" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>{open?'收起':'展开阅读'}<span aria-hidden="true">{open?'−':'＋'}</span></button>}
  <div id={id} className="note-text" {...(open?{'data-reading-entry':true}:{})}>
   {open&&<ReadingTracker reference={reference}/>}
   <p><Highlight text={open?advice:preview} terms={terms}/></p>
  </div>
  {open&&<Link className="note-continue" href={href}>顺着这一章继续读 <span aria-hidden="true">→</span></Link>}
 </div>;
}
