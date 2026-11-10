"use client";
import { useEffect,useRef } from "react";
import { knowledgeUsage } from "@/lib/usage-client";
import { VisibleDwell } from "@/lib/usage-dwell";
import type { KnowledgeReference } from "@/lib/usage-schema";
export default function ReadingTracker({reference}:{reference:KnowledgeReference}) {
  const marker=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const article=marker.current?.closest("[data-reading-entry]");
    if(!article)return;
    let visible=false,opened=false;
    const clock=new VisibleDwell();
    const tick=(focused:boolean)=>{if(clock.tick(focused,performance.now()))knowledgeUsage("knowledge_engaged",reference);};
    const update=()=>{
      if(visible&&!opened&&document.visibilityState==="visible"){knowledgeUsage("knowledge_open",reference);opened=true;}
      tick(visible&&document.visibilityState==="visible"&&document.hasFocus());
    };
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();},{rootMargin:"-24px 0px -24px 0px"});
    observer.observe(article);
    const blur=()=>tick(false);
    update();const interval=setInterval(update,250);
    document.addEventListener("visibilitychange",update);window.addEventListener("focus",update);window.addEventListener("blur",blur);
    return ()=>{observer.disconnect();clearInterval(interval);tick(false);document.removeEventListener("visibilitychange",update);window.removeEventListener("focus",update);window.removeEventListener("blur",blur);};
  },[reference.sourceCommit,reference.path,reference.entry]);
  return <span ref={marker} hidden />;
}
