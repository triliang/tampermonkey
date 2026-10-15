// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {startElementPicker} from './element-picker';
import {captureTargetContext} from './target-context';
afterEach(()=>{document.body.innerHTML='';document.querySelectorAll('[data-luban-ui]').forEach(el=>el.remove());vi.restoreAllMocks();});
function fixture(){document.body.innerHTML='<div id="ad"><iframe id="frame" src="https://other.invalid/ad"></iframe><span>广告</span></div><article>正文</article>';const frame=document.querySelector('iframe')!,ad=document.querySelector('#ad')!;const picked=vi.fn(),cancelled=vi.fn();const handle=startElementPicker(picked,cancelled);const shield=document.querySelector<HTMLElement>('#__luban_picker_overlay')!;Object.defineProperty(document,'elementsFromPoint',{configurable:true,value:vi.fn(()=>{expect(shield.style.pointerEvents).toBe('none');return[shield,frame,ad,document.body];})});return{frame,ad,shield,picked,cancelled,handle};}
it('iframe 外框可命中，屏蔽广告点击，不读取跨域内容、不污染目标样式',()=>{
 const f=fixture();f.shield.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:30,clientY:40}));expect(f.shield.textContent).toContain('iframe 外框');expect(f.shield.style.pointerEvents).toBe('auto');expect(f.frame.className).toBe('');expect(captureTargetContext(f.frame).candidates.map(c=>c.selector)).toContain('#ad');
 const e=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:30,clientY:40});f.shield.dispatchEvent(e);expect(e.defaultPrevented).toBe(true);expect(f.picked).toHaveBeenCalledWith(f.frame);expect(document.querySelector('#__luban_picker_overlay')).toBeNull();f.handle.stop();
});
it('上下键选择父广告模块并返回，Enter 选择完整容器而非 iframe',()=>{
 const f=fixture();f.shield.dispatchEvent(new MouseEvent('mousemove',{clientX:30,clientY:40}));const key=(key:string)=>f.shield.dispatchEvent(new KeyboardEvent('keydown',{key,cancelable:true}));key('ArrowUp');expect(f.shield.textContent).toContain('div#ad');key('ArrowDown');expect(f.shield.textContent).toContain('iframe#frame');key('ArrowUp');key('Enter');expect(f.picked).toHaveBeenCalledWith(f.ad);expect(f.cancelled).not.toHaveBeenCalled();
});
it('顶层覆盖可用时使用非模态 popover，Esc 完整清理并恢复焦点',()=>{
 const show=vi.fn(),hide=vi.fn();Object.defineProperties(HTMLElement.prototype,{showPopover:{configurable:true,value:show},hidePopover:{configurable:true,value:hide}});document.body.innerHTML='';const previous=document.createElement('button');document.documentElement.append(previous);previous.focus();const f=fixture();expect(show).toHaveBeenCalledOnce();f.shield.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(hide).toHaveBeenCalledOnce();expect(f.cancelled).toHaveBeenCalledOnce();expect(f.picked).not.toHaveBeenCalled();expect(document.querySelector('[data-luban-ui]')).toBeNull();expect(document.activeElement).toBe(previous);previous.remove();delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
});
