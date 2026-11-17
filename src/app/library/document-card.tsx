import Link from 'next/link';
import type {DocumentSummary,ChapterPreview} from '@/lib/documents';
import {documentHref} from '@/lib/document-links';
import {documentKindLabels} from '@/lib/source-documents';
import {documentExcerpt} from './markdown';
export default function DocumentCard({document,preview}:{document:DocumentSummary;preview?:ChapterPreview}) {
 const href=documentHref(document.path,document.source_commit);
 if(document.kind==='chapter') {
  const chapter=document.path.slice(5,7),readHref=`/read/${chapter}/1?source=${document.source_commit}`;
  return <article className="document-card chapter-card">
   <div className="chapter-spine" aria-hidden="true"><span>章</span><b>{chapter}</b></div>
   <div className="chapter-card-body"><small>完整章节{preview&&` · ${preview.count} 条知识`}</small>
    <h2><Link href={href}>{document.title.replace(/^\d+[.、]\s*/,'')}</Link></h2>
    <p>{documentExcerpt(document.excerpt)}</p>
    {preview&&preview.entries.length>0&&<ol className="chapter-sample" aria-label="本章知识预览">{preview.entries.map(entry=><li key={entry.entry}><Link href={`/read/${chapter}/${entry.entry}?source=${document.source_commit}`}>{entry.title}</Link></li>)}</ol>}
    <div className="chapter-card-actions"><Link href={readHref}>从本章开始读 <span aria-hidden="true">→</span></Link><Link href={href}>打开全文</Link></div>
   </div>
  </article>;
 }
 if(document.kind==='article')return <article className="document-card feature-card">
  <div className="feature-card-kicker"><small>专题长文</small><span aria-hidden="true">↗</span></div>
  <h2><Link href={href}>{document.title}</Link></h2><p>{documentExcerpt(document.excerpt)}</p>
  <Link className="feature-card-read" href={href}>把这个话题完整读明白 <span aria-hidden="true">→</span></Link>
 </article>;
 return <article className="document-card archive-card"><small>{documentKindLabels[document.kind]}</small><h2><Link href={href}>{document.title}</Link></h2><p>{documentExcerpt(document.excerpt)}</p></article>;
}
