export function inspectProbeMessage(event, boundOpenId) {
  const message=event?.message, sender=event?.sender;
  let text;
  try{text=JSON.parse(message?.content).text;}catch{}
  const diagnostics={privateChat:message?.chat_type==='p2p',boundSender:sender?.sender_id?.open_id===boundOpenId,userSender:sender?.sender_type==='user',textMessage:message?.message_type==='text',commandMatched:typeof text==='string'&&text.trim()==='LUBAN_S0_PING'};
  return {diagnostics,matches:Object.values(diagnostics).every(Boolean)&&typeof message?.message_id==='string'};
}
