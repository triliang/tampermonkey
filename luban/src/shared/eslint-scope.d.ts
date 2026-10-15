declare module 'eslint-scope' {
 export function analyze(ast:unknown,options:Record<string,unknown>):{globalScope:{through:Array<{identifier:{name:string;start:number;end:number;loc?:{start:{line:number;column:number}}};writeExpr?:unknown}>}};
}
