"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {defaultReaderPreferences,parseReaderPreferences,readerPreferencesKey,type ReaderPreferences} from '@/lib/reader-preferences';
export default function ReaderSettings(){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const active=useRef(false);
 const [open,setOpen]=useState(false);
 const [preferences,setPreferences]=useState<ReaderPreferences>(defaultReaderPreferences);
 const [temporary,setTemporary]=useState(false);
 const native=()=>Object.hasOwn(HTMLElement.prototype,'popover');
 const sync=(value:boolean)=>{active.current=value;setOpen(value);};
 const fallback=(value:boolean)=>{if(panel.current)panel.current.dataset.fallbackOpen=String(value);sync(value);};
 const placePanel=()=>{
  const element=panel.current,button=trigger.current;if(!element||!button)return;
  const rect=button.getBoundingClientRect(),width=Math.min(274,innerWidth-24);
  const below=innerHeight-rect.bottom-16,above=rect.top-16,upwards=below<320&&above>below;
  const left=innerWidth<=760?rect.right-width:rect.left;
  element.style.setProperty('--settings-left',`${Math.max(12,Math.min(left,innerWidth-width-12))}px`);
  element.style.setProperty('--settings-top',upwards?'auto':`${rect.bottom+8}px`);
  element.style.setProperty('--settings-bottom',upwards?`${innerHeight-rect.top+8}px`:'auto');
  element.style.setProperty('--settings-max-height',`${Math.max(40,upwards?above:below)}px`);
 };
 const close=(restoreFocus=true)=>{
  if(native()){if(active.current)panel.current?.hidePopover();}else fallback(false);
  if(restoreFocus)trigger.current?.focus();
 };
 useEffect(()=>{
  const reposition=()=>{if(active.current)placePanel();};
  window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,{passive:true});
  if(!native())panel.current?.removeAttribute('popover');
  const dismiss=(event:PointerEvent)=>{if(active.current&&!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&active.current){event.preventDefault();close();}};
  if(!native()){document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);}
  return ()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition);document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
 },[]);
 useEffect(()=>{
  const refresh=()=>{try{const value=parseReaderPreferences(localStorage.getItem(readerPreferencesKey));apply(value);}catch{}};
  refresh();window.addEventListener('storage',refresh);return ()=>window.removeEventListener('storage',refresh);
 },[]);
 const apply=(value:ReaderPreferences)=>{
  const root=trigger.current?.closest<HTMLElement>('[data-reader]');
  if(root){root.dataset.fontSize=value.size;root.dataset.lineSpacing=value.spacing;}
  setPreferences(value);
 };
 const change=(value:ReaderPreferences)=>{apply(value);try{localStorage.setItem(readerPreferencesKey,JSON.stringify(value));setTemporary(false);}catch{setTemporary(true);}};
 return <div className="reader-settings" data-open={open}>
  <button ref={trigger} className="reader-settings-trigger" type="button" popoverTarget={id} aria-controls={id} aria-expanded={open} onClick={()=>{if(!native()){placePanel();fallback(!active.current);}}}><b aria-hidden="true">Aa</b><span>阅读设置</span></button>
  <div ref={panel} id={id} popover="auto" className="reader-settings-panel" aria-label="阅读设置" role="group" onBeforeToggle={event=>{if((event.nativeEvent as ToggleEvent).newState==='open')placePanel();}} onToggle={event=>sync((event.nativeEvent as ToggleEvent).newState==='open')}>
   <fieldset><legend>正文字号</legend><div>{([['standard','标准'],['large','大字'],['largest','特大']] as const).map(([size,label])=><button key={size} type="button" aria-pressed={preferences.size===size} onClick={()=>change({...preferences,size})}>{label}</button>)}</div></fieldset>
   <fieldset><legend>正文行距</legend><div>{([['comfortable','舒适'],['relaxed','宽松']] as const).map(([spacing,label])=><button key={spacing} type="button" aria-pressed={preferences.spacing===spacing} onClick={()=>change({...preferences,spacing})}>{label}</button>)}</div></fieldset>
   <p role="status">{temporary?'本次有效，浏览器未保存设置':'仅保存在此浏览器，短知识与长文共用'}</p><div className="reader-settings-actions"><button type="button" onClick={()=>change(defaultReaderPreferences)}>恢复默认</button><button type="button" onClick={()=>close()}>完成</button></div>
  </div>
 </div>;
}
