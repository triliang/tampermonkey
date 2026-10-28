const plain=value=>String(value??'').replace(/\bobs-[\w-]+\b/g,'已读线索').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_[\]#|]/g,'\\$&');
export function renderObservationReport(report){
 const title={answered:'已形成只读结论',incomplete:'部分完成，仍需核实',needs_clarification:'需要说明识别范围'}[report.outcome]??'报告未完成';
 const section=(name,items)=>items?.length?'\n\n### '+name+'\n'+items.map(item=>'- '+plain(item)).join('\n'):'';
 return '**本轮状态：'+title+'**'+section('本轮判断',report.reasons)+section('尚待核实',[...(report.ambiguities??[]),...(report.missingEvidence??[])])+'\n\n'+(report.outcome==='answered'?'以上为本次证据范围内的判断。':report.outcome==='needs_clarification'?'下一步：请说明识别范围或解决上述歧义。':'下一步：继续核实上述缺口；不可访问的范围仍需明确保留。')+'本轮未生成或运行脚本。';
}
export function renderReportFailure(kind='invalid'){
 return '**本轮状态：报告未完成**\n\n'+(kind==='invalid'?'报告校验未通过，修正机会或剩余预算已用完。':'本轮未获得有效的结构化报告。')+'已读取证据保留，这属于报告提交问题，不等于需要你重新解释识别范围。\n\n下一步：可以重新提交报告；不会自动生成或运行脚本。';
}
export function renderTargetProposal(targets,reason){return '**处理范围待确认**\n\n'+targets.map(t=>'- 候选 '+t.label+'：'+plain(t.description||t.text||'页面区域')).join('\n')+'\n\n依据：'+plain(reason)+'\n\n请核对上述范围后确认；本轮未生成、运行或保存脚本。';}
