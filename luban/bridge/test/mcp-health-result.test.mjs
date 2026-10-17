import test from 'node:test';import assert from 'node:assert/strict';import {hasHealth} from '../src/mcp-health-result.mjs';
test('completed but rejected MCP invocation is not accepted as health success',()=>{
 const rejected={type:'tool_call',subtype:'completed',tool_call:{mcpToolCall:{args:{toolName:'luban_probe_health'},result:{rejected:{reason:'User rejected MCP'}}}}};
 assert.equal(hasHealth(rejected),false);
 const success={content:[{type:'text',text:JSON.stringify({ok:true,stage:'S0',pageCapabilities:[]})}]};
 assert.equal(hasHealth(success),true);
 assert.equal(hasHealth({content:[{type:'text',text:JSON.stringify({ok:true,stage:'S0',pageCapabilities:['read_all_pages']})}]}),false);
});
