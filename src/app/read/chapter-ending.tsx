import Link from 'next/link';
import type {DocumentSummary} from '@/lib/documents';
import {documentHref} from '@/lib/document-links';
export default function ChapterEnding({title,articles,next}:{title:string;articles:DocumentSummary[];next?:{href:string;title:string}}) {
 return <aside className="chapter-ending" aria-label={`${title}的阅读衔接`}>
  <p className="ending-label">这一章，读到这里。</p><h2>{title}</h2>
  {articles.length>0&&<div className="ending-links"><span>延伸阅读</span>{articles.map(article=><Link key={article.path} href={documentHref(article.path,article.source_commit)}>{article.title}<b aria-hidden="true">↗</b></Link>)}</div>}
  {next&&<Link className="ending-next" href={next.href}>接着读「{next.title}」 <span aria-hidden="true">↓</span></Link>}
 </aside>;
}
