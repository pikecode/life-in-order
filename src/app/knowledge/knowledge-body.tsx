import { upstreamUrl } from "../../../content/moving";
import type { upstream as upstreamMetadata } from "../../../content/moving";
import type { getKnowledge } from "@/lib/content-db";
import { knowledgeAdvice } from "@/lib/knowledge-search";
import Highlight from "./highlight";
export {default as Highlight} from "./highlight";

type Entry=Awaited<ReturnType<typeof getKnowledge>>[number];
export function KnowledgeDetails({entry,upstream,terms=[],compact=false}:{entry:Entry;upstream:typeof upstreamMetadata;terms?:string[];compact?:boolean}) {
  return <details className={`knowledge-details${compact?" evidence-link":""}`}><summary title={compact?"查看成本收益、来源与完整原文":undefined}>{compact?"依据":"查看依据与原文"} <span aria-hidden="true">⌄</span></summary><div className="knowledge-details-content">
    <p className="reader-eyebrow">{entry.path.replace(/^book\/\d+-/, "").replace(/\.md$/, "")} / 第 {entry.entry_number} 条</p>
    <dl className="reader-values"><div><dt>上游成本</dt><dd>{entry.data.cost}</dd></div><div><dt>上游收益</dt><dd>{entry.data.benefit}</dd></div></dl>
    <section className="reader-evidence" aria-label="证据与来源"><h3>依据，从哪里来？</h3><p>上游证据等级：{entry.data.evidence}</p><p>{entry.data.sources}</p>
      {entry.data.sourceUrls.length===0&&<p>原条目未提供直接文献外链，保留作者经验说明，不补造引用。</p>}
      {[...new Set(entry.data.sourceUrls)].map(url=><p key={url}><a href={url} target="_blank" rel="noopener noreferrer">原始来源：{new URL(url).hostname} ↗</a></p>)}
    </section>
    <section className="reader-original"><h3>完整原始条目</h3><pre className="knowledge-body"><Highlight text={entry.data.body} terms={terms} /></pre></section>
    <p className="reader-attribution">《{upstream.title}》 · {upstream.author} · <a href={upstream.licenseUrl}>CC BY 4.0</a><br />固定版本 {upstream.commit.slice(0,7)}；原始依据与地区适用性未逐项重新审核。</p>
    <a className="reader-upstream" href={upstreamUrl(entry.path,upstream)} target="_blank" rel="noopener noreferrer">查看上游章节原文 ↗</a>
  </div></details>;
}
export default function KnowledgeBody({entry,upstream,terms=[],heading="h2",compactEvidence=false}:{
  entry:Entry;upstream:typeof upstreamMetadata;terms?:string[];heading?:"h1"|"h2"|"h3";compactEvidence?:boolean;
}) {
  const Heading=heading;
  const advice=knowledgeAdvice(entry.data.body);
  return <>
    <Heading><Highlight text={entry.data.title} terms={terms} /></Heading>
    {advice?<p className="reader-advice"><Highlight text={advice} terms={terms} /></p>:<pre className="knowledge-body">{entry.data.body}</pre>}
    <KnowledgeDetails entry={entry} upstream={upstream} terms={terms} compact={compactEvidence} />
  </>;
}
