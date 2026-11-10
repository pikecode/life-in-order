import SearchTracker from "./search-tracker";
import SiteHeader from "../site-header";
import KnowledgeSearchForm from "./search-form";
import KnowledgeCard from "./knowledge-card";
import KnowledgeDirectory from "./directory";
import BrowseLink from "./browse-link";
import { commonQuestions, knowledgeTopics } from "@/lib/knowledge-search";
import Link from "next/link";
import { contentVersion } from "../../../content/moving";
import { getContent, getKnowledgeChapters, searchKnowledge } from "@/lib/content-db";
import {searchDocuments,relatedArticles,searchChapterTitles} from "@/lib/documents";
import {documentHref} from "@/lib/document-links";
import DocumentCard from "../library/document-card";
export const dynamic = "force-dynamic";
export default async function Knowledge({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 500) : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const { upstream } = await getContent(contentVersion);
  if (!upstream) throw new Error("来源尚未导入");
  const topic = typeof params.topic === "string" ? params.topic : "";
  const mode = params.mode === "keyword" ? "keyword" : "hybrid";
  const chapter = typeof params.chapter === "string" ? params.chapter : "";
  const [result, chapters] = await Promise.all([
    searchKnowledge(upstream.commit, q, page, topic, chapter, mode === "hybrid"),
    getKnowledgeChapters(upstream.commit),
  ]);
  const matchedChapters=await searchChapterTitles(upstream.commit,result.query,result.topic,result.chapter);
  const articleResult=result.query?await searchDocuments(upstream.commit,result.query,"article",result.topic,1,mode==="hybrid"):null;
  const articles=articleResult?.entries??(result.topic?await relatedArticles(upstream.commit,result.topic,result.chapter):[]);
  const searchUrl = (query: string, selectedTopic = result.topic, selectedChapter = "") =>
    "/knowledge?" + new URLSearchParams({ q: query, topic: selectedTopic, chapter: selectedChapter, mode }).toString();
  const browseUrl = (selectedTopic = "", selectedChapter = "") =>
    "/knowledge?" + new URLSearchParams({ topic: selectedTopic, chapter: selectedChapter, mode }).toString();
  const pageUrl = (number: number) =>
    "/knowledge?" +
    new URLSearchParams({ q: result.query, topic: result.topic, chapter: result.chapter, page: String(number), mode, scope: params.scope === "current" ? "current" : "all" }).toString();
  const chapterTitle=chapters.find(item=>item.id===result.chapter)?.title;
  const topicTitle=knowledgeTopics.find(item=>item.id===result.topic)?.title;
  const clueChapters=chapters.filter(item=>result.entries.some(entry=>entry.path.slice(5,7)===item.id));
  const filterUrl=(selectedTopic:string,selectedChapter="")=>"/knowledge?"+new URLSearchParams({
    q:result.query,topic:selectedTopic,chapter:selectedChapter,mode,scope:selectedTopic||selectedChapter?"current":"all",
  });
  return (
    <>
    <SearchTracker query={result.query} mode={mode} topic={result.topic} chapter={result.chapter}
      sourceCommit={upstream.commit} resultCount={result.total+matchedChapters.length+(articleResult?.total??0)} semanticStatus={result.semanticStatus} />
    <SiteHeader current="knowledge" />
    <main className="legal knowledge-layout">
      <header className="knowledge-heading">
      <h1>知识目录</h1><p>按主题浏览，找到想读的一条。<Link href="/sources">内容来源与许可 ↗</Link></p>
      </header>
      <aside className="knowledge-sidebar">
        <KnowledgeDirectory label={chapterTitle??topicTitle??"全部主题"} key={`directory:${result.topic}:${result.chapter}`}>
          <nav className="knowledge-topics" aria-label="按生活主题和章节查找">
            <p className="fine-print">点击目录直接浏览，清除旧搜索词。</p>
            <BrowseLink href={browseUrl()} current={!result.topic}>
              全部主题 <small>{chapters.reduce((sum, item) => sum + item.count, 0)}</small>
            </BrowseLink>
            {knowledgeTopics.map(item => {
              const children = chapters.filter(chapter => item.chapters.includes(chapter.id));
              return <details className="knowledge-topic" key={`${item.id}:${result.topic}`} open={result.topic === item.id}>
                <summary className={result.topic === item.id ? "selected-topic" : undefined}>
                  <BrowseLink href={browseUrl(item.id)} current={result.topic === item.id && !result.chapter}>{item.title} <small>{children.reduce((sum, chapter) => sum + chapter.count, 0)}</small></BrowseLink>
                </summary>
                <div className="knowledge-chapters">
                  <BrowseLink href={browseUrl(item.id)} current={result.topic === item.id && !result.chapter}>查看本主题全部</BrowseLink>
                  {children.map(chapter => <BrowseLink key={chapter.id} href={browseUrl(item.id, chapter.id)}
                    current={result.chapter === chapter.id}>
                    <span>{chapter.title}</span><small>{chapter.count}</small>
                  </BrowseLink>)}
                </div>
              </details>;
            })}
          </nav>
        </KnowledgeDirectory>
      </aside>
      <section className="knowledge-results" aria-label="知识搜索与结果">
      <details className="knowledge-search-disclosure" open={!!result.query} key={`search:${result.query}`}><summary>有具体问题？搜索知识</summary>
      <KnowledgeSearchForm key={`${result.query}:${result.topic}:${result.chapter}:${mode}:${params.scope}`}
        query={result.query} topic={result.topic} chapter={result.chapter} mode={mode}
        scopeLabel={chapters.find(item => item.id === result.chapter)?.title ?? knowledgeTopics.find(item => item.id === result.topic)?.title ?? ""}
        initialScope={params.scope === "current" && result.topic ? "current" : "all"} />
      <div className="knowledge-shortcuts" aria-label="常见问题">
        <span>应用示例（全库搜索）：</span>{commonQuestions.map(question => <Link key={question}
          href={searchUrl(question, "")}>{question}</Link>)}
      </div>
      <p className="fine-print">{mode === "hybrid" ? "可直接描述问题，结合语义与关键词排序。" : "可用空格组合关键词，优先展示标题匹配。"}左侧目录用于直接浏览；限定范围搜索请在搜索框中选择。</p>
      {result.semanticStatus === "ready" && <p className="fine-print">已结合语义与关键词匹配。语义相近不代表适用，请核对原文与来源；当前描述在应用所在机器处理。</p>}
      {result.semanticStatus && result.semanticStatus !== "ready" && <p role="status" className="fine-print">{result.semanticStatus === "incomplete" ? "语义索引尚未完成" : result.semanticStatus === "disabled" ? "语义匹配尚未配置" : "语义匹配暂时不可用"}，本次已使用关键词查找。</p>}
      {result.expansions.length > 0 && <p className="fine-print">同时查找：{result.expansions.join("、")}</p>}
      </details>
      {matchedChapters.length>0&&<section className="related-documents" aria-label="匹配的完整章节"><h2>按章节阅读</h2>{matchedChapters.map(document=><DocumentCard key={document.path} document={document}/>)}</section>}
      {articles.length>0&&<section className="related-documents" aria-label="专题长文"><h2>把这个话题完整读明白</h2>{articleResult?articles.slice(0,3).map(document=><DocumentCard key={document.path} document={document}/>):articles.map(article=><Link key={article.path} href={documentHref(article.path)}>{article.title} →</Link>)}<Link href={"/library?"+new URLSearchParams({kind:"article",q:result.query,topic:result.topic,mode})}>查看专题长文{articleResult?`（${articleResult.total} 篇）`:""} →</Link></section>}
      {result.entries[0]&&<Link className="knowledge-start-sequence" href={`/read/${result.entries[0].path.slice(5,7)}/${result.entries[0].entry_number}`}><span><small>{result.query?"选中线索，接着阅读":"不用逐条打开，从这里顺着读"}</small><strong>{result.query?"从第一条结果开始读":"开始顺序阅读"}</strong></span><span aria-hidden="true">→</span></Link>}
      {(result.query||result.topic)&&<nav className="knowledge-clues" aria-label="搜索线索与当前筛选">
        <div className="active-filters"><span>当前范围</span>
          <Link href={filterUrl("")} aria-current={!result.topic?"page":undefined}>全部知识</Link>
          {result.topic&&<Link href={filterUrl("")} aria-label={`移除主题筛选：${topicTitle}`}>{topicTitle} ×</Link>}
          {result.chapter&&<Link href={filterUrl(result.topic)} aria-label={`移除章节筛选：${chapterTitle}`}>{chapterTitle} ×</Link>}
        </div>
        {!result.chapter&&clueChapters.length>0&&<div className="chapter-clues"><span>{result.query?"本页结果涉及":"从这些章节继续"}</span>{clueChapters.map(item=><Link key={item.id} href={filterUrl(knowledgeTopics.find(topic=>topic.chapters.includes(item.id))!.id,item.id)}>{item.title} ↗</Link>)}</div>}
      </nav>}
      <p role="status" className="knowledge-result-status">
        {result.query && <>“{result.query}” · </>}
        {!result.topic && <>全部知识 · </>}
        {result.topic && <>{knowledgeTopics.find(item => item.id === result.topic)?.title}{result.chapter && ` / ${chapters.find(item => item.id === result.chapter)?.title}`} · </>}

        找到 {result.total} 条短知识{matchedChapters.length>0&&` · ${matchedChapters.length} 个完整章节`}{articleResult&&articleResult.total>0&&` · ${articleResult.total} 篇专题长文`} · 短知识第 {result.page} / {result.pages} 页
      </p>
      <div data-reading-list key={pageUrl(result.page)}>
      {result.entries.map(entry => <KnowledgeCard key={`${entry.path}:${entry.entry_number}`}
        entry={entry} terms={result.terms} upstream={upstream} />)}
      </div>
      {result.total === 0 && !articles.length && !matchedChapters.length && (
        <section className="knowledge-empty" aria-label="没有匹配结果">
          <h2>{result.topic ? "这个目录下还没有找到。" : "暂未找到足够相关的知识。"}</h2>
          <p>本次查找：“{result.query}”。{result.topic
            ? "当前目录范围较小，可以保留描述改查全部知识。"
            : "当前收录的是生活场景建议。可以描述具体遇到的事，或点击上方应用示例。"}</p>
          <div>
            {result.topic && <Link className="empty-primary" href={searchUrl(result.query, "")}>保留描述，搜索全部知识 →</Link>}
            {result.chapter && <Link href={searchUrl(result.query, result.topic)}>只扩大到当前主题</Link>}
            <Link href={searchUrl("", result.topic, result.chapter)}>清除关键词，浏览当前范围</Link>
          </div>
        </section>
      )}
      <nav className="utilities" aria-label="知识库分页">
        {result.page > 1 && (
          <Link href={pageUrl(result.page - 1)}>← 上一页</Link>
        )}
        {result.page < result.pages && (
          <Link href={pageUrl(result.page + 1)}>下一页 →</Link>
        )}
      </nav>
      <p className="fine-print"><Link href={"/library?"+new URLSearchParams({kind:"",q:result.query,mode})}>查找完整章节、专题及核实档案 →</Link></p>
      <p className="fine-print">
        固定提交 {upstream.commit.slice(0, 7)} · 同步 {upstream.syncedAt}
        。正文原样保存，展示时提取字段并分页；未逐项重新审核全部原始依据与地区适用性，不将证据等级当作个体结论。
      </p>
      </section>
    </main>
    </>
  );
}
