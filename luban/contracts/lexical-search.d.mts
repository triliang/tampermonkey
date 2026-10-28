export interface LexicalDocument {id:string;text?:string;accessibleName?:string;context?:string;tag?:string;role?:string;attributes?:Record<string,string>;}
export function lexicalTokens(text:string):string[];
export function lexicalSearch<T extends LexicalDocument>(blocks:T[],query:string,limit?:number):Array<T&{score:number}>;
