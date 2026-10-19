// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {h,render} from 'preact';
import {act} from 'preact/test-utils';
import {IDBFactory} from 'fake-indexeddb';
import {installHarness} from '../../tests/p2/harness';
import App from './App';
it('正式工作区通过真实服务完成生成/检查/试运行/人工效果确认保存',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());const harness=await installHarness();const root=document.createElement('div');document.body.append(root);
 const button=(name:string)=>[...root.querySelectorAll('button')].find(x=>x.textContent===name)!;
 try{
 await act(async()=>render(h(App,{initialView:'home' as const,embedded:false,initialMode:'v3' as const}),root));
 await vi.waitFor(()=>expect(root.textContent).toContain('shop.example.com'));
 const thinking=root.querySelector<HTMLInputElement>('input[aria-label="推理模式"]')!;expect(thinking.checked).toBe(true);await act(async()=>thinking.click());await vi.waitFor(()=>expect(thinking.disabled).toBe(false));expect(thinking.checked).toBe(false);
 await act(async()=>{const input=root.querySelector('#intent') as HTMLTextAreaElement;input.value='调整字号并保留原功能';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{(root.querySelector('button[aria-label="发送"]') as HTMLButtonElement).click();});
 expect(root.textContent).not.toContain('确认本次发送范围');
 await vi.waitFor(()=>expect(harness.sent.length).toBe(1));
 await vi.waitFor(()=>expect(root.querySelector('.chat-artifact')).not.toBeNull());await vi.waitFor(()=>expect(button('运行').disabled).toBe(false));expect(root.querySelector('.chat-artifact-name')?.textContent).toContain('.user.js');
 await act(async()=>{const input=root.querySelector('input[aria-label="工具名称"]') as HTMLInputElement;input.value='V21 UI TEST';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{button('运行').click();});
 await vi.waitFor(()=>expect(button('效果符合，保存')).toBeDefined());expect(root.textContent).toContain('请检查页面效果');
 await act(async()=>{button('效果符合，保存').click();});
 await vi.waitFor(async()=>expect((await harness.store.list()).some(x=>x.name==='V21 UI TEST')).toBe(true));
 expect(harness.sent.length).toBe(1);expect(harness.modelOptions[0].thinking).toBe(false);
 // 引用只添加上下文，不自动发送；生成期间的新输入保留到下一轮。
 Object.defineProperties(HTMLDialogElement.prototype,{showModal:{configurable:true,value:function(){this.open=true;}},close:{configurable:true,value:function(){this.open=false;}}});
 await vi.waitFor(()=>expect(root.querySelector<HTMLButtonElement>('.chat-artifact-name')!.disabled).toBe(false));
 await act(async()=>root.querySelector<HTMLButtonElement>('.chat-artifact-name')!.click());
 await vi.waitFor(()=>expect(root.querySelector<HTMLDialogElement>('.chat-code-dialog')!.open).toBe(true));
 await act(async()=>root.querySelector<HTMLLIElement>('.chat-code-lines li')!.click());
 await act(async()=>button('添加到聊天').click());
 await vi.waitFor(()=>expect(document.activeElement?.id).toBe('intent'));
 expect(root.querySelector('.chat-reference')?.textContent).toContain('L1');expect(harness.sent.length).toBe(1);
 const type=async(text:string)=>act(async()=>{const area=root.querySelector<HTMLTextAreaElement>('#intent')!;area.value=text;area.dispatchEvent(new Event('input',{bubbles:true}));});
 await type('继续调整字号');
 await act(async()=>button('发送范围').click());
 await vi.waitFor(()=>expect(root.textContent).toContain('本轮发送详情'));
 expect(harness.sent.length).toBe(1);
 await act(async()=>button('返回修改').click());
 // 输入法确认 Enter 不得发送。
 await act(async()=>{root.querySelector('#intent')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));});
 expect(harness.sent.length).toBe(1);
 await act(async()=>root.querySelector<HTMLButtonElement>('button[aria-label="发送"]')!.click());
 await vi.waitFor(()=>expect(harness.sent.length).toBe(2));
 expect(root.querySelector('button[aria-label="停止生成"]')).not.toBeNull();
 await type('下一条尚未发送');
 await vi.waitFor(()=>expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('下一条尚未发送'));
 await vi.waitFor(()=>expect(root.querySelector('button[aria-label="停止生成"]')).toBeNull());
 expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('下一条尚未发送');
 expect(root.querySelector('.chat-reference')).toBeNull();expect(root.querySelector('.chat-reference-history')).not.toBeNull();
 expect(JSON.stringify(harness.sent[1])).toContain('L1:');
 expect((await harness.store.list()).find(x=>x.name==='V21 UI TEST')?.id).toBeDefined();

 }finally{render(null,root);root.remove();await harness.close();vi.unstubAllGlobals();}
});
it('左侧网页预览回传引用时保留聊天输入，关闭后可直接继续生成',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());const harness=await installHarness(undefined,true);const root=document.createElement('div');document.body.append(root);
 const type=async(text:string)=>act(async()=>{const area=root.querySelector<HTMLTextAreaElement>('#intent')!;area.value=text;area.dispatchEvent(new Event('input',{bubbles:true}));});
 try{
 await act(async()=>render(h(App,{initialView:'home' as const,embedded:false,initialMode:'v3' as const}),root));await vi.waitFor(()=>expect(root.textContent).toContain('shop.example.com'));await type('调整字号');await act(async()=>root.querySelector<HTMLButtonElement>('button[aria-label="发送"]')!.click());await vi.waitFor(()=>expect(root.querySelector('.chat-artifact')).not.toBeNull());
 await vi.waitFor(()=>expect(root.querySelector<HTMLButtonElement>('.chat-artifact-name')!.disabled).toBe(false));
 await act(async()=>root.querySelector<HTMLButtonElement>('.chat-artifact-name')!.click());await vi.waitFor(()=>expect(harness.preview()).not.toBeNull());expect(root.querySelector<HTMLDialogElement>('.chat-code-dialog')!.open).toBe(false);
 await type('只修改这段，保留其他功能');const preview=harness.preview()!;
 await act(async()=>{await harness.previewAction({action:'reference',versionId:preview.current.versionId,lines:[1]});});expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('只修改这段，保留其他功能');expect(root.querySelector('.chat-reference')?.textContent).toContain('L1');
 await act(async()=>{await harness.previewAction({action:'close'});});await vi.waitFor(()=>expect(document.activeElement?.id).toBe('intent'));
 await act(async()=>root.querySelector<HTMLButtonElement>('button[aria-label="发送"]')!.click());await vi.waitFor(()=>expect(harness.sent.length).toBe(2));expect(JSON.stringify(harness.sent[1])).toContain('只修改这段');expect(JSON.stringify(harness.sent[1])).toContain('L1:');
 await vi.waitFor(()=>expect(root.querySelector('button[aria-label="停止生成"]')).toBeNull());
 // 网页预览已打开，但键盘焦点回到侧栏时，Esc 仍应关闭预览并保留尚未发送的输入。
 await act(async()=>root.querySelector<HTMLButtonElement>('.chat-artifact-name')!.click());
 await vi.waitFor(()=>expect(harness.preview()).not.toBeNull());
 await vi.waitFor(()=>expect(root.querySelector<HTMLButtonElement>('.chat-artifact-name')!.disabled).toBe(false));
 await type('Esc 后保留的未发送内容');
 await act(async()=>{root.querySelector<HTMLTextAreaElement>('#intent')!.focus();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
 await vi.waitFor(()=>expect(harness.preview()).toBeNull());
 expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('Esc 后保留的未发送内容');expect(harness.sent).toHaveLength(2);
 }finally{render(null,root);root.remove();await harness.close();vi.unstubAllGlobals();}
});

it('固定tab侧栏忽略其他标签激活/导航，输入与执行方只写入本tab',async()=>{
 const previous=window.location.href;window.history.replaceState(null,'','?tabId=1');vi.stubGlobal('indexedDB',new IDBFactory());const harness=await installHarness();const root=document.createElement('div');document.body.append(root);
 try{await act(async()=>render(h(App,{initialView:'home',embedded:false,initialMode:'v3' as const}),root));await vi.waitFor(()=>expect(root.textContent).toContain('shop.example.com'));
 await act(async()=>{const area=root.querySelector<HTMLTextAreaElement>('#intent')!;area.value='仅属于标签A';area.dispatchEvent(new Event('input',{bubbles:true}));});
 const reads=harness.siteReads;await act(async()=>{harness.activateOtherTab();harness.navigateTab(2);});expect(harness.siteReads).toBe(reads);expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('仅属于标签A');
 await act(async()=>{const select=root.querySelector<HTMLSelectElement>('select[aria-label="执行方"]')!;select.value='codex';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(harness.sessionValues()).toEqual({'luban:v3:executor:tab:1':'codex'});
 await act(async()=>harness.navigateTab(1));await vi.waitFor(()=>expect(harness.siteReads).toBe(reads+1));
 }finally{render(null,root);root.remove();await harness.close();vi.unstubAllGlobals();window.history.replaceState(null,'',previous);}
});

it('工具栏临时授权后回到侧栏恢复发送，保留输入且不自动调用模型',async()=>{
 const previous=window.location.href;window.history.replaceState(null,'','?tabId=1');vi.stubGlobal('indexedDB',new IDBFactory());const harness=await installHarness();const root=document.createElement('div');document.body.append(root);
 const original=chrome.runtime.sendMessage;let granted=false;
 chrome.runtime.sendMessage=vi.fn(async(message)=>message.type==='GET_CURRENT_SITE'&&!granted?{ok:false,error:{message:'网页未授权',code:'ACTIVE_TAB_EXPIRED',layer:'capture',actions:[]}}:original(message)) as typeof original;
 try{await act(async()=>render(h(App,{initialView:'home',embedded:false,initialMode:'v3' as const}),root));await vi.waitFor(()=>expect(root.textContent).toContain('当前网页尚不可访问'));
 await act(async()=>{const area=root.querySelector<HTMLTextAreaElement>('#intent')!;area.value='继续保留未发送内容';area.dispatchEvent(new Event('input',{bubbles:true}));});expect(root.querySelector<HTMLButtonElement>('button[aria-label="发送"]')!.disabled).toBe(true);
 await act(async()=>{granted=true;window.dispatchEvent(new Event('focus'));});await vi.waitFor(()=>expect(root.querySelector<HTMLButtonElement>('button[aria-label="发送"]')!.disabled).toBe(false));expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('继续保留未发送内容');expect(harness.sent).toHaveLength(0);
 }finally{await act(async()=>render(null,root));root.remove();await harness.close();vi.unstubAllGlobals();window.history.replaceState(null,'',previous);}
});
