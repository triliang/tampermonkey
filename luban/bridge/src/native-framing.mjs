import { TextDecoder } from 'node:util';
import { POLICY } from './policy.mjs';
const utf8=new TextDecoder('utf-8',{fatal:true});
export function encodeFrame(value){const body=Buffer.from(JSON.stringify(value));if(!body.length||body.length>POLICY.nativeFrameBytes)throw Error('FRAME_SIZE');const header=Buffer.alloc(4);header.writeUInt32LE(body.length);return Buffer.concat([header,body]);}
export class FrameDecoder {
  #buffer=Buffer.alloc(0);#failed=false;
  push(chunk){if(this.#failed)throw Error('DECODER_CLOSED');this.#buffer=Buffer.concat([this.#buffer,chunk]);const result=[];try{while(this.#buffer.length>=4){const size=this.#buffer.readUInt32LE();if(size===0||size>POLICY.nativeFrameBytes)throw Error('FRAME_SIZE');if(this.#buffer.length<4+size)break;result.push(JSON.parse(utf8.decode(this.#buffer.subarray(4,4+size))));this.#buffer=this.#buffer.subarray(4+size);}return result;}catch(e){this.#failed=true;this.#buffer=Buffer.alloc(0);throw e;}}
  end(){if(this.#buffer.length)throw Error('TRUNCATED_FRAME');}
}
