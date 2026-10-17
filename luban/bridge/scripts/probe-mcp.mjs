import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
const client=new Client({name:'luban-s0-sdk-test',version:'0.0.1'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/mcp-server.mjs',import.meta.url))],stderr:'pipe'});
try{await client.connect(transport);const tools=await client.listTools();if(tools.tools.length!==1||tools.tools[0].name!=='luban_probe_health')throw Error('Unexpected tools');const result=await client.callTool({name:'luban_probe_health',arguments:{}});if(result.isError)throw Error('Tool failed');console.log(JSON.stringify({check:'sdk-mcp-stdio',tools:tools.tools.map(t=>t.name),result,realClientValidation:false},null,2));}finally{await client.close();}
