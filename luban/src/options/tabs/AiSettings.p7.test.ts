// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,h} from 'preact';
import {act} from 'preact/test-utils';
import {STRINGS} from '../../shared/i18n-strings';
import {AiSettings} from './AiSettings';
import {DEFAULT_SETTINGS,getApiKey,getSettings,saveApiKey,saveSettings} from '../../shared/settings-store';
let root:HTMLDivElement;
let request:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
 const area=()=>{const data:Record<string,unknown>={};return {get:async(k:string)=>({[k]:data[k]}),set:async(x:object)=>Object.assign(data,x),remove:async(k:string)=>{delete data[k];}};};
 request=vi.fn(async()=>false);
 vi.stubGlobal('chrome',{storage:{sync:area(),local:area()},permissions:{request},runtime:{sendMessage:vi.fn()}});
 await saveSettings(DEFAULT_SETTINGS);await saveApiKey('sk-original');await saveApiKey('custom-key',true);
 root=document.createElement('div');document.body.append(root);await act(async()=>{render(h(AiSettings,{}),root);});
 await vi.waitFor(()=>expect(root.querySelector('input[aria-label="API Key"]')).not.toBeNull());
});
afterEach(()=>{render(null,root);root.remove();vi.unstubAllGlobals();});
it('不在加载时授权；拒绝自定义权限不切换设置或 Key，切回预设回显原 Key',async()=>{
 expect(request).not.toHaveBeenCalled();
 const toggle=[...root.querySelectorAll('label')].find(e=>e.textContent?.includes('启用自定义 OpenAI'))!.querySelector('input')!;
 await act(async()=>{toggle.click();});
 await vi.waitFor(()=>expect((root.querySelector('input[aria-label="API Key"]') as HTMLInputElement).value).toBe('custom-key'));
 const base=[...root.querySelectorAll('input')].find(e=>e.placeholder==='https://example.com/v1')!;
 const model=[...root.querySelectorAll('label')].find(e=>e.textContent==='模型名称')!.querySelector('input')!;
 await act(async()=>{base.value='http://localhost:18889/v1';base.dispatchEvent(new Event('input',{bubbles:true}));model.value='p7-local-test';model.dispatchEvent(new Event('input',{bubbles:true}));});
 const save=[...root.querySelectorAll('button')].find(e=>e.textContent===STRINGS.options.save)!;
 await act(async()=>{save.click();});
 expect(request).toHaveBeenCalledWith({origins:['http://localhost/*']});expect((await getSettings()).customEndpoint).toBeUndefined();expect(await getApiKey()).toBe('sk-original');
 expect(root.textContent).toContain('旧配置未切换');
 await act(async()=>{toggle.click();});await vi.waitFor(()=>expect((root.querySelector('input[aria-label="API Key"]') as HTMLInputElement).value).toBe('sk-original'));
});
it('推理默认勾选，关闭并保存后重开仍关闭，不调用模型',async()=>{
 const checkbox=root.querySelector<HTMLInputElement>('[aria-label="启用推理模式"]')!;expect(checkbox.checked).toBe(true);await act(async()=>checkbox.click());await act(async()=>[...root.querySelectorAll('button')].find(e=>e.textContent===STRINGS.options.save)!.click());await vi.waitFor(async()=>expect((await getSettings()).thinkingEnabled).toBe(false));await act(async()=>{render(null,root);render(h(AiSettings,{}),root);});await vi.waitFor(()=>expect(root.querySelector<HTMLInputElement>('[aria-label="启用推理模式"]')?.checked).toBe(false));expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
});
