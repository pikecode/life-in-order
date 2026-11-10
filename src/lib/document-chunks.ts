import { contentHash,embeddingText } from "./embeddings";
export function documentChunks(title:string,markdown:string) {
  const headings=[...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match=>({offset:match.index,title:match[1]}));
  const chunks:{number:number;start:number;end:number;heading:string;text:string;hash:string}[]=[];
  let start=0,headingIndex=0;
  while(start<markdown.length) {
    let end=Math.min(start+1800,markdown.length);
    if(end<markdown.length) {
      const paragraph=markdown.lastIndexOf("\n\n",end);
      if(paragraph>start+900)end=paragraph+2;
      const last=markdown.charCodeAt(end-1);
      if(last>=0xD800&&last<=0xDBFF)end--;
    }
    while(headingIndex+1<headings.length&&headings[headingIndex+1].offset<=start)headingIndex++;
    const heading=headings[headingIndex]?.offset<=start?headings[headingIndex].title:"";
    const text=embeddingText({title:[title,heading].filter(Boolean).join(" / "),body:markdown.slice(start,end)});
    chunks.push({number:chunks.length+1,start,end,heading,text,hash:contentHash(text)});start=end;
  }
  return chunks;
}
