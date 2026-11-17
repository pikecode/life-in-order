"use client";
import { useEffect,useRef } from "react";
import { knowledgeUsage } from "@/lib/usage-client";
import { VisibleDwell } from "@/lib/usage-dwell";
import type { KnowledgeReference } from "@/lib/usage-schema";
export default function ReadingTracker({reference}:{reference:KnowledgeReference}) {
  const marker=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    if(navigator.doNotTrack==='1'||('globalPrivacyControl' in navigator&&navigator.globalPrivacyControl===true))return;
    const article=marker.current?.closest("[data-reading-entry]");
    if(!article)return;
    let visible=false,opened=false,completed=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const clock=new VisibleDwell();
    const tick=(active:boolean)=>{
      if(clock.tick(active,performance.now())){completed=true;knowledgeUsage("knowledge_engaged",reference);}
    };
    const sync=(focused:boolean)=>{
      clearTimeout(timer);timer=undefined;
      if(visible&&!opened&&document.visibilityState==="visible"){knowledgeUsage("knowledge_open",reference);opened=true;}
      const active=visible&&document.visibilityState==="visible"&&focused&&!completed;
      tick(active);
      if(active&&!completed)timer=setTimeout(update,clock.remaining);
    };
    const update=()=>sync(document.hasFocus());
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();},{rootMargin:"-24px 0px -24px 0px"});
    observer.observe(article);
    const blur=()=>sync(false);
    document.addEventListener("visibilitychange",update);window.addEventListener("focus",update);window.addEventListener("blur",blur);
    return ()=>{observer.disconnect();clearTimeout(timer);tick(false);document.removeEventListener("visibilitychange",update);window.removeEventListener("focus",update);window.removeEventListener("blur",blur);};
  },[reference.sourceCommit,reference.path,reference.entry]);
  return <span ref={marker} hidden />;
}
