import {spawnSync,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=join(root,'docs/v4.1/local');mkdirSync(dir,{recursive:true});
const rows=[];
for(const [id,cmd,args] of [['local-scenarios','npm',['run','test:v41']],['boundary',process.execPath,['scripts/check-generic-boundary.mjs']],['runner-syntax',process.execPath,['--check','scripts/evaluate-v41.mjs']],['existing-config-syntax','python3',['-c',"import ast; ast.parse(open('scripts/evaluate-v41-existing.py').read())"]]]){
 const start=Date.now();const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:5e6});writeFileSync(join(dir,id+'.txt'),(r.stdout??'')+(r.stderr??'')+(r.error?.message??''));rows.push({id,passed:r.status===0,code:r.status,durationMs:Date.now()-start});
}
const hash=p=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex');
const files=['tests/v4.1/local.test.ts','tests/v4.1/judge.mjs','tests/v4.1/scenarios.json','tests/v4.1/fixtures/article.html','tests/v4.1/fixtures/cards.html','tests/v4.1/fixtures/statistics.html','src/content/annotations/registry.ts','scripts/evaluate-v41.mjs','scripts/evaluate-v41-existing.py','scripts/compare-v41.mjs','scripts/check-generic-boundary.mjs'];
writeFileSync(join(dir,'results.json'),JSON.stringify({timestamp:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim().length>0,files:Object.fromEntries(files.map(p=>[p,hash(p)])),rows},null,2)+'\n');
writeFileSync(join(dir,'acceptance.md'),'# V4.1 本地自动验收\n\n命令：`npm --prefix luban run verify:v41`。不调用模型，不启动 Chrome。\n\n| 检查 | 通过 | 耗时 ms |\n|---|---|---:|\n'+rows.map(r=>`| ${r.id} | ${r.passed} | ${r.durationMs} |`).join('\n')+'\n\n日志与文件哈希见本目录。jsdom 模拟尺寸不代表真实渲染验收；本记录不含真实模型。\n');
console.log(JSON.stringify(rows));process.exitCode=rows.every(r=>r.passed)?0:1;
