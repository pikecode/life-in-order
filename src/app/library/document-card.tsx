import Link from 'next/link';
import type {DocumentSummary} from '@/lib/documents';
import {documentHref} from '@/lib/document-links';
import {documentKindLabels} from '@/lib/source-documents';
import {documentExcerpt} from './markdown';
export default function DocumentCard({document}:{document:DocumentSummary}) {
 return <article className="document-card"><small>{documentKindLabels[document.kind]}</small><h2><Link href={documentHref(document.path)}>{document.title}</Link></h2><p>{documentExcerpt(document.excerpt)}</p></article>;
}
