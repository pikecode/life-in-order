import ReactMarkdown,{defaultUrlTransform} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {fromMarkdown} from 'mdast-util-from-markdown';
import GithubSlugger from 'github-slugger';
import type {Root} from 'mdast';
import manifest from '../../../content/upstream/manifest.json';
import {resolveDocumentLink} from '@/lib/document-links';
import type {upstream as Upstream} from '../../../content/moving';
type AstNode={type:string;value?:string;depth?:number;children?:AstNode[];data?:{hProperties?:Record<string,unknown>}};
function plain(node:AstNode):string{return node.value??node.children?.map(plain).join('')??'';}
function headings(tree:AstNode,assign=false) {
  const slugger=new GithubSlugger(),outline:{text:string;depth:number;id:string}[]=[];
  function visit(node:AstNode) {
    if(node.type==='heading') {
      const text=plain(node),id=slugger.slug(text);outline.push({text,depth:node.depth!,id});
      if(assign)node.data={...node.data,hProperties:{...node.data?.hProperties,id}};
    }
    node.children?.forEach(visit);
  }
  visit(tree);return outline;
}
export function documentExcerpt(markdown:string) {
  const paragraphs=fromMarkdown(markdown).children.filter(node=>node.type==='paragraph').map(plain).filter(text=>!/^←\s*回总目录/.test(text));
  const text=(paragraphs[0]??plain(fromMarkdown(markdown))).replace(/\s+/g,' ').trim();
  return text.slice(0,180)+(text.length>180?'…':'');
}
export function documentHeadings(markdown:string){return headings(fromMarkdown(markdown));}
function headingIds(){return (tree:Root)=>{headings(tree,true);};}
const paths=new Set(manifest.files.map(file=>file.path));
export default function SourceMarkdown({markdown,path,upstream}:{markdown:string;path:string;upstream:typeof Upstream}) {
  const link=(href:string)=>resolveDocumentLink(defaultUrlTransform(href),path,upstream.repository,upstream.commit,paths);
  return <div className="source-markdown"><ReactMarkdown remarkPlugins={[remarkGfm,headingIds]} skipHtml components={{
    a:({href,children})=>{const url=link(href??'');return url?<a href={url} {...(url.startsWith('http')?{target:'_blank',rel:'noopener noreferrer'}:{})}>{children}</a>:<span>{children}</span>;},
    img:({src,alt})=><a href={link(typeof src==='string'?src:'')} target="_blank" rel="noopener noreferrer">{alt??'上游图片'}（查看来源图片）</a>,
    table:({children})=><div className="source-table"><table>{children}</table></div>,
  }}>{markdown}</ReactMarkdown></div>;
}
