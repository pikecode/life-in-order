import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../../site-header";
import KnowledgeBody from "../../../knowledge/knowledge-body";
import ReadingTracker from "../../../knowledge/reading-tracker";
import { getContent,getKnowledgeChapters,getReadingBatch } from "@/lib/content-db";
import { knowledgeTopics } from "@/lib/knowledge-search";
import { contentVersion } from "../../../../../content/moving";
import {getDocument,relatedArticles} from "@/lib/documents";
import {documentHref} from "@/lib/document-links";
import SourceMarkdown from "../../../library/markdown";
export const dynamic="force-dynamic";
export default async function ReadingPage({params}:{params:Promise<{chapter:string;entry:string}>}) {
  const {chapter,entry}=await params;
  if(!knowledgeTopics.some(topic=>topic.chapters.includes(chapter))||! /^[1-9]\d{0,4}$/.test(entry))notFound();
  const {upstream}=await getContent(contentVersion);
  if(!upstream)throw new Error("来源尚未导入");
  const [reading,chapters]=await Promise.all([getReadingBatch(upstream.commit,chapter,Number(entry)),getKnowledgeChapters(upstream.commit)]);
  if(!reading)notFound();
  const documents=await Promise.all([...new Set(reading.entries.map(item=>item.path))].map(path=>getDocument(upstream.commit,path)));
  const articles=await relatedArticles(upstream.commit,reading.topic.id,chapter);
  const topicChapters=chapters.filter(item=>reading.topic.chapters.includes(item.id));
  const href=(item:{chapter:string;entry:number})=>`/read/${item.chapter}/${item.entry}`;
  const nextCount=Math.min(8,reading.total-reading.position-reading.entries.length+1);
  return <>
    <SiteHeader current="knowledge" />
    <main className="reading-layout reading-flow-layout">
      <div className="reading-grid">
        <aside className="reading-outline">
          <Link className="reading-back" href="/#home-topics" aria-label="换个阅读主题">←<span> 换主题</span></Link>
          <details className="reading-location">
            <summary><span className="reading-topic">{reading.topic.title}<small className="reading-range">第 {reading.position}–{reading.position+reading.entries.length-1} / {reading.total} 条</small></span><span className="reading-directory-label">章节目录 <span aria-hidden="true">⌄</span></span></summary>
            <nav aria-label="阅读章节">{topicChapters.map(item=><Link key={item.id} href={`/read/${item.id}/1`}><span>{item.title}</span></Link>)}</nav>
            <Link className="reading-all" href={`/knowledge?topic=${reading.topic.id}`}>查看全部条目 →</Link>
          </details>
        </aside>
        <section className="reading-stream" aria-label="连续阅读内容">
          {articles.length>0&&<nav className="reading-related" aria-label="本章专题长文">{articles.map(article=><Link key={article.path} href={documentHref(article.path)}><small>专题长文</small>{article.title} →</Link>)}</nav>}
          {reading.entries.map((item,index)=>{
            const previousChapter=index===0?chapter:reading.entries[index-1].path.slice(5,7);
            const currentChapter=item.path.slice(5,7);
            return <div key={`${item.path}:${item.entry_number}`}>
              {currentChapter!==previousChapter&&<p className="reading-chapter-transition">进入下一章 · {chapters.find(item=>item.id===currentChapter)?.title}</p>}
              {item.entry_number===1&&<details className="chapter-introduction"><summary>章节导读与拓展阅读</summary><SourceMarkdown markdown={documents.find(document=>document?.path===item.path)?.introduction??""} path={item.path} upstream={upstream}/><Link href={documentHref(item.path)}>打开完整章节 →</Link></details>}
              <article className="reading-paper" data-reading-entry id={`reading-${currentChapter}-${item.entry_number}`}>
                <ReadingTracker reference={{sourceCommit:upstream.commit,path:item.path,entry:item.entry_number}} />
                <div className="reader-content reading-body"><KnowledgeBody entry={item} upstream={upstream} heading={index===0?"h1":"h2"} /></div>
              </article>
            </div>;
          })}
          <nav className="reading-batch-nav" aria-label="连续阅读翻组">
            {reading.previous&&<Link className="reading-batch-previous" href={href(reading.previous)}>← 上一组</Link>}
            {reading.next?<Link className="reading-batch-next" href={href(reading.next)}><span>继续读 {nextCount} 条 →</span><small>从「{reading.next.title}」继续</small></Link>:<div className="reading-flow-end"><h2>这个主题，已经翻到最后一条。</h2><Link href="/#home-topics">看看其他主题 →</Link></div>}
          </nav>
          <p className="reading-credit">内容：《{upstream.title}》 · {upstream.author} · <a href={upstream.licenseUrl}>CC BY 4.0</a></p>
        </section>
      </div>
    </main>
  </>;
}
