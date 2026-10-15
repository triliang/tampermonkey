export const REASONING_BYTES=64*1024;
export interface ReasoningStage {attempt:number;text:string;truncated:boolean;}
export function appendReasoning(current:string,delta:string,limit=REASONING_BYTES){
 const bytes=new TextEncoder().encode(current+delta);if(bytes.length<=limit)return{text:current+delta,truncated:false};
 return{text:new TextDecoder().decode(bytes.slice(0,limit),{stream:true}),truncated:true};
}
