import Link from 'next/link';
import {KnowledgeDetails} from './knowledge-body';
import Highlight from './highlight';
import InlineNote from './inline-note';
import type {upstream as upstreamMetadata} from '../../../content/moving';
import type {searchKnowledge} from '@/lib/content-db';
import {knowledgeAdvice,knowledgeTopics} from '@/lib/knowledge-search';
type Entry=Awaited<ReturnType<typeof searchKnowledge>>['entries'][number];
export default function KnowledgeCard({entry,terms,upstream}:{entry:Entry;terms:string[];upstream:typeof upstreamMetadata}) {
 const chapter=entry.path.slice(5,7),titleId=`knowledge-${chapter}-${entry.entry_number}`;
 const advice=knowledgeAdvice(entry.data.body)??entry.data.body;
 const characters=Array.from(advice);
 const preview=characters.length>90?characters.slice(0,60).join('')+'…':advice;
 const href=`/read/${chapter}/${entry.entry_number}?source=${upstream.commit}`;
 const chapterTitle=entry.path.replace(/^book\/\d+-/,'').replace(/\.md$/,'');
 return <article className="knowledge-card note-card" aria-labelledby={titleId} data-topic={knowledgeTopics.find(topic=>topic.chapters.includes(chapter))?.id}>
  <p className="note-folio"><span>{chapterTitle}</span><span>第 {entry.entry_number} 条</span></p>
  <h2 id={titleId}><Link href={href}><Highlight text={entry.data.title} terms={terms}/></Link></h2>
  <InlineNote advice={advice} preview={preview} terms={terms} href={href} reference={{sourceCommit:upstream.commit,path:entry.path,entry:entry.entry_number}}/>
  <KnowledgeDetails entry={entry} upstream={upstream} terms={terms}/>
 </article>;
}
