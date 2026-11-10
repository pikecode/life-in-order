import Link from 'next/link';
import {notFound} from 'next/navigation';
import SiteHeader from '../../site-header';
import SourceMarkdown,{documentHeadings} from '../markdown';
import {getContent} from '@/lib/content-db';
import {getDocument} from '@/lib/documents';
import {documentKindLabels} from '@/lib/source-documents';
import {contentVersion,upstreamUrl} from '../../../../content/moving';
export const dynamic='force-dynamic';
export default async function DocumentPage({params}:{params:Promise<{path:string[]}>}) {
 let path:string;
 try{path=(await params).path.map(part=>decodeURIComponent(part)).join('/');}catch{notFound();}
 const {upstream}=await getContent(contentVersion);if(!upstream)throw new Error('来源尚未导入');
 const document=await getDocument(upstream.commit,path);if(!document)notFound();
 const headings=documentHeadings(document.markdown),outline=headings.filter(item=>item.depth===2);
 return <><SiteHeader current="library"/><main className="document-layout">
   <div className="document-navigation"><Link href={`/library?kind=${document.kind}`}>← {documentKindLabels[document.kind]}</Link><span>固定来源版本 · {upstream.commit.slice(0,7)}</span></div>
   <div className="document-grid"><aside className="document-outline"><details><summary>文章目录</summary><nav aria-label="文章章节">{outline.map(item=><a key={item.id} href={'#'+item.id}>{item.text}</a>)}</nav></details></aside>
   <article className="document-paper">
     {document.kind==='verification'&&<p className="document-context">这是上游核实过程的历史记录，可能包含待核问题或已修订表述，请结合对应正文阅读。</p>}
     {!headings.some(item=>item.depth===1)&&<h1>{document.title}</h1>}
     <SourceMarkdown markdown={document.markdown} path={path} upstream={upstream}/>
     {document.kind==='chapter'&&<p><Link href={`/read/${path.slice(5,7)}/1`}>按知识条目连续阅读 →</Link></p>}
     <details className="document-provenance"><summary>来源与原始文本</summary><p>《{upstream.title}》 · {upstream.author} · {document.kind==="reference"?"参考文件许可范围见其原文":<a href={upstream.licenseUrl}>CC BY 4.0</a>}。原文完整保存，展示时渲染 Markdown，不执行原始 HTML；引用资料尚未逐项重新核实。</p><p><a href={upstreamUrl(path,upstream)} target="_blank" rel="noopener noreferrer">上游固定版本原文 ↗</a></p><pre>{document.markdown}</pre></details>
     <p className="document-credit">《{upstream.title}》 · {upstream.author} · {document.kind==="reference"?<Link href="/sources">参考文件许可说明</Link>:<a href={upstream.licenseUrl}>CC BY 4.0</a>}</p>
   </article></div>
 </main></>;
}
