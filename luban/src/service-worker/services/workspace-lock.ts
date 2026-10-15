import {DataError} from '../repositories/database';
const locks=new Map<string,symbol>();
export const workspaceLocked=(id:string)=>locks.has(id);
export function lockWorkspace(id:string):()=>void{if(locks.has(id))throw new DataError('WORKSPACE_BUSY','当前工具正在处理，请等待或取消。');const token=Symbol(id);locks.set(id,token);return()=>{if(locks.get(id)===token)locks.delete(id);};}
export async function withWorkspaceLock<T>(id:string,action:()=>Promise<T>):Promise<T>{const release=lockWorkspace(id);try{return await action();}finally{release();}}
