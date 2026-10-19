import {HARNESS_ERROR_MESSAGES} from '../../shared/harness-errors';
import type {V4Target} from '../../shared/v4-types';
import type {HarnessController} from './useHarnessChat';
import './harness-chat.css';
// Evidence descriptions may contain full asset URLs; keep them in the technical inventory.
function targetTitle(t:V4Target){
 const text=t.text.trim();
 if(text&&!/^https?:\/\//i.test(text))return text.slice(0,100);
 const description=t.description?.trim();
 if(description&&!/https?:\/\//i.test(description))return description.slice(0,100);
 return ({img:'图片区域',a:'链接区域',iframe:'嵌入区域',div:'页面区域'} as Record<string,string>)[t.tag?.toLowerCase()??'']||'页面区域';
}
export function HarnessCards({controller}:{controller:HarnessController}){
 const {conversation:c,busy:disabled,error,notice,act}=controller;
 const labels:Record<string,string>={running:'正在理解需求…',generating:'正在生成候选…',targets:'页面已读取，待分析处理范围',targetConfirmed:'目标已确认',plan:'方案等待生成授权',approved:'方案已授权',waitingApproval:'等待方案确认',cancelled:'已取消',failed:'处理失败',interrupted:'运行中断，请重新校验页面后继续'};
 return <section class="harness-cards" aria-label="需求与页面方案">
 {c?.stale?<p>页面授权已失效；需要分析页面时请重新授权。</p>:null}{labels[c?.status??'']?<p role="status">{labels[c?.status??'']}</p>:null}
 {c?.requirement?<section class="v4-card"><strong>需求说明 · r{c.requirement.revision}</strong><p>{c.requirement.goal}</p><p>保留约束：{c.requirement.constraints.join('；')||'尚未明确'}</p>{c.requirement.unresolved.length?<p>待明确：{c.requirement.unresolved.join('；')}</p>:null}</section>:null}
 {c?.page?<section class="v4-card" aria-label="目标分析"><strong>{c.selected.length?`${c.confirmed?'已确认范围':'待确认范围'} · ${c.selected.length} 处`:'页面已读取 · 等待目标分析'}</strong>
 <p>{c.selected.length?'请核对这些区域是否符合你的需求，确认后再制定处理方案。':'尚未确定要处理的区域。点击分析，让模型结合当前需求筛选；无需从结构清单逐个挑选。'}</p>
 <button disabled={disabled||c.stale} onClick={()=>void controller.send('请根据当前聊天中已明确的需求，读取当前页面证据并分析要处理的目标。只通过目标提议工具选择有证据且与需求相关的区域，逐项简述位置、依据及不确定性，合并重复或嵌套范围，不要罗列全部结构节点。若需求不明确请先澄清；若证据不足请说明缺口，不要凑数。不确认目标，不生成、运行或保存脚本。')}>{c.selected.length?'重新分析目标':'根据当前需求分析目标'}</button>
 <p class="v4-scope-note">仅分析本次已读取范围；未覆盖完整页面，嵌入页面及 Shadow DOM 内部可能未读取。</p>
 <p aria-label="当前选择">当前选择：{c.targets.filter(t=>c.selected.includes(t.id)).map(t=>`候选 ${t.label}`).join('、')||'未选择'}</p>
 <div aria-label="待确认目标">{c.targets.filter(t=>c.selected.includes(t.id)).map(t=><div class="v4-target" key={t.id}><label><input type="checkbox" checked disabled={disabled||c.stale} onChange={()=>void act('decide',{action:'select',ids:c.selected.filter(v=>v!==t.id)})}/><span>{targetTitle(t)}<small>候选 {t.label}{t.bounds?` · ${Math.round(t.bounds.width)} × ${Math.round(t.bounds.height)}`:''}</small></span></label><button disabled={disabled||c.stale} onClick={()=>void act('locate',{targetId:t.id})}>定位</button></div>)}</div>
 {c.selected.length?<div class="v4-actions"><button disabled={disabled||c.stale||c.confirmed} onClick={()=>void act('decide',{action:'confirmTargets'})}>确认所选目标</button><button disabled={disabled||c.stale||c.confirmed} onClick={()=>void act('decide',{action:'confirmHide',ids:c.selected})}>确认所选并采用隐藏方案</button></div>:null}
 <details class="v4-inventory"><summary>手动补选 / 采集详情（{c.targets.length} 个结构节点）</summary><p>这是辅助结构清单，包含正常页面内容，不代表模型推荐。目标分析依据与不确定性见聊天回复。</p><p>{c.coverage}</p>{c.nextOffset!=null?<button disabled={disabled||c.stale} onClick={()=>void act('scan',{offset:c.nextOffset})}>读取下一批（将重新确认目标）</button>:null}
 {c.targets.map(t=><div class="v4-target" key={t.id}><label><input type="checkbox" checked={c.selected.includes(t.id)} disabled={disabled||c.stale} onChange={e=>void act('decide',{action:'select',ids:e.currentTarget.checked?[...c.selected,t.id]:c.selected.filter(v=>v!==t.id)})}/>{t.label} · {t.description||t.text||'无文本区域'}</label><button disabled={disabled||c.stale} onClick={()=>void act('locate',{targetId:t.id})}>定位</button></div>)}
 </details><details><summary>标注与检查</summary><div class="v4-actions"><button disabled={disabled||c.stale} onClick={()=>void act('check')}>检查页面效果</button><button disabled={disabled||c.stale} onClick={()=>void act('show')}>显示标注</button><button disabled={disabled} onClick={()=>void act('clear')}>关闭标注</button><button disabled={disabled||c.stale} onClick={()=>void act('show',{color:'blue'})}>蓝色标注</button><button disabled={disabled||c.stale} onClick={()=>void act('show',{color:'green'})}>绿色标注</button></div></details></section>:null}
 {c?.confirmed&&!c.stale?<section class="v4-card"><strong>处理方案</strong><p>保留导航和正文；只处理已确认的 {c.selected.length} 处区域。</p><div class="v4-actions"><button disabled={disabled} onClick={()=>void act('decide',{action:'plan',operation:'hide',constraints:['保留导航和正文']})}>隐藏这些区域</button><button disabled={disabled} onClick={()=>void act('decide',{action:'plan',operation:'dim',constraints:['保留导航和正文']})}>弱化这些区域</button></div>{c.plan?<><p>方案 r{c.plan.revision}：{c.plan.action==='hide'?'隐藏':'弱化'}指定区域。生成不等于运行。</p><div class="v4-actions"><button disabled={disabled||!!c.decision} onClick={()=>void act('decide',{action:'approve'})}>确认方案并授权生成</button>{c.pending?<button disabled={disabled||!c.decision} onClick={()=>void act('resume')}>继续已批准的 Agent 请求</button>:<button disabled={disabled||!c.decision} onClick={()=>void act('generate')}>生成脚本草稿</button>}<button disabled={disabled} onClick={()=>void act('decide',{action:'reject'})}>拒绝</button></div></>:null}</section>:null}
 {c?.artifact?<section class="v4-card"><strong>脚本候选</strong><p>{c.artifact.explanation}</p><details><summary>查看候选代码</summary><pre>{c.artifact.code}</pre></details><button disabled={disabled||c.submitted||c.stale||c.status!=='candidate'||c.artifact.planHash!==c.plan?.hash} onClick={()=>void act('submit')}>{c.submitted?'已应用到当前草稿':'检查并应用到当前草稿'}</button><p>应用草稿不会运行；请在本聊天下方单独确认运行和保存。</p></section>:null}
 {c?.effectCheck?<section class="v4-card" aria-label="效果复核"><strong>{c.effectCheck.passed?'本次确认计划的自动检查通过':'本次计划尚未通过自动检查'}</strong><ul>{c.effectCheck.results.map(r=><li>候选 {r.label}：{({hidden:'已隐藏',dimmed:'已弱化',visible:'仍可见，需检查完整容器或规则',missing:'原节点已移除或替换，需重新识别',changed:'目标结构已变，需重新识别'} as Record<string,string>)[r.status]??r.status}</li>)}</ul><p>所选目标中仍可见：{c.effectCheck.residual.length} 处。{c.effectCheck.residual.map(r=>r.description).join('；')}</p><p>非目标区域检查：{c.effectCheck.preservation?.checked??0} 处；发现异常 {c.effectCheck.preservation?.violations.length??0} 处。</p>{c.effectCheck.preservation?.violations.length?<ul>{c.effectCheck.preservation.violations.map(v=><li>{v.description}：{({hidden:'被意外隐藏',missing:'节点被移除',dimmed:'被意外弱化'} as Record<string,string>)[v.status]??v.status}</li>)}</ul>:null}<p>本结果不代表完整业务目标已达成。</p><p>{c.effectCheck.coverage}</p><button disabled={disabled||c.stale} onClick={()=>void act('check')}>再次检查</button></section>:null}
 {c?.status==='failed'?<p role="alert">{HARNESS_ERROR_MESSAGES[c.lastError??'']??'模型处理失败，请检查连接或配置后重试。'}</p>:null}{notice?<p role="status">{notice}</p>:null}{error?<p class="v4-error" role="alert">{error}</p>:null}</section>;
}
export function HarnessActions({controller,disabled=false}:{controller:HarnessController;disabled?:boolean}){
 const {conversation:c,busy,act}=controller;
 return <div class="v4-actions harness-actions"><button disabled={disabled||busy} onClick={()=>void act('scan')}>授权并识别当前页</button><button disabled={disabled||busy||!c?.page||c.stale} onClick={()=>void act('manual')}>手动补选</button></div>;
}
