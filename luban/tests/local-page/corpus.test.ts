import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {it,expect,afterAll} from 'vitest';
import {classifyHarnessMessage} from '../../src/service-worker/services/harness-gateway';
import {wantsDraft,bareActionQuestion,actionChoice,unresolvedReference,completeBareAction,resolveActionChoice} from '../../contracts/conversation-intent.mjs';
const rows=readFileSync('docs/v4.3/47-csdn-prompt-cases-2026-10-28.md','utf8').split('\n').filter(l=>/^\| [CITNARD]\d+ \|/.test(l)).map(l=>l.split('|').slice(1,-1).map(x=>x.trim()));
const observations:any[]=[];
for(const row of rows.filter(r=>/^[CITN]/.test(r[0]))){const id=row[0],turn=id[0]==='T'?Number(row[1]):1,input=row[id[0]==='N'?1:2].replace(/^`|`$/g,'');
it(`${id}.${turn} original-input local probe`,()=>{const route=classifyHarnessMessage(input,false,false),boundRoute=classifyHarnessMessage(input,true,true);const result={id,turn,input,route,boundRoute,explicitDraftIntent:wantsDraft(input),question:bareActionQuestion(input)||null,choice:actionChoice(input),unresolved:unresolvedReference(input),modelCalls:0,toolCalls:0,level:'production helper; not model response / artifact'};observations.push(result);expect(route.effect).toBe(false);if(id[0]==='I'||id[0]==='N')expect(wantsDraft(input)).toBe(false);if(['N01','N04','N07','N08'].includes(id))expect(route.path).toBe('message');if(id==='N05')expect(route).toMatchObject({path:'page',intent:'identify'});});}
it('replays supported multi-turn merge helpers with original input',()=>{for(const [pending,reply,expected] of [['隐藏','所有广告','隐藏 所有广告'],['隐藏','那个',null],['删除','你好',null],['隐藏','确认',null]])expect(completeBareAction(reply,pending)).toBe(expected);expect(resolveActionChoice('隐藏','把所有广告隐藏或者删掉')).toBe('把所有广告隐藏');});
const evidence='docs/v4.3/evidence/2026-10-28/local-round2';mkdirSync(evidence,{recursive:true});
afterAll(()=>writeFileSync(evidence+'/inputs.json',JSON.stringify({source:'47',logicalCases:new Set(rows.map(r=>r[0])).size,fixedInputTurns:observations.length,observations},null,2)));
