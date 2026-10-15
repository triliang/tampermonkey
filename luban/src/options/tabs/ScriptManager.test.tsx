// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,h} from 'preact';
import {act} from 'preact/test-utils';
import {IDBFactory} from 'fake-indexeddb';
import {installHarness} from '../../../tests/p2/harness';
import {ScriptManager} from './ScriptManager';
it('管理页只有脚本核心操作，无聊天或会话；编辑仍需试运行后保存',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());const harness=await installHarness();const root=document.createElement('div');document.body.append(root);Object.defineProperties(HTMLDialogElement.prototype,{showModal:{configurable:true,value:function(){this.open=true;}},close:{configurable:true,value:function(){this.open=false;}}});
 Object.assign(chrome.tabs,{query:async()=>[{id:1,url:'https://shop.example.com/products',windowId:1}],get:async()=>({id:1,url:'https://shop.example.com/products',windowId:1}),update:async()=>({})});Object.assign(chrome,{windows:{update:async()=>({})}});
 const button=(s:string)=>[...root.querySelectorAll('button')].find(b=>b.textContent===s)!;
 try{
 await act(async()=>render(h(ScriptManager,{}),root));await vi.waitFor(()=>expect(root.textContent).toContain('价格一眼可见'));expect(root.querySelector('#intent')).toBeNull();expect(root.textContent).not.toContain('保留的草稿');expect(root.textContent).not.toContain('导出保存版');expect(root.textContent).not.toContain('当前页运行');
 await act(async()=>root.querySelector<HTMLButtonElement>('button[title="查看 / 编辑"]')!.click());await vi.waitFor(()=>expect(button('编辑代码').disabled).toBe(false));expect(root.querySelector('.chat-line-actions')).toBeNull();await act(async()=>button('编辑代码').click());await act(async()=>{const area=root.querySelector('textarea')!;area.value='console.log("manager-edit")';area.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>button('保留为未验证草稿').click());await vi.waitFor(()=>expect(button('在网页试运行')).toBeDefined());expect(button('效果符合，保存').disabled).toBe(true);expect((await harness.store.record('a'))!.current.code).not.toContain('manager-edit');
 await act(async()=>button('在网页试运行').click());await vi.waitFor(()=>expect(button('效果符合，保存').disabled).toBe(false));await act(async()=>button('效果符合，保存').click());await vi.waitFor(async()=>expect((await harness.store.record('a'))!.current.code).toContain('manager-edit'));expect((await harness.store.record('a'))!.previous).not.toBeNull();
 }finally{render(null,root);root.remove();await harness.close();vi.unstubAllGlobals();}
});
