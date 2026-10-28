// Synthetic candidate recall, not model accuracy or an A/B/C/D comparison.
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {build} from 'vite';
const {chromium}=await import(process.env.LUBAN_PLAYWRIGHT_MODULE);
const root=fileURLToPath(new URL('..',import.meta.url)),dir=mkdtempSync('/private/tmp/luban-retrieval-');
const output=process.env.LUBAN_ACCEPTANCE_OUTPUT??join(root,'docs/v4.3/evidence');mkdirSync(output,{recursive:true});
const units=[
 {query:'登录入口',html:'<button id="needle">登录入口</button>'},
 {query:'account settings',html:'<button id="needle" aria-label="Account settings"></button>'},
 {query:'通知',html:'<button id="needle" aria-label="通知"><svg></svg></button>'},
 {query:'个人资料',html:'<img id="needle" alt="个人资料" src="/avatar.png">'},
 {query:'邮箱地址',html:'<label for="needle">邮箱地址</label><input id="needle" value="must-not-be-collected">'},
 {query:'download-entry',html:'<button id="needle" class="download-entry"><svg></svg></button>'},
 {query:'profile-photo',html:'<img id="needle" src="https://example.org/profile-photo.png?private=excluded">'},
 {query:'导航',html:'<nav id="needle">导航</nav>'},
];
const layouts=['flow','grid','form','nested','duplicate'];
const cases=layouts.flatMap(layout=>units.map((unit,index)=>({id:layout+'-'+index,layout,query:unit.query,html:layout==='grid'?'<section style="display:grid;grid-template-columns:1fr 1fr">'+unit.html+'<p>普通内容</p></section>':layout==='form'?'<form><fieldset><legend>访问方式</legend>'+unit.html+'</fieldset></form>':layout==='nested'?'<section><div><div>'+unit.html+'</div></div></section>':layout==='duplicate'?unit.html+unit.html.replaceAll('needle','similar'):unit.html,gold:layout==='duplicate'?['needle','similar']:['needle']})));
const report={timestamp:new Date().toISOString(),realBrowser:true,realModel:false,syntheticCoverageOnly:true,humanGoldReviewed:false,comparisonCompleted:false,repeats:3,layouts:5,cases:40,suiteHash:createHash('sha256').update(JSON.stringify(cases)).digest('hex'),rows:[]};
let browser;
try{
 const entry=join(dir,'entry.mjs');writeFileSync(entry,`import {TargetRegistry} from ${JSON.stringify(join(root,'src/content/annotations/registry.ts'))};import {lexicalSearch} from ${JSON.stringify(join(root,'contracts/lexical-search.mjs'))};export function probe(query){const start=performance.now();const registry=new TargetRegistry();const source=registry.observe();const matches=lexicalSearch(source.blocks,query,20);return {ids:matches.map(b=>b.attributes?.id).filter(Boolean),durationMs:performance.now()-start,truncated:source.truncated,privateValueCollected:JSON.stringify(source).includes('must-not-be-collected')};}export function identityProbe(){document.body.innerHTML='<nav id="keep">导航</nav><button id="entry" aria-label="入口"></button>';const registry=new TargetRegistry();const first=registry.observe().blocks;const button=first.find(b=>b.tag==='button');const nav=first.find(b=>b.tag==='nav');const protectedTarget=registry.readBlock(nav.id).target;document.querySelector('#entry').outerHTML='<button id="entry" aria-label="入口"></button>';let stale=false;try{registry.readBlock(button.id);}catch{stale=true;}const fresh=registry.observe().blocks.find(b=>b.tag==='button');return {replacementRejected:stale,newNodeHasNewReference:fresh.id!==button.id,protectedRootIsObservationOnly:protectedTarget===null};}export function coverageProbe(){document.body.innerHTML='<nav>'+Array.from({length:1100},(_,i)=>'<a href="/item/'+i+'">普通链接 '+i+'</a>').join('')+'</nav><section id="late-region" aria-label="后部独立区域">后部独立区域</section>';const data=new TargetRegistry().observe();return {lateRegionIncluded:data.blocks.some(b=>b.attributes?.id==='late-region'),withinNodeLimit:data.scanned<=800,withinBlockLimit:data.blocks.length<=240,withinByteLimit:new TextEncoder().encode(JSON.stringify(data.blocks)).length<92000,explicitlyTruncated:data.truncated===true};}`);
 const bundle=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry,name:'retrievalProbe',formats:['iife']}}});const code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(item=>item.type==='chunk').code;
 browser=await chromium.launch({headless:true,channel:'chromium'});const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html>'}));await page.goto('https://retrieval.test/');
 for(let repeat=0;repeat<3;repeat++)for(const sample of cases){await page.setContent('<main>正文保留</main>'+sample.html);await page.addScriptTag({content:code});const result=await page.evaluate(query=>retrievalProbe.probe(query),sample.query);const hit=sample.gold.filter(id=>result.ids.includes(id)).length;report.rows.push({id:sample.id,layout:sample.layout,repeat,recall:hit/sample.gold.length,allGold:hit===sample.gold.length,...result});}
 report.identityChecks=await page.evaluate(()=>retrievalProbe.identityProbe());report.coverageChecks=await page.evaluate(()=>retrievalProbe.coverageProbe());
 const durations=report.rows.map(row=>row.durationMs).sort((a,b)=>a-b);report.summary={targetRecallAt20:report.rows.reduce((sum,row)=>sum+row.recall,0)/report.rows.length,allGoldTasks:report.rows.filter(row=>row.allGold).length,samples:report.rows.length,p50Ms:durations[Math.floor(durations.length*.5)],p95Ms:durations[Math.floor(durations.length*.95)]};report.status=report.rows.every(row=>row.allGold&&!row.privateValueCollected)&&Object.values(report.identityChecks).every(Boolean)&&Object.values(report.coverageChecks).every(Boolean)?'synthetic-checks-passed':'failed';
}catch(error){report.status='failed';report.reason=error.stack;}finally{await browser?.close();rmSync(dir,{recursive:true,force:true});}
report.limitations=['仅40个作者合成检索样例×3次；没有独立人工金标复核，不替代代表性语义任务验收。','只测候选召回和本地耗时，不测模型决策、完整业务目标、真实费用或框架收益。','没有对向量召回作收益结论；当前默认只启用词法路径。'];
writeFileSync(join(output,'retrieval-benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,summary:report.summary,reason:report.reason}));if(report.status==='failed')process.exitCode=1;
