import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const server=new McpServer({name:'luban-s0-probe',version:'0.0.1'});
server.registerTool('luban_probe_health',{description:'S0 health check. No browser, account, filesystem or write capabilities.',inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false}},async()=>({content:[{type:'text',text:JSON.stringify({ok:true,stage:'S0',pageCapabilities:[]})}]}));
await server.connect(new StdioServerTransport());
