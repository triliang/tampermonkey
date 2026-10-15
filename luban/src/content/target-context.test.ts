// @vitest-environment jsdom
import {beforeEach,it,expect} from 'vitest';
import {captureTargetContext,previewRange,clearRangePreview,targetFingerprint} from './target-context';
beforeEach(()=>{document.body.innerHTML='<main><aside><div id="ad"><img id="image"><span>广告</span></div><section id="neighbor">保留推荐</section></aside><article>正文</article></main>';clearRangePreview();});
it('采集完整广告与内容，不选择侧栏/正文',()=>{const c=captureTargetContext(document.querySelector('#image')!);expect(c.candidates.map(x=>x.selector)).toContain('#ad');expect(c.candidates.map(x=>x.tag)).not.toContain('aside');expect(c.candidates.length).toBeLessThanOrEqual(5);});
it('高亮只读，不修改业务布局，目标变化拒绝',()=>{const el=document.querySelector('#ad')!,fp=targetFingerprint(el);previewRange(['#ad'],fp);expect(document.querySelector('[data-luban-ui]')).not.toBeNull();expect((el as HTMLElement).style.display).toBe('');el.append(document.createElement('p'));expect(()=>previewRange(['#ad'],fp)).toThrow('目标已变化');clearRangePreview();expect(document.querySelector('[data-luban-ui]')).toBeNull();});
it('自身UI不参与采集',()=>{const own=document.createElement('div');own.dataset.lubanUi='test';document.body.append(own);expect(captureTargetContext(own).candidates).toEqual([]);});
