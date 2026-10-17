import test from 'node:test';import assert from 'node:assert/strict';import {inspectProbeMessage} from '../src/feishu-probe-match.mjs';
const event={sender:{sender_type:'user',sender_id:{open_id:'ou_self'}},message:{chat_type:'p2p',message_type:'text',message_id:'om_test',content:JSON.stringify({text:' LUBAN_S0_PING\n'})}};
test('reply probe tolerates whitespace but rejects wrong sender, group, bot and non-command',()=>{
 assert.equal(inspectProbeMessage(event,'ou_self').matches,true);
 assert.equal(inspectProbeMessage(event,'ou_other').matches,false);
 for(const delta of [{chat_type:'group'},{message_type:'image'},{content:'invalid JSON'},{content:JSON.stringify({text:'LUBAN_S0_PING_EVIL'})}])assert.equal(inspectProbeMessage({...event,message:{...event.message,...delta}},'ou_self').matches,false);
 assert.equal(inspectProbeMessage({...event,sender:{...event.sender,sender_type:'app'}},'ou_self').matches,false);
 assert.ok(!JSON.stringify(inspectProbeMessage(event,'ou_self').diagnostics).includes('ou_self'));
});
