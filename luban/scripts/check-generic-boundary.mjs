// Runtime boundary regression guard. Website names are allowed in tests and historical evidence only.
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const sources=['src/content/annotations','src/service-worker/services/harness-gateway.ts','src/sidepanel/v4/HarnessChat.tsx','harness/src','bridge/src/harness-domain.mjs'];
const forbidden=/csdn|kunpeng|kp_box|banner-box|csdn-common|广告|advert|sponsor/i;
const violations=[];
function check(path){if(/\.test\./.test(path))return;const content=readFileSync(join(root,path),'utf8');for(const [i,line] of content.split('\n').entries())if(forbidden.test(line))violations.push(`${path}:${i+1}`);}
for(const path of sources){if(/\.(ts|tsx|mjs)$/.test(path))check(path);else for(const name of readdirSync(join(root,path)))if(/\.(ts|tsx|mjs)$/.test(name))check(join(path,name));}
if(violations.length)throw Error('Runtime contains website/task specialization: '+violations.join(', '));
console.log('Generic runtime boundary passed: no known website adapters or advertising-specific rules in the scoped runtime. This lexical check supplements code review; it cannot prove arbitrary future code is generic.');
