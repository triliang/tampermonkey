/** Text that resembles a tool call is never interpreted as executable tool arguments. */
export function normalizeAssistantOutput(value){
 const text=typeof value==='string'?value:'';
 const prose=text.replace(/```[\s\S]*?```/g,'').replace(/`[^`\n]*`/g,'');
 const invalidToolMarkup=/<\/?tool_call\b|<function\s*=|<parameter\s*=/i.test(prose);
 return {invalidToolMarkup,text:invalidToolMarkup?'**本轮状态：报告未完成**\n\n模型回复格式异常，未形成有效的分析报告。已读取的页面线索仍保留，但不能把它们直接当作已确认的目标清单。\n\n下一步可以重新提交分析结果；格式问题无需重新解释需求。本轮未生成或运行脚本。':text};
}
