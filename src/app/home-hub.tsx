"use client";
import Link from "next/link";
import Form from "next/form";
import SearchButton from "./knowledge/search-button";
import SiteHeader from "./site-header";
import { beginSearch } from "@/lib/usage-client";
import type { getKnowledgeHighlights, getKnowledgeChapters } from "@/lib/content-db";
import type {DocumentSummary} from "@/lib/documents";
import {documentHref} from "@/lib/document-links";
export default function HomeHub({
  highlights,
  chapters,
  articles,
}: {
  articles: DocumentSummary[];
  highlights: Awaited<ReturnType<typeof getKnowledgeHighlights>>;
  chapters: Awaited<ReturnType<typeof getKnowledgeChapters>>;
}) {
  return (
    <>
      <SiteHeader current="home" />
      <main className="hub workbench-home">
        <section className="home-intro" aria-labelledby="home-title">
          <div className="home-promise">
            <p className="eyebrow">读一点，让生活有点不一样</p>
            <h1 id="home-title">从感兴趣的地方，<span>读起。</span></h1>
            <p className="intro">挑一个关心的主题，向下连续读。</p>
          </div>

        </section>
        <section id="home-topics" className="home-explore" aria-labelledby="home-topics-title">
          <div className="home-section-heading"><h2 id="home-topics-title">生活里的七个主题</h2><p>{highlights.reduce((sum,item)=>sum+item.count,0)} 条短知识 · {articles.length} 篇专题长文</p></div>
          <div className="topic-exhibits">{highlights.map(topic=><article className="topic-exhibit" key={topic.id}>
            <Link className="topic-cover" href={`/read/${topic.entries[0].chapter}/${topic.entries[0].entry}`}><h3>{topic.title}</h3><span className="topic-art" aria-hidden="true"><i /><i /><i /></span><span className="topic-cover-arrow" aria-hidden="true">↗</span></Link>
            <ul>{topic.entries.map(entry=><li key={entry.chapter+":"+entry.entry}><Link href={`/read/${entry.chapter}/${entry.entry}`}>{entry.title}<span aria-hidden="true">↗</span></Link></li>)}</ul>
            {articles.filter(article=>article.topics.includes(topic.id)).sort((a,b)=>Number(b.chapters.includes(topic.chapters[0]))-Number(a.chapters.includes(topic.chapters[0]))).slice(0,1).map(article=><Link className="topic-article" key={article.path} href={documentHref(article.path)}><small>专题长文</small>{article.title} →</Link>)}
            <details className="topic-more"><summary>查看主题目录</summary><p>{topic.count} 条知识 · {topic.chapters.length} 章</p><div className="topic-chapter-peek">{chapters.filter(item=>topic.chapters.includes(item.id)).map(item=><Link key={item.id} href={`/read/${item.id}/1`}>{item.title}</Link>)}</div><Link href={`/knowledge?topic=${topic.id}`}>查看全部条目 →</Link></details>

          </article>)}</div>
        </section>
        <details className="home-search-secondary"><summary>想找某个具体问题？展开搜索 <span aria-hidden="true">⌕</span></summary>
          <div className="home-search-panel">
            <p className="eyebrow">从这里，找到线索</p>
            <Form action="/knowledge" autoComplete="off" onSubmit={event => beginSearch(event.currentTarget)}>
              <label htmlFor="home-query">你想了解什么？</label>
              <input type="hidden" name="mode" value="hybrid" />
              <div className="knowledge-search">
                <textarea id="home-query" autoComplete="off" name="q" maxLength={500} required rows={3}
                  placeholder="比如：押金不退怎么办、睡不好、医保断缴……" />
                <SearchButton label="搜一搜知识 →" />
              </div>
            </Form>
            <div className="home-examples" aria-label="试试这些问题">
              <span>试试：</span>
              {["房东要扣我的押金", "被裁后怎么办", "孩子出生办什么"].map(question =>
                <Link key={question} href={`/knowledge?${new URLSearchParams({q:question,mode:"hybrid"})}`}>{question} ↗</Link>)}
            </div>
            <p className="fine-print">结合关键词与语义查找相关内容。</p>

          </div>
        </details>
        <p className="fine-print">内容来自《高性价比人生指南》，保留署名与来源。请结合自身情况核对适用性。</p>
      </main>
      <footer>
        <Link href="/sources">内容来源与许可</Link>
        <Link href="/legal">使用说明与隐私</Link>
      </footer>
    </>
  );
}
