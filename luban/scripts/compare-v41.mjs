import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const [baselineFile,finalFile]=process.argv.slice(2);
if(!baselineFile||!finalFile)throw Error('Usage: compare-v41.mjs baseline.json final.json');
const baseline=JSON.parse(readFileSync(resolve(baselineFile),'utf8'));
const final=JSON.parse(readFileSync(resolve(finalFile),'utf8'));
if(baseline.scenarioHash!==final.scenarioHash)throw Error('Scenario gold changed: before/after comparison denied');
const providers=['third-party','local-codex'];
const cases=[...new Set(final.rows.map(r=>r.case))];
for(const run of [baseline,final]){
 for(const c of cases){const hashes=new Set(run.rows.filter(r=>r.case===c).map(r=>r.inputHash));if(hashes.size!==1)throw Error('Backend inputs differ');}
 for(const p of providers)for(const c of cases){const rows=run.rows.filter(r=>r.provider===p&&r.case===c);if(rows.length!==3||new Set(rows.map(r=>r.repeat)).size!==3||rows.some(r=>r.status==='not-run'))throw Error('Incomplete repeated samples');}
 for(const r of final.rows){const old=baseline.rows.find(b=>b.provider===r.provider&&b.case===r.case&&b.repeat===r.repeat);if(!old||old.fixtureHash!==r.fixtureHash)throw Error('Fixture changed');}
}
const output=resolve(root,'docs/v4.1/10-model-comparison.md');
const link=path=>relative(dirname(output),resolve(path)).replaceAll('\\','/');
const table=cases.flatMap(c=>providers.map(p=>{const before=baseline.rows.filter(r=>r.provider===p&&r.case===c),after=final.rows.filter(r=>r.provider===p&&r.case===c);return `| ${c} | ${p} | ${before.filter(r=>r.status==='passed').length}/3 | ${after.filter(r=>r.status==='passed').length}/3 |`;})).join('\n');
const failures=final.rows.filter(r=>r.status!=='passed').map(r=>`- ${r.provider} / ${r.case} / ${r.repeat}：${(r.errors??[r.reason]).join(', ')}。`).join('\n')||'本批次无失败；小题集全通过不代表泛化能力已证明。';
const metrics=providers.map(p=>{const r=final.summaries[p];return `| ${p} | ${r.passed}/12 | ${r.errors} | ${r.notRun} | ${r.latencyMs?.median??'—'} | ${r.latencyMs?.min??'—'}–${r.latencyMs?.max??'—'} |`;}).join('\n');
const numeric=providers.map(p=>{const r=final.rows.filter(r=>r.provider===p&&r.case==='statistics');const gold={count:4,amountCount:3,totalCents:3250,meanCents:1083.33};const correct=r.filter(r=>Object.entries(gold).every(([k,v])=>typeof r.answer?.statistics?.[k]==='number'&&Math.abs(r.answer.statistics[k]-v)<=.005)).length;return `- ${p}：统计数值正确 ${correct}/3；这与整题协议通过率分别计算。`;}).join('\n');
writeFileSync(output,`# V4.1 模型差异与优化复验\n\n日期：${final.timestamp}。协议：${final.protocolVersion}。\n\n[原协议基线](${link(baselineFile)}) · [优化后原始证据](${link(finalFile)})。脚本核对两批题集金标和夹具一致、每题双后端各三次、同批两后端输入哈希一致。基线与最终提示词不同，不是同一输入的前后因果试验。\n\n## 逐题严格通过率\n\n| 题目 | 后端 | 基线 | 优化后 |\n|---|---|---:|---:|\n${table}\n\n## 所比较复验批次\n\n| 后端 | 严格通过 | 服务错误 | 未执行 | 中位延时ms | 范围ms |\n|---|---:|---:|---:|---:|---|\n${metrics}\n\n${numeric}\n\n## 未通过项\n\n${failures}\n\n## 可比性与解释\n\n第三方使用既有MiMo mimo-v2.6-flash、JSON模式、temperature=0；最终显式沿用thinking=true。${final.protocolVersion==='v41-3'?'同一份完整JSON Schema已明文提供给两端。':'该中间协议未明确targets数组元素类型；这一提示词缺陷会混淆模型与协议因素，不能用其得分下模型优劣结论。'}Codex使用账号默认型号/采样、严格JSON Schema，精确模型型号未确认。两后端基础指令与HTML相同，Codex额外开发者约束与Schema不同；不能声称完全受控的纯模型排名。基线第三方未显式设置thinking，该差异也影响前后归因。\n\n严格通过率包含目标集合、字段与类型、完整性和修改声明，并非只衡量算术。输出未执行，不能把目标引用偏差等同于实际页面误伤。每题三次仅为小样本冒烟；未验证生产Harness多轮工具、真实视觉、动态分页或长期稳定性。\n\n本轮优化没有修改HTML和金标；没有删除失败样本、选择最佳重复或把错误计为通过。剩余偏差应保留为后续通用反例。\n`);
console.log(output);
