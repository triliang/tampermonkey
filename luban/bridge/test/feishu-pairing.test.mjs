import test from 'node:test';import assert from 'node:assert/strict';
import {pairingCandidate} from '../src/feishu-pairing.mjs';
const base={sender:{sender_type:'user',sender_id:{open_id:'ou_test123'}},message:{chat_type:'p2p',message_type:'text',message_id:'om_test',content:JSON.stringify({text:'nonce'})}};
test('pairing only discovers a user who sends the exact challenge in a live private chat',()=>{
 assert.equal(pairingCandidate(base,'nonce',200,100).senderOpenId,'ou_test123');
 assert.equal(pairingCandidate(base,'other',200,100),null);
 assert.equal(pairingCandidate(base,'nonce',200,200),null);
 for(const change of [{chat_type:'group'},{message_type:'image'},{content:'bad JSON'},{content:JSON.stringify({text:'nonce '})}])assert.equal(pairingCandidate({...base,message:{...base.message,...change}},'nonce',200,100),null);
 assert.equal(pairingCandidate({...base,sender:{...base.sender,sender_type:'app'}},'nonce',200,100),null);
});
