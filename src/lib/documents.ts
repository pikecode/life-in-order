import { db } from "./db";
import { knowledgeSearchTerms,knowledgeTopics,searchPattern } from "./knowledge-search";
import { documentCandidates } from "./document-search";
import type { DocumentKind } from "./source-documents";
export type DocumentSummary={path:string;kind:DocumentKind;title:string;topics:string[];chapters:string[];excerpt:string};
export type DocumentRecord=Omit<DocumentSummary,'excerpt'>&{markdown:string;introduction:string;sha256:string;git_blob:string};
export async function getDocument(sourceCommit:string,path:string) {
  if(path.length>512||path.startsWith('/')||path.split('/').some(part=>part==='..'||part==='.')||path.includes('\\'))return null;
  return (await db.query<DocumentRecord>('SELECT path,kind,title,topics,chapters,markdown,introduction,sha256,git_blob FROM source_documents WHERE source_commit=$1 AND path=$2',[sourceCommit,path])).rows[0]??null;
}
export async function documentCounts(sourceCommit:string) {
  const {rows}=await db.query<{kind:DocumentKind;count:number}>('SELECT kind,count(*)::int AS count FROM source_documents WHERE source_commit=$1 GROUP BY kind',[sourceCommit]);
  return Object.fromEntries(rows.map(row=>[row.kind,row.count])) as Partial<Record<DocumentKind,number>>;
}
export async function searchDocuments(sourceCommit:string,query='',kindInput='',topicInput='',page=1,semantic=false) {
  const kind=['article','chapter','verification','reference'].includes(kindInput)?kindInput:'';
  const topic=knowledgeTopics.some(item=>item.id===topicInput)?topicInput:'';
  const {query:q,terms,words}=knowledgeSearchTerms(query);
  const candidates=semantic&&q?await documentCandidates(sourceCommit,q,kind,topic):null;
  const paths=candidates?.matches.map(item=>item.path)??[];
  const patterns=terms.map(searchPattern),wordPatterns=words.map(searchPattern);
  const lexical=`($2::text[]='{}' OR title ILIKE ANY($2) OR markdown ILIKE ANY($2)
    OR(cardinality($6::text[])>1 AND NOT EXISTS(SELECT 1 FROM unnest($6::text[]) word WHERE NOT((title||' '||markdown) ILIKE word))))`;
  const filter=`source_commit=$1 AND ($3='' OR kind=$3) AND ($4='' OR $4=ANY(topics)) AND (${lexical} OR path=ANY($5::text[]))`;
  const params=[sourceCommit,patterns,kind,topic,paths,wordPatterns];
  const total=(await db.query<{count:number}>(`SELECT count(*)::int AS count FROM source_documents WHERE ${filter}`,params)).rows[0].count;
  const pages=Math.max(1,Math.ceil(total/20)),current=Math.min(pages,Math.max(1,Number.isSafeInteger(page)?page:1));
  const {rows}=await db.query<DocumentSummary>(`WITH ranked AS(
    SELECT path,kind,title,topics,chapters,left(markdown,600) AS excerpt,${lexical} AS lexical,
      row_number() OVER(ORDER BY (title ILIKE ANY($2)) DESC,path) AS keyword_rank,array_position($5::text[],path) AS semantic_rank
    FROM source_documents WHERE ${filter}
  ) SELECT path,kind,title,topics,chapters,excerpt FROM ranked ORDER BY
    ((CASE WHEN lexical THEN 1.0/(60+keyword_rank) ELSE 0 END)+COALESCE(1.0/(60+semantic_rank),0)) DESC,path LIMIT 20 OFFSET $7`,[...params,(current-1)*20]);
  for(const row of rows){const match=candidates?.matches.find(item=>item.path===row.path);if(match)row.excerpt=match.text;}
  return {entries:rows,total,pages,page:current,query:q,kind,topic,semanticStatus:candidates?.status??null};
}
export async function relatedArticles(sourceCommit:string,topic:string,chapter='') {
  return (await db.query<DocumentSummary>(`SELECT path,kind,title,topics,chapters,left(markdown,600) AS excerpt FROM source_documents
    WHERE source_commit=$1 AND kind='article' AND ($2='' OR $2=ANY(topics)) AND ($3='' OR $3=ANY(chapters)) ORDER BY path`,[sourceCommit,topic,chapter])).rows;
}

export async function searchChapterTitles(sourceCommit:string,query:string,topic='',chapter='') {
  const {terms,words}=knowledgeSearchTerms(query);
  if(!terms.length)return [];
  const titleText="(title||' '||regexp_replace(path,'(^book/[0-9]+-)|([.]md$)','','g'))";
  return (await db.query<DocumentSummary>(`SELECT path,kind,title,topics,chapters,left(introduction,600) AS excerpt FROM source_documents
    WHERE source_commit=$1 AND kind='chapter' AND ($4='' OR $4=ANY(topics)) AND ($5='' OR $5=ANY(chapters))
    AND (${titleText} ILIKE ANY($2::text[]) OR (cardinality($3::text[])>1 AND NOT EXISTS(
      SELECT 1 FROM unnest($3::text[]) word WHERE NOT(${titleText} ILIKE word)))) ORDER BY path`,
    [sourceCommit,terms.map(searchPattern),words.map(searchPattern),topic,chapter])).rows;
}
