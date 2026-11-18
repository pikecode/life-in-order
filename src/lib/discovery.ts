import {db} from './db';
import {knowledgeTopics} from './knowledge-search';
import {documentHref} from './document-links';
export type DiscoveryItem={id:string;kind:'knowledge'|'article';title:string;label:string;href:string};
export async function getDiscovery(sourceCommit:string,seen:string[]=[]):Promise<DiscoveryItem[]>{
 // shortcut: 当前不足千条内容可直接随机抽样，规模明显增长后按查询计划评估预生成候选集。
 const [knowledge,articles]=await Promise.all([
  db.query<{chapter:string;entry_number:number;title:string;topic_title:string}>(`WITH sampled AS (
   SELECT substring(k.path from 6 for 2) AS chapter,k.entry_number,k.data->>'title' AS title,t.title AS topic_title,
    row_number() OVER(PARTITION BY t.id ORDER BY random()) AS rank
   FROM knowledge_entries k JOIN jsonb_to_recordset($2::jsonb) AS t(id text,title text,chapters jsonb)
    ON t.chapters ? substring(k.path from 6 for 2)
   WHERE k.source_commit=$1 AND NOT(('entry:'||substring(k.path from 6 for 2)||':'||k.entry_number)=ANY($3::text[]))
  ) SELECT chapter,entry_number,title,topic_title FROM sampled WHERE rank=1 ORDER BY random() LIMIT 4`,[sourceCommit,JSON.stringify(knowledgeTopics),seen]),
  db.query<{path:string;title:string}>(`SELECT path,title FROM source_documents WHERE source_commit=$1 AND kind='article'
   AND NOT(('article:'||path)=ANY($2::text[])) ORDER BY random() LIMIT 2`,[sourceCommit,seen]),
 ]);
 return [...knowledge.rows.map(row=>({id:`entry:${row.chapter}:${row.entry_number}`,kind:'knowledge' as const,title:row.title,label:`短知识 · ${row.topic_title}`,href:`/read/${row.chapter}/${row.entry_number}?source=${sourceCommit}`})),
  ...articles.rows.map(row=>({id:`article:${row.path}`,kind:'article' as const,title:row.title,label:'专题长文',href:documentHref(row.path,sourceCommit)}))];
}
