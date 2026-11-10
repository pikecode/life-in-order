"use client";
import { useEffect,useRef,type ReactNode } from "react";

export default function KnowledgeDirectory({label,children}:{label:string;children:ReactNode}) {
  const directory=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const desktop=window.matchMedia("(min-width: 761px)");
    const resize=()=>{if(directory.current)directory.current.open=desktop.matches;};
    resize();desktop.addEventListener("change",resize);
    return ()=>desktop.removeEventListener("change",resize);
  },[]);
  return <details ref={directory} className="knowledge-directory">
    <summary><span className="directory-current" title={label}>{label}</span><span className="directory-toggle-label">切换目录 <span aria-hidden="true">⌄</span></span></summary>
    {children}
  </details>;
}
