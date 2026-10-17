// Matching never grants browser permissions. Candidate confirmation is a separate step.
export function pairingCandidate(event, challenge, expiresAt, now = Date.now()) {
  if (now >= expiresAt) return null;
  const message = event?.message;
  const sender = event?.sender;
  if (message?.chat_type !== 'p2p' || message?.message_type !== 'text' || sender?.sender_type !== 'user') return null;
  const openId = sender.sender_id?.open_id;
  if (typeof openId !== 'string' || !/^ou_[a-zA-Z0-9]+$/.test(openId)) return null;
  let content;
  try { content = JSON.parse(message.content); } catch { return null; }
  if (content?.text !== challenge || typeof message.message_id !== 'string') return null;
  return {senderOpenId: openId, messageId: message.message_id, receivedAt: now};
}
