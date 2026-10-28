// Conservative commands from the human chat channel only; never parse model/page prose.
export function chatDecision(text){
 const value=String(text??'').trim();
 if(/^(?:请)?(?:确认|确认范围|确认这个范围|就按这个范围|同意)[。！!]?$/u.test(value))return 'confirm';
 if(/^(?:请)?批准生成[。！!]?$/u.test(value))return 'generate';
 if(/^(?:请)?(?:(?:按|按照)(?:这个|当前|刚才确认的)方案)?生成(?:相应的|对应的|这个|当前)?(?:脚本|脚本草稿)(?:，?不(?:运行|执行|保存))?[。！!]?$/u.test(value))return 'generate';
 return null;
}
export function wantsDraft(text){
 const value=String(text??'').trim();
 return chatDecision(value)==='generate'||(!/(?:不要|无需|不用|不必|不生成|只解释|只讨论)/u.test(value)&&/^(?:请)?(?:隐藏|弱化)[^。！？?!\n]{1,120}(?:并|然后|同时)(?:帮我)?生成(?:对应的|相应的)?脚本(?:草稿)?(?:[，,]?不运行)?[。！!]?$/u.test(value));
}

// Only unambiguous bare commands are handled without a model. Never infer a page target.
// Context with an existing scope must still go through live evidence validation.
export function bareActionQuestion(text, hasTarget = false) {
 if (hasTarget) return null;
 const value = String(text ?? '').trim().replace(/[。！!？?]+$/u, '').replace(/^(?:请|帮我)/u, '').trim();
 const questions = {
  '隐藏': '你想隐藏页面中的哪一块？',
  '藏起来': '你想藏起页面中的哪一块？',
  '删除': '你想删除页面中的哪一块？',
  '去掉': '你想去掉页面中的哪一块？',
  '替换': '你想替换页面中的哪一块，替换成什么内容？',
  '添加': '你想在页面的什么位置添加，添加什么内容？',
  '修改': '你想修改页面中的哪一块、哪一项，改成什么？',
  '统计': '你想统计页面中的哪一类元素？'
 };
 return Object.hasOwn(questions, value) ? questions[value] : null;
}

// Merge a target-only follow-up only for an explicitly retained bare human action.
export function completeBareAction(text, pendingAction) {
 if (!bareActionQuestion(pendingAction)) return null;
 const value=String(text??'').trim();
 if (!value || /^(?:你好|您好|谢谢|确认|同意|那个|这个|这里|那里|不做了|取消|算了)[。！!？?]*$/u.test(value)) return null;
 if (/[？?]|^(?:为什么|如何|怎么|是否|你支持|不要|不用|无需|只解释)|(?:隐藏|藏起来|删除|去掉|替换|添加|修改|统计|弱化|改成|改为)/u.test(value)) return null;
 return String(pendingAction).trim()+' '+value;
}

export function preservesPage(text) {
 return /^(?:请)?(?:不要|不用|无需)(?:隐藏|删除|弱化)[^。！？?!\n]{1,120}[，,](?:请)?(?:保持|保留)原样[。！!]*$/u.test(String(text??'').trim()) && !/(?:替换|添加|改成|改为|然后|但是)/u.test(String(text));
}

export function greetingReply(text) {
 return /^(?:你好|您好|嗨|hello|hi)[，,。！!\s]*$/iu.test(String(text??'').trim()) ? '你好，有什么我可以帮你？' : null;
}

// Capability/quotation questions are conversation, not requests to act on a page.
export function conversationQuestion(text) {
 const value=String(text??'').trim();
 if (/^你(?:是否)?支持[^。！？?!\n]{1,120}(?:吗|么)[。！？?!]*$/u.test(value)&&!/(?:帮我|请帮|现在|直接|并且|然后)/u.test(value)) return true;
 const outside=value.replace(/「[^」]*」|“[^”]*”|『[^』]*』|"[^"]*"|'[^']*'/gu,'');
 return outside!==value&&/(?:是什么意思|什么含义|怎么理解|解释(?:一下)?这句话)/u.test(outside)&&!/(?:隐藏|弱化|删除|移除|添加|替换|统计|修改)/u.test(outside);
}
export function readOnlyInventory(text) {
 const value=String(text??'');
 return /(?:不要生成(?:脚本|代码)|只告诉我|只读)/u.test(value)&&/(?:当前|本页|这个页|页面)/u.test(value)&&/(?:多少|数量|总数)/u.test(value);
}

// A standalone deictic command has no usable target without a retained scope.
export function unresolvedReference(text, hasTarget=false) {
 if (hasTarget) return false;
 return /^(?:请|帮我)?(?:隐藏|弱化|删除|去掉|移除)(?:这个|那个|这里|那里)(?:的)?(?:东西|元素|区域)?[。！!？?]*$/u.test(String(text??'').trim());
}

// Only paired alternatives that directly name two different operations are resolved here.
// Quoted text, negative instructions and sequential requests are left to normal handling.
export function actionChoice(text) {
 const original=String(text??'');
 if (conversationQuestion(original)) return null;
 const visible=original.replace(/「[^」]*」|“[^”]*”|『[^』]*』|"[^"]*"|'[^']*'/gu,m=>' '.repeat(m.length));
 const pattern=/(隐藏|弱化|删除|删掉|去掉|移除)\s*(?:或者|还是|或)\s*(?:要|是)?\s*(隐藏|弱化|删除|删掉|去掉|移除)/u;
 const match=pattern.exec(visible); if(!match)return null;
 const before=visible.slice(0,match.index);
 if (/(?:不要|不用|无需|不必|不能|不应|不|禁止)\s*$/u.test(before))return null;
 const canonical=word=>['删除','删掉','去掉','移除'].includes(word)?'删除':word;
 const first=canonical(match[1]),second=canonical(match[2]);
 if(first===second)return null;
 return {first,second,start:match.index,end:match.index+match[0].length};
}
export function resolveActionChoice(text, pendingChoice) {
 const choice=actionChoice(pendingChoice); if(!choice)return null;
 // Only a short, affirmative choice can reuse the previous target. Anything
 // naming a new target, adding a condition, or asking a question is a new turn.
 const match=/^(?:(?:不[，,]\s*)?(?:还是|改选|改用)|请|就|选择|改为|改成|只要|只)?\s*(隐藏|弱化|删除|删掉|去掉|移除)(?:就好|即可|就行|就可以|吧|好了)?[。！!]*$/u.exec(String(text??'').trim());
 if(!match)return null;
 const selection=match[1];
 const canonical=['删除','删掉','去掉','移除'].includes(selection)?'删除':selection;
 if(canonical!==choice.first&&canonical!==choice.second)return null;
 const original=String(pendingChoice);
 return original.slice(0,choice.start)+canonical+original.slice(choice.end);
}

// Linguistic routing hint only; this is not a list of supported program operations.
export function requestsPageChange(text) {
 const value=String(text??'').trim();
 if(/^(?:为什么|如何|怎么|是否|能否|你支持|请解释|解释)/u.test(value)||/[？?]|(?:是什么意思|什么含义|怎么理解|是否合适)/u.test(value)||conversationQuestion(value)||preservesPage(value))return false;
 if(!/^(?:请帮我|帮我|请)?(?:先)?(?:把|将|在|隐藏|弱化|删除|移除|替换|添加|插入|修改|调整|移动|复制|重排|统计)/u.test(value))return false;
 return /(?:删除|移除|替换|添加|插入|修改|改成|改为|调整|移动|复制|重排|统计)/u.test(value);
}

// Records human task willingness only. Completeness, live scope and approval are
// separate host gates; this function never authorizes generation or execution.
export function retainsGenerationRequest(text) {
 const value=String(text??'').trim();
 const outside=value.replace(/「[^」]*」|“[^”]*”|『[^』]*』|"[^"]*"|'[^']*'/gu,'[文本参数]');
 if(!value||conversationQuestion(value)||readOnlyInventory(value)||preservesPage(value)||greetingReply(value)||actionChoice(value)||/[？?]/u.test(outside)||/^(?:请帮我|帮我|请)?(?:不要|无需|不用|不必|只解释|只讨论|为什么|如何|怎么|是否|能否|解释|讨论|介绍|分析|查看|识别|检查|取消|不做了)/u.test(outside)||/(?:不要|无需|不用|不必|不)生成(?:脚本|代码)/u.test(outside))return false;
 // Caller must be in the human modification channel. Unknown transformations
 // are retained too; completeness and confirmed scope are separate host gates.
 return !/(?:是什么意思|什么含义|只告诉我|只读|只解释|只讨论)/u.test(outside);
}
