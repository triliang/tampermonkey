import {useRef,useState} from 'preact/hooks';
export function SendToFeishu({summary}:{summary:string}){
 const trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[text,setText]=useState(summary),[preview,setPreview]=useState<{id:string;body:string}>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function action(method:string){setBusy(true);setMessage('');try{const reply=await chrome.runtime.sendMessage({type:'V3_CHANNEL_SEND',method,params:method==='preview'?{text}:{deliveryId:preview?.id}});if(!reply?.ok)throw Error(reply?.error??'飞书操作失败');if(method==='preview')setPreview(reply.data.delivery);else{setPreview(undefined);setOpen(false);setTimeout(()=>trigger.current?.focus(),0);setMessage(method==='confirm'?'已提交发送，请在连接设置查看平台回执；不会重新运行网页。':'已取消，未发送。');}}catch(e){setMessage(e instanceof Error?e.message:'发送失败');}finally{setBusy(false);}}
 return <section><button ref={trigger} disabled={busy} onClick={()=>{setText(summary);setOpen(true);setPreview(undefined);}}>发送结果到飞书</button>
 {open&&<article class="chat-disclosure" onKeyDown={e=>{if(e.key==='Escape'&&!e.isComposing&&!busy){e.preventDefault();e.stopPropagation();if(preview)void action('cancelPreview');else{setOpen(false);setTimeout(()=>trigger.current?.focus(),0);}}}}><strong>发送给已绑定的本人飞书单聊</strong><p>仅发送下方正文，可自行编辑；不附带脚本、整页或对话历史。</p><textarea aria-label="发送结果正文" maxLength={3000} value={text} disabled={busy||!!preview} onInput={e=>setText(e.currentTarget.value)}/>
 {preview?<><pre>{preview.body}</pre><button disabled={busy} onClick={()=>void action('cancelPreview')}>取消发送</button><button disabled={busy} onClick={()=>void action('confirm')}>确认发送</button></>:<><button disabled={busy} onClick={()=>setOpen(false)}>返回</button><button disabled={busy||!text.trim()} onClick={()=>void action('preview')}>预览发送内容</button></>}</article>}
 {message&&<p role="status">{message}</p>}</section>;
}
