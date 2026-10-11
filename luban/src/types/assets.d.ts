// CRXJS 动态资源导入的类型声明：
// `?script` 返回打包后的可注入脚本路径；`?script&iife` 返回自包含 IIFE 变体。
declare module '*?script' {
  const path: string;
  export default path;
}
declare module '*?script&iife' {
  const path: string;
  export default path;
}
declare module '*?iife' {
  const path: string;
  export default path;
}
