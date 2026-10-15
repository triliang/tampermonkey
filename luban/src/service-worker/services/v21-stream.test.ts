import {it,expect} from 'vitest';
import {parseOpenAIStream} from '../sse-parser';
async function collect(text:string){const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(text));c.close();}});const result=[];for await(const event of parseOpenAIStream(stream))result.push(event);return result;}
it('保留停止原因及DONE，不丢失length',async()=>{const r=await collect('data: {"choices":[{"delta":{"content":"x"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n');expect(r).toContainEqual({delta:'',done:false,finishReason:'length'});expect(r.at(-1)).toMatchObject({done:true,streamEnd:'done'});});
it('clean EOF与畸形数据区分',async()=>{const r=await collect('data: broken\n\n');expect(r).toContainEqual({delta:'',done:false,malformed:true});expect(r.at(-1)).toMatchObject({streamEnd:'eof'});});
