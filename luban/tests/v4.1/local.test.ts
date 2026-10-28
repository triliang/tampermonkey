import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TargetRegistry} from '../../src/content/annotations/registry';
// @ts-expect-error Test-only JS evaluator has no published type declaration.
import {judge} from './judge.mjs';
import scenarios from './scenarios.json';
const fixture=(name:string)=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
beforeEach(()=>{vi.spyOn(Element.prototype,'getClientRects').mockReturnValue([{width:100,height:30}] as unknown as DOMRectList);});
afterEach(()=>{vi.restoreAllMocks();document.body.replaceChildren();document.body.removeAttribute('style');});
for(const [file,selector] of [['article.html','#slot'],['cards.html','.paid']]){
 it(file+': production checker preserves other regions',()=>{document.documentElement.innerHTML=fixture(file);const r=new TargetRegistry();r.scan();const el=document.querySelector(selector) as HTMLElement;const target=r.manual(el).target;const main=document.querySelector('main')!.outerHTML;r.prepare([target.id]);el.style.display='none';const report=r.check([target.id]);expect(report.passed).toBe(true);expect(report.goalStatus).toBe('not-assessed');expect(document.querySelector('main')!.outerHTML).toBe(main);});
 it(file+': broad ancestor mutation cannot pass',()=>{document.documentElement.innerHTML=fixture(file);const r=new TargetRegistry();r.scan();const t=r.manual(document.querySelector(selector)!).target;r.prepare([t.id]);document.body.style.display='none';expect(r.check([t.id]).passed).toBe(false);});
}
it('child-only hiding cannot satisfy the confirmed complete container',()=>{document.documentElement.innerHTML=fixture('article.html');const r=new TargetRegistry();r.scan();const t=r.manual(document.querySelector('#slot')!).target;(document.querySelector('iframe') as HTMLElement).style.display='none';expect(r.check([t.id]).passed).toBe(false);});
it('same markup replacement invalidates the original confirmed identity',()=>{document.documentElement.innerHTML=fixture('article.html');const r=new TargetRegistry();r.scan();const t=r.manual(document.querySelector('#slot')!).target;const el=document.querySelector('#slot')!;el.outerHTML=el.outerHTML;expect(()=>r.resolve([t.id])).toThrow('TARGET_STALE');});
it('duplicate IDs do not yield an ambiguous selector',()=>{document.documentElement.innerHTML=fixture('cards.html');const r=new TargetRegistry();r.scan();const t=r.manual(document.querySelector('.paid')!).target;for(const s of r.resolve([t.id])[0].selectors)expect(document.querySelectorAll(s)).toHaveLength(1);});
it('statistics fixture independently yields exact golden values without DOM mutation',()=>{document.documentElement.innerHTML=fixture('statistics.html');const before=document.body.innerHTML;const unique=new Map<string,string>();for(const row of document.querySelectorAll('tbody tr')){const cells=[...row.querySelectorAll('td')].map(c=>c.textContent!.trim());if(cells[1]==='已完成'&&!unique.has(cells[0]))unique.set(cells[0],cells[2]);}const amounts=[...unique.values()].filter(Boolean).map(s=>Math.round(Number(s)*100));expect({count:unique.size,amountCount:amounts.length,totalCents:amounts.reduce((a,b)=>a+b,0),meanCents:Math.round(amounts.reduce((a,b)=>a+b,0)/amounts.length*100)/100}).toEqual(scenarios[2].statistics);expect(document.body.innerHTML).toBe(before);});
for(const s of scenarios){
 it(s.id+': oracle accepts correct equivalent node references',()=>{expect(judge(s,fixture(s.file),{targets:s.targets,statistics:s.statistics,complete:false,modify:false}).passed).toBe(true);});
 it(s.id+': rejects false completion and unauthorized modification',()=>{expect(judge(s,fixture(s.file),{targets:s.targets,statistics:s.statistics,complete:true,modify:true}).passed).toBe(false);});
}
it('oracle rejects duplicate-ID broad targets and wrong totals',()=>{expect(judge(scenarios[1],fixture('cards.html'),{targets:['#duplicate'],statistics:null,complete:false,modify:false}).passed).toBe(false);expect(judge(scenarios[2],fixture('statistics.html'),{targets:[],statistics:{...scenarios[2].statistics,totalCents:4500},complete:false,modify:false}).passed).toBe(false);});
it('oracle rejects malformed types and extra fields',()=>{for(const answer of [null,{}, {targets:[],statistics:null,complete:false,modify:false,passed:true},{targets:[1],statistics:null,complete:false,modify:false}])expect(judge(scenarios[3],fixture('article.html'),answer).passed).toBe(false);});

it('review regression: duplicate references and numeric strings fail closed',()=>{expect(judge(scenarios[0],fixture('article.html'),{targets:['#slot','#slot'],statistics:null,complete:false,modify:false}).passed).toBe(false);expect(judge(scenarios[2],fixture('statistics.html'),{targets:[],statistics:{...scenarios[2].statistics,count:'4'},complete:false,modify:false}).passed).toBe(false);});

it('model regression: hiding child fragments cannot satisfy the confirmed enclosing range',()=>{
 document.documentElement.innerHTML=fixture('article.html');
 const registry=new TargetRegistry();registry.scan();
 const target=registry.manual(document.querySelector('#slot')!).target;
 registry.prepare([target.id]);
 const selectors=['aside#slot > span','aside#slot > div.slide:nth-of-type(1)','aside#slot > div.slide:nth-of-type(2)'];
 for(const selector of selectors)(document.querySelector(selector) as HTMLElement).style.display='none';
 expect(registry.check([target.id]).passed).toBe(false);
 expect(judge(scenarios[0],fixture('article.html'),{targets:selectors,statistics:null,complete:false,modify:false}).errors).toContain('target-mismatch');
});
