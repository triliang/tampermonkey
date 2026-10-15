// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {act} from 'preact/test-utils';
import {showCodePreview,dismissCodePreview} from './code-preview';
import type {CodePreviewSnapshot} from '../shared/code-preview-types';
it('代码浮层隔离样式，支持选行与编辑保护；不向网页布局或脚本写入代码',async()=>{
 Object.defineProperties(HTMLDialogElement.prototype,{showModal:{configurable:true,value:function(){this.open=true;}},close:{configurable:true,value:function(){this.open=false;}}});
 const attach=vi.spyOn(HTMLElement.prototype,'attachShadow');const snapshot:CodePreviewSnapshot={sessionId:'s',workspaceId:'w',name:'工具',hasReference:false,current:{versionId:'v',hash:'h',code:'const n=1;\n// <img src=x onerror=alert(1)>',grants:[],explanation:'test',createdAt:1,runAt:'document_end'}};
 const send=vi.fn(async()=>({ok:true,data:snapshot}));vi.stubGlobal('chrome',{runtime:{sendMessage:send}});
 try{
 await act(async()=>{expect(await showCodePreview(snapshot)).toEqual({ok:true});});
 const host=document.querySelector('[data-luban-ui="code-preview"]')!;expect(host.shadowRoot).toBeNull();const root=attach.mock.results[0].value as ShadowRoot;expect(root.querySelector('img')).toBeNull();expect(document.querySelector('dialog')).toBeNull();
 const button=(s:string)=>[...root.querySelectorAll('button')].find(x=>x.textContent===s)!;
 await act(async()=>button('编辑代码').click());await act(async()=>{const area=root.querySelector('textarea')!;area.value='const n=2;';area.dispatchEvent(new Event('input',{bubbles:true}));});expect(dismissCodePreview('s').ok).toBe(false);
 await act(async()=>button('放弃本次编辑').click());await act(async()=>root.querySelector<HTMLLIElement>('li')!.click());await act(async()=>button('添加到聊天').click());
 await vi.waitFor(()=>expect(send.mock.calls.some(c=>(c as unknown as [{action:string}])[0].action==='reference')).toBe(true));
 expect(document.querySelector('[data-luban-ui="code-preview"]')).toBeNull();expect(document.querySelector('script')).toBeNull();
 }finally{dismissCodePreview('s');attach.mockRestore();vi.unstubAllGlobals();}
});
