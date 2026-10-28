import {existsSync} from 'node:fs';
const source=new URL('../../contracts/lexical-search.mjs',import.meta.url);
const packaged=new URL('../contracts/lexical-search.mjs',import.meta.url);
export const {lexicalSearch}=await import(existsSync(packaged)?packaged:source);
