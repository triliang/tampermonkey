// Real Chrome userScripts API; isolated profile and synthetic localhost page.
import {mkdtempSync,rmSync,writeFileSync,cpSync,readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {compilePlan,serializeUserscript} from '../contracts/script-plan.mjs';
import {build} from 'vite';
const {chromium}=await import(process.env.LUBAN_PLAYWRIGHT_MODULE);
const root=fileURLToPath(new URL('..',import.meta.url)),profile=mkdtempSync('/private/tmp/luban-execution-');
const extension=join(profile,'fixture-extension');cpSync(join(root,'dist'),extension,{recursive:true});const manifest=JSON.parse(readFileSync(join(extension,'manifest.json')));manifest.host_permissions.push('http://127.0.0.1/*');writeFileSync(join(extension,'manifest.json'),JSON.stringify(manifest));
const report={testOnlyLocalhostPermission:true,realBrowser:true,productionRunner:true,nativeMessaging:false,tampermonkey:false,checks:[]};
const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Luban acceptance fixture</title><aside id="chosen">区域</aside><main id="keep">正文</main>');});
let context;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;report.browserVersion=context.browser()?.version();
 const details=await context.newPage();await details.goto('chrome://extensions/?id='+id);await details.locator('#allow-user-scripts').click();
 const page=await context.newPage();await page.goto(url);
 const target=await worker.evaluate(async url=>{const t=(await chrome.tabs.query({})).find(t=>t.url===url);return{...(await chrome.scripting.executeScript({target:{tabId:t.id},func:()=>true}))[0],tabId:t.id};},url);
 const bundled=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:join(root,'src/service-worker/services/trial-runner.ts'),name:'v43Acceptance',formats:['iife']}}});await worker.evaluate((Array.isArray(bundled)?bundled[0]:bundled).output.find(x=>x.type==='chunk').code);
 const compiled=compilePlan({planHash:'real-api',action:'hide',targetIds:['chosen']},{planHash:'real-api',action:'hide',targets:[{id:'chosen',selector:'#chosen'}]});
 const code=serializeUserscript(compiled.code,{name:'Acceptance',namespace:'luban-acceptance',version:'1.0.0',description:'Synthetic fixture',matches:['*://127.0.0.1:'+server.address().port+'/*'],runAt:'document-idle',grants:[]});
 const version={code,grants:[],runAt:'document_idle'};
 const run=()=>worker.evaluate(async({target,version})=>{v43Acceptance.validateTrial(version);return v43Acceptance.executeTrial(target,version,'acceptance','real-api',{});},{target,version});
 const receipt=await run();const effects=await page.evaluate(()=>({target:getComputedStyle(document.querySelector('#chosen')).display,keep:getComputedStyle(document.querySelector('#keep')).display,styles:document.querySelectorAll('#luban-plan-real-api').length}));report.checks.push({name:'production-runner-real-api-receipt-preservation',passed:receipt.ok===true&&effects.target==='none'&&effects.keep!=='none'&&effects.styles===1,receipt,effects});
 const repeated=await run();report.checks.push({name:'same-document-repeat-idempotency',passed:repeated.repeated===true,receipt:repeated});
 await page.reload();report.checks.push({name:'navigation-does-not-implicitly-rerun',passed:await page.locator('#chosen').isVisible()});let staleRejected=false;try{await run();}catch{staleRejected=true;}report.checks.push({name:'old-document-id-rejected-after-navigation',passed:staleRejected});
 const fresh=await worker.evaluate(async tabId=>({...((await chrome.scripting.executeScript({target:{tabId},func:()=>true}))[0]),tabId}),target.tabId);
 const after=await worker.evaluate(async({target,version})=>v43Acceptance.executeTrial(target,version,'acceptance','real-api',{}),{target:fresh,version});report.checks.push({name:'new-document-explicit-run',passed:after.ok===true,receipt:after});
 let mismatch=false;try{await worker.evaluate(version=>v43Acceptance.validateTrial({...version,grants:['GM_addStyle']}),version);}catch{mismatch=true;}report.checks.push({name:'metadata-grant-mismatch-rejected',passed:mismatch});
 await details.reload();await details.locator('#allow-user-scripts').click();let disabled=false,disableOutcome;try{disableOutcome=await worker.evaluate(async({target,version})=>v43Acceptance.executeTrial(target,version,'disabled','disabled',{}),{target:fresh,version});}catch(e){disabled=/userScripts.execute.*not available|USER_SCRIPTS_REQUIRED|允许用户脚本/.test(e.message);disableOutcome=e.message;}report.checks.push({name:'disabled-user-scripts-no-fallback',passed:disabled,outcome:disableOutcome});
 report.status=report.checks.every(c=>c.passed)?'passed':'failed';
}catch(e){report.status='failed';report.reason=e.stack;}finally{await context?.close();await new Promise(r=>server.close(r));rmSync(profile,{recursive:true,force:true});}
writeFileSync(join(process.env.LUBAN_ACCEPTANCE_OUTPUT??join(root,'docs/v4.3/evidence'),'execution-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
