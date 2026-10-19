import {z} from 'zod';
export const candidateSchema=z.object({code:z.string().min(1).max(250000),grants:z.array(z.enum(['GM_addStyle'])).max(1),explanation:z.string().max(4000)}).strict();
// Some compatible endpoints return null tool_calls with JSON content. Validate
// the complete result locally instead of relying on the SDK's null-unsafe parser.
export function parseCandidateResponse(message:{tool_calls?:Array<{name:string;args:unknown}>;invalid_tool_calls?:unknown[];content:unknown}){
 if(message.invalid_tool_calls?.length)throw Error('HARNESS_MODEL_OUTPUT_INVALID');
 if(message.tool_calls?.length){if(message.tool_calls.length!==1||message.tool_calls[0].name!=='luban_candidate')throw Error('HARNESS_MODEL_OUTPUT_INVALID');return candidateSchema.parse(message.tool_calls[0].args);}
 if(typeof message.content!=='string'||message.content.length>300000)throw Error('HARNESS_MODEL_OUTPUT_INVALID');
 const text=message.content.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/,'$1');
 try{return candidateSchema.parse(JSON.parse(text));}catch{throw Error('HARNESS_MODEL_OUTPUT_INVALID');}
}
