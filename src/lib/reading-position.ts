import {z} from 'zod';
import {knowledgeTopics} from './knowledge-search';
export const readingPositionKey='lio-reading-position';
const schema=z.object({sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),chapter:z.string().refine(value=>knowledgeTopics.some(topic=>topic.chapters.includes(value))),entry:z.number().int().min(1).max(10000),chapterTitle:z.string().min(1).max(150)}).strict();
export type ReadingPosition=z.infer<typeof schema>;
export function parseReadingPosition(raw:string|null):ReadingPosition|null {
  try{const result=schema.safeParse(JSON.parse(raw??'null'));return result.success?result.data:null;}catch{return null;}
}
export function readingPositionHref(position:ReadingPosition){return `/read/${position.chapter}/${position.entry}?source=${position.sourceCommit}#reading-${position.chapter}-${position.entry}`;}
