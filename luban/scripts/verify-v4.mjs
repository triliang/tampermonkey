import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const outputIndex=process.argv.indexOf('--output');
const output=outputIndex>=0?process.argv[outputIndex+1]:null;
if(outputIndex>=0&&!output)throw Error('--output requires a directory');
const verification=output?join(root,output):join(root,'docs/v4/verification');
const evidence=join(verification,'evidence');mkdirSync(evidence,{recursive:true});
const checks=[
 ['generic-boundary','.',process.execPath,['scripts/check-generic-boundary.mjs']],
 ['harness-build','harness','npm',['run','build']],
 ['harness-typecheck','harness','npm',['run','check']],
 ['harness-tests','harness','npm',['test']],
 ['bridge-syntax','bridge','npm',['run','check']],
 ['bridge-tests','bridge','npm',['test']],
 ['extension-typecheck','.','npm',['run','typecheck']],
 ['extension-lint','.','npm',['run','lint']],
 ['extension-tests','.','npm',['test']],
 ['extension-build','.','npm',['run','build']],
];
if(process.argv.includes('--package'))checks.push(['bridge-package','bridge',process.execPath,['scripts/package-bridge.mjs']],['bridge-package-smoke','bridge',process.execPath,['scripts/smoke-bridge-package.mjs']]);
const results=[];let failed=false;
for(const [id,folder,bin,args] of checks){
 if((id==='harness-tests'||id==='bridge-tests'||id.startsWith('bridge-package'))&&results.find(r=>r.id==='harness-build')?.status!=='通过'){results.push({id,status:'未执行',duration:0,code:'前置构建失败'});failed=true;continue;}
 if(id==='bridge-package-smoke'&&results.find(r=>r.id==='bridge-package')?.status!=='通过'){results.push({id,status:'未执行',duration:0,code:'前置打包失败'});failed=true;continue;}
 const start=Date.now(),result=spawnSync(bin,args,{cwd:join(root,folder),encoding:'utf8',maxBuffer:10*1024*1024,timeout:180000});
 const output=(result.stdout??'')+(result.stderr??'')+(result.error?'\n'+result.error.message:'');writeFileSync(join(evidence,id+'.txt'),output);
 const row={id,status:result.status===0?'通过':'失败',duration:Date.now()-start,code:result.status??'无退出码'};results.push(row);if(result.status!==0)failed=true;console.log(JSON.stringify(row));
}
const timestamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date());
writeFileSync(join(verification,'v4-auto-verification.md'),`# V4 自动验收记录\n\n执行时间：${timestamp}（Asia/Shanghai）。脚本：\`node luban/scripts/verify-v4.mjs${process.argv.includes('--package')?' --package':''}${output?` --output ${output}`:''}\`。\n\n| 检查 | 结果 | 耗时 ms | 退出码 | 证据 |\n|---|---|---:|---|---|\n`+results.map(r=>`| ${r.id} | ${r.status} | ${r.duration} | ${r.code} | [输出](./evidence/${r.id+'.txt'}) |`).join('\n')+'\n\n这些结果只代表所列本地自动检查。Bridge 测试使用本机协议模型，不代表真实远程模型或已安装 Chrome 扩展验收。\n');
process.exitCode=failed?1:0;
