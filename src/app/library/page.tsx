import Link from 'next/link';
import Form from 'next/form';
import SearchButton from '../knowledge/search-button';
import SiteHeader from '../site-header';
import DocumentCard from './document-card';
import {getContent} from '@/lib/content-db';
import {searchDocuments,documentCounts,searchChapterTitles} from '@/lib/documents';
import {documentKindLabels,type DocumentKind} from '@/lib/source-documents';
import {knowledgeTopics} from '@/lib/knowledge-search';
import {contentVersion} from '../../../content/moving';
export const dynamic='force-dynamic';
export default async function Library({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const params=await searchParams,q=typeof params.q==='string'?params.q.slice(0,500):'',kind=typeof params.kind==='string'?params.kind:'article',topic=typeof params.topic==='string'?params.topic:'',page=typeof params.page==='string'?Number(params.page):1;
 const {upstream}=await getContent(contentVersion);if(!upstream)throw new Error('来源尚未导入');
 const [result,counts]=await Promise.all([searchDocuments(upstream.commit,q,kind,topic,page,params.mode!=='keyword'),documentCounts(upstream.commit)]);
 const matchedChapters=result.kind==='article'?await searchChapterTitles(upstream.commit,result.query,result.topic):[];
 const url=(selected:string,pageNumber=1)=>'/library?'+new URLSearchParams({kind:selected,q:result.query,topic:['article','chapter'].includes(selected)?result.topic:'',page:String(pageNumber),mode:params.mode==='keyword'?'keyword':'hybrid'});
 return <><SiteHeader current="library"/><main className="library-layout"><header><p className="eyebrow">完整内容 / 从短知识走进专题</p><h1>把一件事，完整读明白。</h1><p>专题保留全文，章节保留导读和条目，核实档案单独查阅。<Link href="/sources">同步范围与来源</Link></p></header>
 <nav className="library-types" aria-label="资料类型">{Object.entries(documentKindLabels).map(([key,label])=><Link key={key} href={url(key)} aria-current={result.kind===key?'page':undefined}>{label} {counts[key as DocumentKind]??0}</Link>)}<Link href={url('')} aria-current={!result.kind?'page':undefined}>全部 {Object.values(counts).reduce((sum,n)=>sum+n,0)}</Link></nav>
 <Form key={`${result.query}:${result.kind}:${result.topic}:${params.mode}`} action="/library" className="library-search"><label htmlFor="document-query">搜索专题或原始资料</label><div><input id="document-query" type="search" name="q" defaultValue={result.query} maxLength={500} autoComplete="off"/><SearchButton label="搜索"/></div><input type="hidden" name="kind" value={result.kind}/><input type="hidden" name="topic" value={result.topic}/><label>查找方式<select name="mode" defaultValue={params.mode==='keyword'?'keyword':'hybrid'}><option value="hybrid">语义与关键词</option><option value="keyword">仅关键词</option></select></label></Form>
 {result.topic&&<p>当前主题：{knowledgeTopics.find(item=>item.id===result.topic)?.title} · <Link href={'/library?'+new URLSearchParams({kind:result.kind,q:result.query})}>查看全部主题</Link></p>}
 {result.semanticStatus&&result.semanticStatus!=='ready'&&<p role="status">文档语义索引{result.semanticStatus==='incomplete'?'尚未完成':result.semanticStatus==='disabled'?'未配置':'暂不可用'}，本次使用关键词查找。</p>}
 {matchedChapters.length>0&&<section className="related-documents" aria-label="匹配的完整章节"><h2>也找到了匹配的完整章节</h2>{matchedChapters.map(document=><DocumentCard key={document.path} document={document}/>)}</section>}
 <p className="library-result-status" role="status">{result.query&&`“${result.query}” · `}{result.kind?documentKindLabels[result.kind as DocumentKind]:'当前范围'}找到 {result.total} 份 · 第 {result.page} / {result.pages} 页</p>
 {result.entries.map(document=><DocumentCard key={document.path} document={document}/>)}
 {!result.total&&!matchedChapters.length&&<section className="knowledge-empty"><h2>当前范围没有找到。</h2><Link href="/library?kind=">清除条件，浏览全部资料 →</Link></section>}
 <nav className="utilities" aria-label="资料分页">{result.page>1&&<Link href={url(result.kind,result.page-1)}>← 上一页</Link>}{result.page<result.pages&&<Link href={url(result.kind,result.page+1)}>下一页 →</Link>}</nav>
 </main></>;
}
