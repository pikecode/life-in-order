export function documentHref(path:string){return '/library/'+path.split('/').map(encodeURIComponent).join('/');}
export function resolveDocumentLink(href:string,currentPath:string,repository:string,commit:string,paths:ReadonlySet<string>) {
  if(!href)return '';
  if(href.startsWith('#'))return href;
  try {
    const base=new URL('https://source.invalid/'+currentPath),target=new URL(href,base);
    if(target.origin===base.origin) {
      const path=decodeURIComponent(target.pathname.slice(1));
      return paths.has(path)?documentHref(path)+target.hash:repository+'/blob/'+commit+'/'+path.split('/').map(encodeURIComponent).join('/')+target.hash;
    }
    const repo=new URL(repository);
    if(target.origin===repo.origin&&target.pathname.startsWith(repo.pathname+'/blob/')) {
      const rest=target.pathname.slice((repo.pathname+'/blob/').length),slash=rest.indexOf('/');
      const ref=rest.slice(0,slash),path=decodeURIComponent(rest.slice(slash+1));
      if(['main',commit].includes(ref)&&paths.has(path))return documentHref(path)+target.hash;
    }
    return href;
  }catch{return '';}
}
