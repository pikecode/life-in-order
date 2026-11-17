import {z} from 'zod';
export const readerPreferencesKey='lio-reader-preferences';
export const defaultReaderPreferences={size:'standard',spacing:'comfortable'} as const;
const preferencesSchema=z.object({size:z.enum(['standard','large','largest']),spacing:z.enum(['comfortable','relaxed'])}).strict();
export type ReaderPreferences=z.infer<typeof preferencesSchema>;
const positionSchema=z.object({anchor:z.string().max(1000),fraction:z.number().min(0).max(1)}).strict();
export type DocumentPosition=z.infer<typeof positionSchema>;
export function parseReaderPreferences(raw:string|null):ReaderPreferences{
 try{const result=preferencesSchema.safeParse(JSON.parse(raw??'null'));return result.success?result.data:defaultReaderPreferences;}catch{return defaultReaderPreferences;}
}
export function parseDocumentPosition(raw:string|null):DocumentPosition|null{
 try{const result=positionSchema.safeParse(JSON.parse(raw??'null'));return result.success?result.data:null;}catch{return null;}
}
export function documentPositionKey(sourceCommit:string,path:string){return `lio-document-position:${sourceCommit}:${path}`;}
