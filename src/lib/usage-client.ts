import type { KnowledgeReference, UsageEvent } from "./usage-schema";
type ClientIdentity<T> = T extends unknown ? Omit<T,"id"|"sessionId"> & {id?:string} : never;
type ClientEvent = ClientIdentity<UsageEvent>;
const sessionKey='lio-usage-session';
function sessionId() {
  if(typeof window==='undefined' || navigator.doNotTrack==='1' || ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl===true)) return null;
  const now=Date.now();
  let saved;
  try { saved=JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null'); } catch { saved=null; }
  const valid=saved && typeof saved.id==='string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(saved.id) &&
    typeof saved.lastAt==='number' && now>=saved.lastAt && now-saved.lastAt<30*60*1000;
  const id=valid?saved.id:crypto.randomUUID();
  sessionStorage.setItem(sessionKey,JSON.stringify({id,lastAt:now}));
  return id as string;
}
export function sendUsage(event:ClientEvent) {
  try {
    const session=sessionId();
    if(!session) return;
    void fetch('/api/usage-events',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...event,id:event.id ?? crypto.randomUUID(),sessionId:session}),
      keepalive:true,credentials:'omit',referrerPolicy:'no-referrer',
    }).catch(()=>{});
  } catch { /* 存储或统计不可用时不影响原有操作。 */ }
}
type SearchResult = {query:string;mode:'keyword'|'hybrid';topic:string;chapter:string;sourceCommit:string;resultCount:number;
  semanticStatus:'ready'|'disabled'|'unavailable'|'incomplete'|null};
let pendingSearch: {id:string;query:string;mode:string;topic:string;chapter:string;at:number}|null=null;
export function beginSearch(form:HTMLFormElement) {
  try {
    const data=new FormData(form),query=String(data.get('q') ?? '').trim().slice(0,500);
    pendingSearch=query?{id:crypto.randomUUID(),query,mode:String(data.get('mode') ?? 'hybrid'),
      topic:String(data.get('topic') ?? ''),chapter:String(data.get('chapter') ?? ''),at:Date.now()}:null;
  } catch { pendingSearch=null; }
}
export function cancelPendingSearch() { pendingSearch=null; }
export function completeSearch(result:SearchResult) {
  const pending=pendingSearch;
  if(!pending) return;
  if(Date.now()-pending.at>120000) { pendingSearch=null;return; }
  if(pending.query!==result.query || pending.mode!==result.mode || pending.topic!==result.topic || pending.chapter!==result.chapter) return;
  pendingSearch=null;
  sendUsage({type:'search',id:pending.id,sourceCommit:result.sourceCommit,mode:result.mode,
    topic:result.topic,chapter:result.chapter,resultCount:result.resultCount,semanticStatus:result.semanticStatus});
}
export function knowledgeUsage(type:'knowledge_open'|'knowledge_engaged',reference:KnowledgeReference) {
  sendUsage({type,...reference});
}
