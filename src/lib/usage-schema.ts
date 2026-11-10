import { z } from "zod";
import { knowledgeTopics } from "./knowledge-search";
const base = { id:z.uuid(), sessionId:z.uuid(), sourceCommit:z.string().regex(/^[a-f0-9]{40}$/) };
const knowledge = { ...base, path:z.string().regex(/^book\/\d{2}-[^/\r\n]{1,100}\.md$/), entry:z.number().int().positive().max(10000) };
export const usageEventSchema = z.discriminatedUnion("type", [
  z.object({...base,type:z.literal("search"),mode:z.enum(["keyword","hybrid"]),
    topic:z.string().refine(value=>value==="" || knowledgeTopics.some(topic=>topic.id===value)),
    chapter:z.string().refine(value=>value==="" || knowledgeTopics.some(topic=>topic.chapters.includes(value))),
    resultCount:z.number().int().min(0).max(100000),
    semanticStatus:z.enum(["ready","disabled","unavailable","incomplete"]).nullable(),
  }).strict(),
  z.object({...knowledge,type:z.literal("knowledge_open")}).strict(),
  z.object({...knowledge,type:z.literal("knowledge_engaged")}).strict(),
  z.object({...knowledge,type:z.literal("action_click"),scenario:z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)}).strict(),
]);
export type UsageEvent = z.infer<typeof usageEventSchema>;
export type KnowledgeReference = Pick<Extract<UsageEvent,{type:"knowledge_open"}>,"sourceCommit"|"path"|"entry">;
