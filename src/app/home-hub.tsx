import Link from "next/link";
import ContinueReading from "./continue-reading";
import HomeSearchForm from "./home-search-form";
import SiteHeader from "./site-header";
import type { getKnowledgeHighlights, getKnowledgeChapters } from "@/lib/content-db";
import type {DocumentSummary} from "@/lib/documents";
import {documentHref} from "@/lib/document-links";
export default function HomeHub({
  highlights,
  chapters,
  articles,
  sourceCommit,
}: {
  sourceCommit:string;
  articles: DocumentSummary[];
  highlights: Awaited<ReturnType<typeof getKnowledgeHighlights>>;
  chapters: Awaited<ReturnType<typeof getKnowledgeChapters>>;
}) {
  const featured=highlights.at(-1)?.entries[0];
  const featuredChapter=chapters.find(chapter=>chapter.id===featured?.chapter);
  return (
    <>
      <SiteHeader current="home" />
      <main className="hub workbench-home">
        <section className="home-intro" aria-labelledby="home-title">
          <div className="home-promise">
            <p className="eyebrow">生活有序 · 一本可以随时翻开的生活手册</p>
            <h1 id="home-title">把生活，<br/><span>读明白一点。</span></h1>
            <p className="intro">关于身体、工作、家与日常。<br/>从一条感兴趣的知识，读到更多生活的可能。</p>
            <a className="home-explore-link" href="#home-topics">挑一个主题，开始读 <span aria-hidden="true">↓</span></a>
          </div>
          {featured&&<Link className="home-featured" href={`/read/${featured.chapter}/${featured.entry}?source=${sourceCommit}`}><span className="featured-kicker">不妨，从这一条读起 <span aria-hidden="true">↗</span></span><h2>{featured.title}</h2><span className="featured-footer"><span>{featuredChapter?.title??"日常与情绪"} · 第 {featured.entry} 条</span><span>翻开这一页 →</span></span></Link>}
        </section>
        <ContinueReading/>
        <section id="home-topics" className="home-explore" aria-labelledby="home-topics-title">
          <div className="home-section-heading"><h2 id="home-topics-title">生活里的七个主题</h2><p>{highlights.reduce((sum,item)=>sum+item.count,0)} 条短知识 · {articles.length} 篇专题长文</p></div>
          <nav className="home-topic-jumps" aria-label="快速选择阅读主题">{highlights.map(topic=><a key={topic.id} href={`#topic-${topic.id}`}>{topic.title}</a>)}</nav>
          <div className="topic-exhibits">{highlights.map((topic,index)=><article className="topic-exhibit" id={`topic-${topic.id}`} key={topic.id}>
            <Link className="topic-cover" href={`/read/${topic.entries[0].chapter}/${topic.entries[0].entry}?source=${sourceCommit}`}><span className="topic-index">{String(index+1).padStart(2,"0")} <span>{topic.count} 条知识</span></span><h3>{topic.title}</h3><span className="topic-start">从这里开始读 <span aria-hidden="true">↗</span></span></Link>
            <ul>{topic.entries.map(entry=><li key={entry.chapter+":"+entry.entry}><Link href={`/read/${entry.chapter}/${entry.entry}?source=${sourceCommit}`}>{entry.title}<span aria-hidden="true">↗</span></Link></li>)}</ul>
            {articles.filter(article=>article.topics.includes(topic.id)).sort((a,b)=>Number(b.chapters.includes(topic.chapters[0]))-Number(a.chapters.includes(topic.chapters[0]))).slice(0,1).map(article=><Link className="topic-article" key={article.path} href={documentHref(article.path,article.source_commit)}><small>专题长文</small>{article.title} →</Link>)}
            <details className="topic-more"><summary>查看主题目录</summary><p>{topic.count} 条知识 · {topic.chapters.length} 章</p><div className="topic-chapter-peek">{chapters.filter(item=>topic.chapters.includes(item.id)).map(item=><Link key={item.id} href={`/read/${item.id}/1?source=${sourceCommit}`}>{item.title}</Link>)}</div><Link href={`/knowledge?topic=${topic.id}`}>查看全部条目 →</Link></details>

          </article>)}</div>
        </section>
        <details className="home-search-secondary"><summary>想找某个具体问题？展开搜索 <span aria-hidden="true">⌕</span></summary>
          <div className="home-search-panel">
            <p className="eyebrow">从这里，找到线索</p>
            <HomeSearchForm/>
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
