export interface ReasoningNode {title:string;text:string;}
const boundary=/^(?:#{1,6}\s+|\d+[.)、]\s+|(?:步骤|Step)\s*\d+[:：.\s])/i;
/** Structural grouping only: never invent or summarize the model's content. */
export function reasoningNodes(text:string):ReasoningNode[]{
 const lines=text.split('\n');let fenced=false;
 const headings=lines.some(line=>{if(/^\s*```/.test(line)){fenced=!fenced;return false;}return !fenced&&boundary.test(line.trim());});
 fenced=false;const parts:string[][]=[];let current:string[]=[];
 const flush=()=>{if(current.some(l=>l.trim()))parts.push(current);current=[];};
 for(const line of lines){
  const marker=/^\s*```/.test(line);
  if(!fenced&&((headings&&boundary.test(line.trim()))||(!headings&&!line.trim()))&&parts.length<63)flush();
  current.push(line);if(marker)fenced=!fenced;
 }
 flush();return parts.map((part,i)=>{const value=part.join('\n').trim();const first=part.find(l=>l.trim())?.trim()??'';const label=first.replace(/^#{1,6}\s+|^\d+[.)、]\s+/,'').replace(/\*\*|`/g,'');return{title:label.length>52?label.slice(0,52)+'…':label||`推理节点 ${i+1}`,text:value};});
}
