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
  return <div className="continue-reading-slot"><aside className="continue-reading" aria-label={position?"继续上次阅读":"阅读提示"}><div><p>{position?`上次读到 · 第 ${position.entry} 条`:"随时停下，下次接着读。"}</p><h2>{position?position.chapterTitle:"挑一条感兴趣的知识。"}</h2></div>{position?<><Link href={readingPositionHref(position)}>接着读 →</Link><button type="button" onClick={()=>{try{localStorage.removeItem(readingPositionKey);}catch{}setPosition(null);}} aria-label="清除本机阅读位置">清除</button></>:<Link href="#home-topics">挑个主题 ↓</Link>}</aside></div>;
}
