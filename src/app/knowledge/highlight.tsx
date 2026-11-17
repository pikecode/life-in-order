import {highlightParts} from '@/lib/knowledge-search';
export default function Highlight({text,terms}:{text:string;terms:string[]}) {
 return highlightParts(text,terms).map((part,index)=>part.match?<mark key={index}>{part.text}</mark>:part.text);
}
