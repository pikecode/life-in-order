import Link from "next/link";
import { Highlight, KnowledgeDetails } from "./knowledge-body";
import type { upstream as upstreamMetadata } from "../../../content/moving";
import type { searchKnowledge } from "@/lib/content-db";
import { knowledgeExcerpt } from "@/lib/knowledge-search";

type Entry = Awaited<ReturnType<typeof searchKnowledge>>["entries"][number];
export default function KnowledgeCard({ entry, terms, upstream }: {
  entry: Entry; terms: string[]; upstream: typeof upstreamMetadata;
}) {
  const chapter = entry.path.slice(5, 7);
  const titleId = `knowledge-${chapter}-${entry.entry_number}`;
  const summary = knowledgeExcerpt(entry.data.body, [], 140);
  return (
    <article className="knowledge-card" aria-labelledby={titleId}>
      <h2 id={titleId}><Link href={`/read/${chapter}/${entry.entry_number}`}><Highlight text={entry.data.title} terms={terms} /></Link></h2>
      <p className="knowledge-card-advice"><Highlight text={summary} terms={terms} /></p>
      <KnowledgeDetails entry={entry} upstream={upstream} terms={terms} />

    </article>
  );
}
