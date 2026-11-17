"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {parseReadingPosition,readingPositionKey,readingPositionHref,type ReadingPosition} from '@/lib/reading-position';
export default function ContinueReading(){
  const [position,setPosition]=useState<ReadingPosition|null>(null);
  useEffect(()=>{
    const refresh=()=>{try{setPosition(parseReadingPosition(localStorage.getItem(readingPositionKey)));}catch{setPosition(null);}};
    refresh();window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);
    return ()=>{window.removeEventListener('storage',refresh);window.removeEventListener('pageshow',refresh);};
  },[]);
  if(!position)return null;
  return <aside className="continue-reading" aria-label="继续上次阅读"><div><p>上次读到</p><h2>{position.chapterTitle}<span>第 {position.entry} 条</span></h2><small>仅保存在此浏览器，不代表已读完</small></div><Link href={readingPositionHref(position)}>接着读 →</Link><button type="button" onClick={()=>{try{localStorage.removeItem(readingPositionKey);}catch{}setPosition(null);}} aria-label="清除本机阅读位置">清除</button></aside>;
}
