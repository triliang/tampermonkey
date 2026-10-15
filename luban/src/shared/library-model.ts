import type { ScriptRecord } from './v2-types';
export type LibrarySort='updated'|'name'|'host';
export function libraryItems(items:ScriptRecord[],query:string,sort:LibrarySort='updated'):ScriptRecord[]{
  const q=query.trim().toLocaleLowerCase();return items.filter(s=>!s.tombstone&&(!q||s.name.toLocaleLowerCase().includes(q)||(s.host??'').toLocaleLowerCase().includes(q))).sort((a,b)=>{
    const order=sort==='updated'?b.updatedAt-a.updatedAt:sort==='name'?a.name.localeCompare(b.name):(a.host??'').localeCompare(b.host??'');return order||a.id.localeCompare(b.id);
  });
}

export function canRunRecord(r:ScriptRecord,host:string|null):boolean{if(!host)return false;if(r.host)return r.host===host;return r.matches.some(pattern=>{const match=/^\*:\/\/(\*\.)?([^/*:]+)\/\*$/.exec(pattern);return !!match&&(host===match[2]||(!!match[1]&&host.endsWith('.'+match[2])));});}
