import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// Source checkout and packaged Bridge have different roots; only bundled locations are accepted.
const source=new URL('../../contracts/script-plan.mjs',import.meta.url);
const packaged=new URL('../contracts/script-plan.mjs',import.meta.url);
const compiler=await import((existsSync(fileURLToPath(packaged))?packaged:source).href);
export const {compilePlan,serializeUserscript,validateSelector}=compiler;

const genericSource=new URL('../../contracts/script-generation.mjs',import.meta.url);
const genericPackaged=new URL('../contracts/script-generation.mjs',import.meta.url);
const generic=await import((existsSync(fileURLToPath(genericPackaged))?genericPackaged:genericSource).href);
export const {validateGenerationEnvelope,validateScriptCandidate}=generic;
