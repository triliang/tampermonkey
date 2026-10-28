import {JSDOM} from 'jsdom';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url); const dom=new JSDOM(readFileSync(new URL('public-source.html',root),'utf8')); const d=dom.window.document;
const assets=[];
// Frozen SSR fixture: original hydration removes this boot-only visibility gate.
d.querySelectorAll('.layout-wrapper.not-visible').forEach(e=>e.classList.remove('not-visible'));
function asset(raw,kind){try{const u=new URL(raw,'https://www.csdn.net/');if(u.protocol!=='https:')return '';const path='assets/'+createHash('sha256').update(u.href).digest('hex').slice(0,20)+(kind==='css'?'.css':'.img'); if(!assets.some(a=>a.path===path))assets.push({url:u.href,path,kind});return path;}catch{return '';}}
d.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv],link:not([rel="stylesheet"])').forEach(e=>e.remove());
for(const e of d.querySelectorAll('*'))for(const a of [...e.attributes]){if(/^on/i.test(a.name)||['srcset','ping','action','formaction','poster','background'].includes(a.name))e.removeAttribute(a.name);}
for(const e of d.querySelectorAll('link[rel="stylesheet"]'))e.setAttribute('href',asset(e.getAttribute('href'),'css'));
for(const e of d.querySelectorAll('img')){const src=e.getAttribute('src')||e.getAttribute('data-src');e.removeAttribute('src');if(src)e.setAttribute('src',asset(src,'image'));e.setAttribute('loading','lazy');}
for(const e of d.querySelectorAll('a,area')){if(e.hasAttribute('href')){e.setAttribute('data-original-href',e.getAttribute('href'));e.setAttribute('href','#');}}
for(const e of d.querySelectorAll('form'))e.replaceWith(...e.childNodes);
for(const e of d.querySelectorAll('[src]'))if(e.tagName!=='IMG')e.removeAttribute('src');
const cleanCss=s=>s.replace(/@import\s+[^;]+;?/gi,'').replace(/url\([^)]*\)/gi,'none');
for(const e of d.querySelectorAll('style'))e.textContent=cleanCss(e.textContent);
for(const e of d.querySelectorAll('[style]'))e.setAttribute('style',cleanCss(e.getAttribute('style')));
const meta=d.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";d.head.prepend(meta);
writeFileSync(new URL('site/index.html',root),dom.serialize());writeFileSync(new URL('assets.json',root),JSON.stringify(assets,null,2));console.log(JSON.stringify({title:d.title,textCharacters:d.body.textContent.length,elements:d.querySelectorAll('*').length,assets:assets.length}));
