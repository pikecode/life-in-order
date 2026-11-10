import Link from "next/link";
import { getContent,getKnowledgeChapters } from "@/lib/content-db";
import { contentVersion } from "../../../content/moving";
import {documentCounts} from "@/lib/documents";
import inventory from "../../../content/upstream/inventory.json";
export const dynamic="force-dynamic";
export default async function Sources(){
  const {upstream}=await getContent(contentVersion);
  if(!upstream)throw new Error("来源元数据缺失");
  const [chapters,counts]=await Promise.all([getKnowledgeChapters(upstream.commit),documentCounts(upstream.commit)]);
  return <main className="legal"><Link href="/">← 返回生活有序</Link><p className="eyebrow">内容来源与许可</p><h1>每条知识，都有来处。</h1>
    <h2>上游作品</h2><p>《{upstream.title}》 · {upstream.author} · <a href={upstream.repository}>原始仓库</a>。生活有序为独立衍生产品，未获作者背书或官方合作授权。</p>
    <p>正文依据 <a href={upstream.licenseUrl}>CC BY 4.0（署名 4.0 国际）</a>复用，保留作者、来源与许可，不附加限制。上游指定代码采用 MIT，本站未复用其代码。</p>
    <h2>固定版本与范围</h2><p>同步日期：{upstream.syncedAt}；固定提交：<a href={`${upstream.repository}/commit/${upstream.commit}`}>{upstream.commit}</a>。当前收录 {chapters.length} 章、{chapters.reduce((sum,item)=>sum+item.count,0)} 条知识。完整内容补齐核对日期：{inventory.checkedAt}。另有 {counts.article} 篇专题长文、{counts.verification} 份核实档案、{counts.reference} 份参考文件，完整章节共 {counts.chapter} 份（含导读）。同步不代表对原始文献或政策完成重新核实。</p>
    <p><Link href="/library">阅读专题与全部原始资料 →</Link></p><details><summary>全部文件的同步范围</summary><p>固定提交共 {inventory.files.length} 个文件；293 份正文及参考文件逐文件核对 Git blob 与 SHA-256，并与数据库全文核对。其余 44 个不作为读物导入，原因如下。参考文件的许可范围以其原始说明为准；根目录扩展导航的再分发范围尚需在上线前确认。</p><ul>{inventory.files.filter(file=>file.status==="excluded").map(file=><li key={file.path}><code>{file.path}</code>：{file.reason}</li>)}</ul></details>
    <h2>展示方式</h2><p>正文原样保存，界面提取标题、简明正文、成本收益、证据与来源字段；摘要可能截短，完整原始条目可主动展开。每条保留固定版本定位，不把上游证据等级转成个人适用性结论。专题文章和完整章节保留全部 Markdown、标题层级、列表、表格和引用链接；站内已有的相对链接转到本地文档，其他链接保留上游固定版本。图片以来源链接呈现，原始 HTML 不执行，可展开原始文本核对。核实档案为历史过程，不与专题混作当前建议。当前阅读产品不生成办理流程或个人计划。</p>
    <h2>核实边界</h2><p>已核实仓库许可、提交与条目对应关系，尚未逐项重新审核原始文献、链接有效性与地区规则。使用前请结合自身情况核对依据。</p><Link href="/knowledge">浏览全部知识 →</Link>
  </main>;
}
