import {parse} from 'acorn';
import {analyze} from 'eslint-scope';
import globals from 'globals';
import {GM_P0_GRANTS} from '../../shared/constants';
import type {QualityReport,Diagnostic} from '../../shared/v21-types';
import {scanCode} from '../safety-scanner';
const VERSION='v21.1';
const allowed=new Set([...Object.keys(globals.browser),...Object.keys(globals.es2021)]);
type Node={type?:string;start?:number;end?:number;name?:string;operator?:string;argument?:Node;expression?:Node;[key:string]:unknown};
function walk(node:unknown,fn:(n:Node,parent:Node|null)=>void,parent:Node|null=null):void{
 if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const item of node)walk(item,fn,parent);return;}
 const n=node as Node;if(typeof n.type!=='string')return;fn(n,parent);
 for(const [key,value]of Object.entries(n))if(!['loc','range'].includes(key))walk(value,fn,n);
}
export function inspectCode(code:string,grants:readonly string[]):QualityReport {
 const diagnostics:Diagnostic[]=[];const finish=(repairable=false):QualityReport=>({passed:!diagnostics.some(d=>d.severity==='error'),checkerVersion:VERSION,diagnostics:diagnostics.slice(0,20),repairable});
 if(new TextEncoder().encode(code).length>256*1024){diagnostics.push({code:'CODE_TOO_LARGE',message:'代码超过单版容量上限。',severity:'error'});return finish();}
 let ast:ReturnType<typeof parse>;
 try{ast=parse(`async function __luban_trial__(){\n${code}\n}`,{ecmaVersion:'latest',ranges:true,locations:true});}
 catch(e){const loc=(e as {loc?:{line:number;column:number}}).loc;diagnostics.push({code:'SYNTAX_ERROR',message:'代码语法无效，请查看错误位置。',line:loc?Math.max(1,loc.line-1):undefined,column:loc?.column,severity:'error'});return finish(true);}
 let references:ReturnType<typeof analyze>['globalScope']['through'];
 try{references=analyze(ast,{ecmaVersion:2022,sourceType:'script',optimistic:false}).globalScope.through;}
 catch{diagnostics.push({code:'CHECK_UNSUPPORTED',message:'检查器暂不支持这段代码的语法，请简化后重试。',severity:'error'});return finish();}
 const typeofOnly=new Set<number>();walk(ast,(n)=>{if(n.type==='UnaryExpression'&&n.operator==='typeof'&&n.argument?.type==='Identifier')typeofOnly.add(n.argument.start!);});
 walk(ast,n=>{if(n.type==='MemberExpression'&&n.computed)diagnostics.push({code:'DYNAMIC_REFERENCE',message:'动态属性引用无法静态确认，请试运行并检查实际效果。',severity:'warning'});});
 for(const ref of references){const id=ref.identifier,name=id.name;
  if(name.startsWith('GM_')||name==='unsafeWindow'){
   if(!(GM_P0_GRANTS as readonly string[]).includes(name))diagnostics.push({code:'INVALID_GRANT',message:`不支持 ${name}。`,severity:'error'});
   else if(!grants.includes(name))diagnostics.push({code:'MISSING_GRANT',message:`请在草稿 GM 权限中声明 ${name}。`,line:Math.max(1,(id.loc?.start.line??2)-1),severity:'error'});
  }else if(!allowed.has(name)&&!typeofOnly.has(id.start))diagnostics.push({code:'UNDEFINED_REFERENCE',message:`未定义变量 ${name}。`,line:Math.max(1,(id.loc?.start.line??2)-1),column:id.loc?.start.column,severity:'error'});
 }
 for(const grant of grants)if(!(GM_P0_GRANTS as readonly string[]).includes(grant))diagnostics.push({code:'INVALID_GRANT',message:`不支持的权限 ${grant}。`,severity:'error'});
 const safety=scanCode(code,grants);for(const text of safety.blocked)diagnostics.push({code:'UNSAFE_CODE',message:text,severity:'error'});
 const canRepair=diagnostics.length>0&&diagnostics.every(d=>d.code==='UNDEFINED_REFERENCE');
 return finish(canRepair);
}
// 只自动接受可证明的裸未定义表达式移除；一般性重写需用户显式确认候选。
export function safeRepair(original:string,candidate:string,grants:readonly string[],nextGrants:readonly string[]):boolean{
 if(JSON.stringify([...grants].sort())!==JSON.stringify([...nextGrants].sort()))return false;
 try{
 const normalized=(code:string,remove:boolean)=>{
  const ast=parse(`async function __luban_trial__(){\n${code}\n}`,{ecmaVersion:'latest',ranges:true});
  const unresolved=new Set(analyze(ast,{ecmaVersion:2022,sourceType:'script'}).globalScope.through.filter(r=>!allowed.has(r.identifier.name)&&!grants.includes(r.identifier.name)).map(r=>r.identifier.start));
  const normalize=(v:unknown):unknown=>{if(Array.isArray(v))return v.filter(n=>!(remove&&(n as Node)?.type==='ExpressionStatement'&&(n as Node).expression?.type==='Identifier'&&unresolved.has((n as Node).expression!.start!))).map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['start','end','range','loc','raw'].includes(k)).map(([k,x])=>[k,normalize(x)]));return v;};return JSON.stringify(normalize(ast));
 };return normalized(original,true)===normalized(candidate,false);
 }catch{return false;}
}
