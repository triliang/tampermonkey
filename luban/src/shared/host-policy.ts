import { DataError } from '../service-worker/repositories/database';
export function hostPattern(host:string):string{
  if(typeof host!=='string'||!host||!/^([a-z\d](?:[a-z\d-]*[a-z\d])?\.)*[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(host))throw new DataError('INVALID_HOST','自动运行需要准确主机名。');
  return `*://${host.toLowerCase()}/*`;
}
/** 请求权限时逐项对应 manifest 的 HTTP/HTTPS 声明，不请求通配协议。 */
export function hostPermissionOrigins(host:string):string[]{
  const pattern=hostPattern(host);
  return [pattern.replace('*://','http://'),pattern.replace('*://','https://')];
}
