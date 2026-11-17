import {upstream as initialSource} from "../../../../../content/moving";
import {getPublicContent,UnpublishedSourceError} from "@/lib/content-publication";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../../site-header";
import KnowledgeBody from "../../../knowledge/knowledge-body";
import ReaderSettings from "../../../reader-settings";
import ReadingPosition from "../../reading-position";
import ReadingTracker from "../../../knowledge/reading-tracker";
import { getKnowledgeChapters,getReadingBatch } from "@/lib/content-db";
import { knowledgeTopics } from "@/lib/knowledge-search";
import {getDocument,relatedArticles} from "@/lib/documents";
import {documentHref} from "@/lib/document-links";
import ChapterEnding from "../../chapter-ending";
import SourceMarkdown from "../../../library/markdown";
export const dynamic="force-dynamic";
export default async function ReadingPage({params,searchParams}:{params:Promise<{chapter:string;entry:string}>;searchParams:Promise<{source?:string}>}) {
  const {chapter,entry}=await params;
  if(!knowledgeTopics.some(topic=>topic.chapters.includes(chapter))||! /^[1-9]\d{0,4}$/.test(entry))notFound();
  let upstream,manifest;
  try{({upstream,manifest}=await getPublicContent((await searchParams).source??initialSource.commit));}catch(error){if(error instanceof UnpublishedSourceError)notFound();throw error;}
  if(!upstream)throw new Error("来源尚未导入");
  const [reading,chapters]=await Promise.all([getReadingBatch(upstream.commit,chapter,Number(entry)),getKnowledgeChapters(upstream.commit)]);
  if(!reading)notFound();
  const documents=await Promise.all([...new Set(reading.entries.map(item=>item.path))].map(path=>getDocument(upstream.commit,path)));
  const articles=await relatedArticles(upstream.commit,reading.topic.id);
  const groups:typeof reading.entries[]=[];
  for(const item of reading.entries){
    const group=groups.at(-1);
    if(group?.[0].path===item.path)group.push(item);else groups.push([item]);
  }
  const topicChapters=chapters.filter(item=>reading.topic.chapters.includes(item.id));
  const href=(item:{chapter:string;entry:number})=>`/read/${item.chapter}/${item.entry}?source=${upstream.commit}`;
  const lastChapter=reading.entries.at(-1)!.path.slice(5,7);
  const lastIsChapterEnd=!reading.next||reading.next.chapter!==lastChapter;
  const nextCount=Math.min(8,reading.total-reading.position-reading.entries.length+1);
  return <>
    <SiteHeader current="knowledge" />
    <main className="reading-layout reading-flow-layout" data-reader>
      <div className="reading-grid">
        <aside className="reading-outline">
          <Link className="reading-back" href="/#home-topics" aria-label="换个阅读主题">←<span> 换主题</span></Link>
          <details className="reading-location">
            <summary><span className="reading-topic">{reading.topic.title}<small className="reading-range">第 {reading.position}–{reading.position+reading.entries.length-1} / {reading.total} 条</small></span><span className="reading-directory-label">章节目录 <span aria-hidden="true">⌄</span></span></summary>
            <nav aria-label="阅读章节">{topicChapters.map(item=><Link key={item.id} aria-current={item.id===chapter?"location":undefined} href={`/read/${item.id}/1?source=${upstream.commit}`}><span>{item.title}</span></Link>)}</nav>
            <Link className="reading-all" href={`/knowledge?topic=${reading.topic.id}`}>查看全部条目 →</Link>
          </details>
          <ReaderSettings/>
        </aside>
        <section className="reading-stream" aria-label="连续阅读内容">
          <ReadingPosition positions={reading.entries.map(item=>({sourceCommit:upstream.commit,chapter:item.path.slice(5,7),entry:item.entry_number,chapterTitle:chapters.find(chapter=>chapter.id===item.path.slice(5,7))?.title??"本章"}))}/>
          <h1 className="reading-page-title">{reading.topic.title} · 连续阅读</h1>
          {groups.map((items,groupIndex)=>{
            const currentChapter=items[0].path.slice(5,7),chapterName=chapters.find(c=>c.id===currentChapter)?.title??"本章";
            const nextItem=groups[groupIndex+1]?.[0];
            const endsChapter=!!nextItem||!reading.next||reading.next.chapter!==currentChapter;
            const titleId=`chapter-title-${currentChapter}`;
            return <div key={items[0].path}>
              <section className="chapter-sheet" aria-labelledby={titleId}>
                <header className="sheet-header"><p>第 {Number(currentChapter)} 章<span>第 {items[0].entry_number}—{items.at(-1)!.entry_number} 条</span></p><h2 id={titleId}>{chapterName}</h2><Link href={documentHref(items[0].path,upstream.commit)}>完整章节 ↗</Link></header>
                {items[0].entry_number===1&&<details className="chapter-introduction sheet-introduction"><summary>章节导读与拓展阅读</summary><SourceMarkdown documentPaths={manifest.files.map(file=>file.path)} markdown={documents.find(document=>document?.path===items[0].path)?.introduction??""} path={items[0].path} upstream={upstream}/></details>}
                <div className="sheet-entries">{items.map(item=><article className="reading-entry" data-reading-entry key={item.entry_number} id={`reading-${currentChapter}-${item.entry_number}`}>
                  <span className="entry-index"><small>第</small>{String(item.entry_number).padStart(2,"0")}<small>条</small></span>
                  <ReadingTracker reference={{sourceCommit:upstream.commit,path:item.path,entry:item.entry_number}}/>
                  <div className="reader-content reading-body"><KnowledgeBody entry={item} upstream={upstream} heading="h3" compactEvidence/></div>
                </article>)}</div>
              </section>
              {endsChapter&&<ChapterEnding title={chapterName} articles={articles.filter(article=>article.chapters.includes(currentChapter))} next={nextItem?{href:`#reading-${nextItem.path.slice(5,7)}-${nextItem.entry_number}`,title:chapters.find(c=>c.id===nextItem.path.slice(5,7))?.title??"下一章"}:undefined}/>}
            </div>;
          })}
          {!lastIsChapterEnd&&articles.some(article=>article.chapters.includes(lastChapter))&&<aside className="reading-further" aria-label="相关专题阅读"><p>想把这个话题完整读明白？</p>{articles.filter(article=>article.chapters.includes(lastChapter)).map(article=><Link key={article.path} href={documentHref(article.path,article.source_commit)}>{article.title} ↗</Link>)}</aside>}
          {reading.upcoming.length>0&&<aside className="reading-preview" aria-label="下一组内容预告"><p>接下来会读到</p><ul>{reading.upcoming.map(item=><li key={`${item.chapter}-${item.entry}`}><Link href={href(item)}>{item.title}<span aria-hidden="true"> ↗</span></Link></li>)}</ul></aside>}
          <nav className="reading-batch-nav" aria-label="连续阅读翻组">
            {reading.previous&&<Link className="reading-batch-previous" href={href(reading.previous)}>← 上一组</Link>}
            {reading.next?<Link className="reading-batch-next" href={href(reading.next)}><span>{lastIsChapterEnd?`下一章 · ${chapters.find(c=>c.id===reading.next!.chapter)?.title??"继续阅读"} →`:`继续本章，读下 ${nextCount} 条 →`}</span><small>从「{reading.next.title}」继续</small></Link>:<div className="reading-flow-end"><h2>这个主题，已经翻到最后一条。</h2><Link href="/#home-topics">看看其他主题 →</Link></div>}
          </nav>
          <p className="reading-credit">内容：《{upstream.title}》 · {upstream.author} · <a href={upstream.licenseUrl}>CC BY 4.0</a></p>
        </section>
      </div>
    </main>
  </>;
}
