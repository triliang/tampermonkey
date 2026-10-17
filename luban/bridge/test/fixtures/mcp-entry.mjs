import {McpConnection} from '../../src/mcp-connection.mjs';
import {createMcpAdapter} from '../../src/mcp-adapter.mjs';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
const connection=new McpConnection(process.argv[2],{stateDir:process.argv[3]});
const server=createMcpAdapter(connection,{readWaitMs:100});
await server.connect(new StdioServerTransport(process.stdin,process.stdout,{maxBufferSize:1024*1024}));
process.stdin.once('end',()=>connection.close());
