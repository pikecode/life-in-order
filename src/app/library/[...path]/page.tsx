import {cache} from "react";
import {upstream as initialSource} from "../../../../content/moving";
import {getPublicContent,UnpublishedSourceError} from "@/lib/content-publication";
import Link from 'next/link';
import {notFound} from 'next/navigation';
import SiteHeader from '../../site-header';
import DocumentOutline from '../document-outline';
import DocumentPosition from '../document-position';
import ReaderSettings from '../../reader-settings';
import SourceMarkdown,{documentHeadings} from '../markdown';

import {getDocument,relatedChapters,relatedArticles} from '@/lib/documents';
import {documentKindLabels} from '@/lib/source-documents';
import {documentHref} from '@/lib/document-links';
import {upstreamUrl} from '../../../../content/moving';
export const dynamic='force-dynamic';
type DocumentProps={params:Promise<{path:string[]}>;searchParams:Promise<{source?:string}>};
const loadDocument=cache(async(rawPath:string,source:string)=>{
 let path:string;
 try{path=decodeURIComponent(rawPath);}catch{notFound();}
 let upstream,manifest;
 try{({upstream,manifest}=await getPublicContent(source));}catch(error){if(error instanceof UnpublishedSourceError)notFound();throw error;}
 if(!upstream)throw new Error('来源尚未导入');
 const document=await getDocument(upstream.commit,path);if(!document)notFound();
 return {path,upstream,manifest,document};
});
export async function generateMetadata({params,searchParams}:DocumentProps){
 const {document}=await loadDocument((await params).path.join('/'),(await searchParams).source??initialSource.commit);
 return {title:document.title};
}
export default async function DocumentPage({params,searchParams}:DocumentProps) {
 const {path,upstream,manifest,document}=await loadDocument((await params).path.join('/'),(await searchParams).source??initialSource.commit);
 const chapters=document.kind==='article'?await relatedChapters(upstream.commit,document.chapters):[];
 const articles=document.kind==='chapter'?await relatedArticles(upstream.commit,'',path.slice(5,7)):[];
 const headings=documentHeadings(document.markdown),outline=headings.filter(item=>item.depth===2);
 return <><SiteHeader current="library"/><main className="document-layout" data-reader>
   <div className="document-navigation"><Link href={`/library?kind=${document.kind}`}>← {documentKindLabels[document.kind]}</Link><span>固定来源版本 · {upstream.commit.slice(0,7)}</span></div>
   <div className="document-grid"><aside className="document-sidebar"><DocumentOutline headings={outline}/><ReaderSettings/></aside>
   <article className="document-paper">
     <DocumentPosition sourceCommit={upstream.commit} path={path}/>
     {document.kind==='verification'&&<p className="document-context">这是上游核实过程的历史记录，可能包含待核问题或已修订表述，请结合对应正文阅读。</p>}
     {!headings.some(item=>item.depth===1)&&<h1>{document.title}</h1>}
     <SourceMarkdown documentPaths={manifest.files.map(file=>file.path)} markdown={document.markdown} path={path} upstream={upstream}/>
     {(document.kind==='chapter'||chapters.length>0||articles.length>0)&&<aside className="document-next" aria-label="继续阅读"><p>顺着这个话题，接着读。</p>{document.kind==='chapter'&&<Link href={`/read/${path.slice(5,7)}/1?source=${upstream.commit}`}>按知识条目连续阅读 →</Link>}{chapters.map(chapter=><Link key={chapter.path} href={`/read/${chapter.path.slice(5,7)}/1?source=${upstream.commit}`}>{chapter.title.replace(/^\d+[.、]\s*/,'')} · 从头读 →</Link>)}{articles.map(article=><Link key={article.path} href={documentHref(article.path,upstream.commit)}>{article.title} ↗</Link>)}</aside>}
     <details className="document-provenance"><summary>来源与原始文本</summary><p>《{upstream.title}》 · {upstream.author} · {document.kind==="reference"?"参考文件许可范围见其原文":<a href={upstream.licenseUrl}>CC BY 4.0</a>}。原文完整保存，展示时渲染 Markdown，不执行原始 HTML；引用资料尚未逐项重新核实。</p><p><a href={upstreamUrl(path,upstream)} target="_blank" rel="noopener noreferrer">上游固定版本原文 ↗</a></p><pre>{document.markdown}</pre></details>
     <p className="document-credit">《{upstream.title}》 · {upstream.author} · {document.kind==="reference"?<Link href="/sources">参考文件许可说明</Link>:<a href={upstream.licenseUrl}>CC BY 4.0</a>}</p>
   </article></div>
 </main></>;
}
