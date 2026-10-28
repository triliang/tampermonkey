/** Hard stops preserve verified evidence in the store, but do not present unclassified page text as targets. */
export function partialAnalysis(conversation,reason){
 const count=new Set((conversation.observationFacts??[]).map(block=>block.id||block.blockHash||block.accessibleName||block.text).filter(Boolean)).size;
 const opening=reason==='HARNESS_MODEL_TIMEOUT'?'本次分析的模型请求超时。':reason==='HARNESS_MODEL_NO_PROGRESS'?'重复取证没有带来新内容，本轮已停止。':reason==='HARNESS_MODEL_DEADLINE'?'本轮分析已达到总时限。':'本轮分析已达到调用上限。';
 return opening+(count?`\n\n已核实 ${count} 处页面结构，但尚未形成可确认的目标判断。已读证据保留，不能把这些结构直接当作本次需求的目标清单。`:'\n\n本轮尚未获得足够的已核实证据，不能列出确定目标。')+(conversation.lastDomSearch?.truncated?'\n最近一次页面检索存在采样截断，尚不能确认整页覆盖。':'')+'\n\n当前页面覆盖和目标判断仍不完整。本轮没有生成或运行脚本。';
}
