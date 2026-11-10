import { contentVersion } from "../../content/moving";
import HomeHub from "./home-hub";
import { getContent,getKnowledgeHighlights,getKnowledgeChapters } from "@/lib/content-db";
import {relatedArticles} from "@/lib/documents";
export const dynamic="force-dynamic";
export default async function Home() {
  const {upstream}=await getContent(contentVersion);
  if(!upstream)throw new Error("来源尚未导入");
  const [highlights,chapters,articles]=await Promise.all([getKnowledgeHighlights(upstream.commit),getKnowledgeChapters(upstream.commit),relatedArticles(upstream.commit,"")]);
  return <HomeHub highlights={highlights} chapters={chapters} articles={articles} />;
}
