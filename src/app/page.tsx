import "./home.css";
import {getPublicContent} from "@/lib/content-publication";
import HomeHub from "./home-hub";
import { getKnowledgeHighlights,getKnowledgeChapters } from "@/lib/content-db";
import {relatedArticles} from "@/lib/documents";
export const dynamic="force-dynamic";
export default async function Home() {
  const {upstream}=await getPublicContent();
  if(!upstream)throw new Error("来源尚未导入");
  const [highlights,chapters,articles]=await Promise.all([getKnowledgeHighlights(upstream.commit),getKnowledgeChapters(upstream.commit),relatedArticles(upstream.commit,"")]);
  return <HomeHub highlights={highlights} chapters={chapters} articles={articles} sourceCommit={upstream.commit} />;
}
