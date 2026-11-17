"use client";
import {useEffect,useRef,useState} from 'react';
import {defaultReaderPreferences,parseReaderPreferences,readerPreferencesKey,type ReaderPreferences} from '@/lib/reader-preferences';
export default function ReaderSettings(){
 const details=useRef<HTMLDetailsElement>(null);
 const [preferences,setPreferences]=useState<ReaderPreferences>(defaultReaderPreferences);
 const [temporary,setTemporary]=useState(false);
 const apply=(value:ReaderPreferences)=>{
  const root=details.current?.closest<HTMLElement>('[data-reader]');
  if(root){root.dataset.fontSize=value.size;root.dataset.lineSpacing=value.spacing;}
  setPreferences(value);
 };
 useEffect(()=>{
  const refresh=()=>{try{apply(parseReaderPreferences(localStorage.getItem(readerPreferencesKey)));}catch{}};
  refresh();window.addEventListener('storage',refresh);return ()=>window.removeEventListener('storage',refresh);
 },[]);
 const change=(value:ReaderPreferences)=>{apply(value);try{localStorage.setItem(readerPreferencesKey,JSON.stringify(value));setTemporary(false);}catch{setTemporary(true);}};
 const close=()=>{if(details.current){details.current.open=false;details.current.querySelector('summary')?.focus();}};
 return <details className="reader-settings" ref={details} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();}}}><summary><b aria-hidden="true">Aa</b><span>阅读设置</span></summary><div className="reader-settings-panel">
  <fieldset><legend>正文字号</legend><div>{([['standard','标准'],['large','大字'],['largest','特大']] as const).map(([size,label])=><button key={size} type="button" aria-pressed={preferences.size===size} onClick={()=>change({...preferences,size})}>{label}</button>)}</div></fieldset>
  <fieldset><legend>正文行距</legend><div>{([['comfortable','舒适'],['relaxed','宽松']] as const).map(([spacing,label])=><button key={spacing} type="button" aria-pressed={preferences.spacing===spacing} onClick={()=>change({...preferences,spacing})}>{label}</button>)}</div></fieldset>
  <p role="status">{temporary?'本次有效，浏览器未保存设置':'仅保存在此浏览器，短知识与长文共用'}</p><div className="reader-settings-actions"><button type="button" onClick={()=>change(defaultReaderPreferences)}>恢复默认</button><button type="button" onClick={close}>完成</button></div>
 </div></details>;
}
