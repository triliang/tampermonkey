import { expect,it } from 'vitest';
import { libraryItems,canRunRecord } from './library-model';
import type { ScriptRecord } from './v2-types';
const item=(id:string,name:string,host:string,time:number)=>({id,name,host,updatedAt:time,matches:[`*://${host}/*`],tombstone:false}) as ScriptRecord;
it('默认最近更新，名称/host不区分大小写搜索，空结果与空列表可区分',()=>{const items=[item('a','Alpha','shop.example.com',1),item('b','Beta','news.example.com',2)];expect(libraryItems(items,'').map(r=>r.id)).toEqual(['b','a']);expect(libraryItems(items,' ALPHA ').map(r=>r.id)).toEqual(['a']);expect(libraryItems(items,'NEWS').map(r=>r.id)).toEqual(['b']);expect(libraryItems(items,'missing')).toEqual([]);expect(libraryItems(items,'','name').map(r=>r.id)).toEqual(['a','b']);});
it('准确站点不误匹配子域，旧宽规则仅保留手动匹配能力',()=>{const a=item('a','A','example.com',1);expect(canRunRecord(a,'sub.example.com')).toBe(false);expect(canRunRecord(a,'example.com')).toBe(true);expect(canRunRecord(a,null)).toBe(false);expect(canRunRecord({...a,host:null,matches:['*://*.example.com/*']},'sub.example.com')).toBe(true);});
