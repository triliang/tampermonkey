// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mountLauncher} from './launcher';
afterEach(()=>{document.body.innerHTML='';vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(url:string|undefined='https://example.com/page',options=Promise.resolve()){
 document.body.innerHTML='<p id="page"></p><button id="open" disabled>打开</button><p id="status"></p>';
 const open=vi.fn(async()=>{}),setOptions=vi.fn(()=>options),query=vi.fn(async()=>[{id:11,url}]);
 vi.stubGlobal('chrome',{tabs:{query},sidePanel:{open,setOptions}});vi.spyOn(window,'close').mockImplementation(()=>{});mountLauncher(document);
 return {open,setOptions,query,button:document.querySelector<HTMLButtonElement>('#open')!};
}
it('准备路径后才可点；真实按钮手势内同步调用open且固定在起始tab',async()=>{
 let resolve!:()=>void;const fixture=setup(undefined,new Promise<void>(r=>resolve=r));
 // Explicit undefined uses the default normal URL in setup.
 expect(fixture.button.disabled).toBe(true);await vi.waitFor(()=>expect(fixture.setOptions).toHaveBeenCalled());expect(fixture.button.disabled).toBe(true);resolve();
 await vi.waitFor(()=>expect(fixture.button.disabled).toBe(false));expect(document.querySelector('#page')!.textContent).toBe('example.com');
 fixture.query.mockResolvedValue([{id:22,url:'https://other.example/'}]);fixture.button.click();expect(fixture.open).toHaveBeenCalledWith({tabId:11});expect(fixture.query).toHaveBeenCalledTimes(1);expect(fixture.setOptions).toHaveBeenCalledWith({tabId:11,path:'src/sidepanel/index.html?tabId=11',enabled:true});await vi.waitFor(()=>expect(window.close).toHaveBeenCalled());
});
it('受限或无URL页面不会显示可打开状态或请求全站权限',async()=>{
 for(const url of ['chrome://extensions','']){const fixture=setup(url);await vi.waitFor(()=>expect(document.querySelector('#status')!.textContent).toContain('普通 HTTP/HTTPS'));expect(fixture.button.disabled).toBe(true);expect(fixture.setOptions).not.toHaveBeenCalled();expect(fixture.open).not.toHaveBeenCalled();}
});
it('配置失败不打开；打开失败保留小窗口并可重试',async()=>{
 let fixture=setup('https://example.com',Promise.reject(Error('configuration denied')));await vi.waitFor(()=>expect(document.querySelector('#status')!.textContent).toContain('configuration denied'));expect(fixture.button.disabled).toBe(true);expect(fixture.open).not.toHaveBeenCalled();
 fixture=setup();await vi.waitFor(()=>expect(fixture.button.disabled).toBe(false));fixture.open.mockRejectedValueOnce(Error('gesture rejected'));fixture.button.click();await vi.waitFor(()=>expect(document.querySelector('#status')!.textContent).toContain('gesture rejected'));expect(fixture.button.disabled).toBe(false);expect(window.close).not.toHaveBeenCalled();
});
