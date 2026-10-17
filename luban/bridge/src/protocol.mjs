import {z} from 'zod';
import contract from './protocol-contract.json' with {type:'json'};
export const BRIDGE_VERSION=contract.bridgeVersion;
export const PROTOCOL_VERSION=contract.protocolVersion;
export const requestSchema=z.object({protocolVersion:z.literal(PROTOCOL_VERSION),requestId:z.string().min(1).max(128),method:z.enum(contract.methods),params:z.record(z.string(),z.unknown()).default({})}).strict();
export const pageSchema=z.object({pageRef:z.string().uuid(),browserSession:z.string().uuid(),documentId:z.string().min(1).max(128),navigationEpoch:z.number().int().nonnegative(),title:z.string().max(160),url:z.string().max(2048).refine(value=>{try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}}),workspaceId:z.string().uuid().optional(),capabilities:z.array(z.enum(['context.read','tool.read','draft.submit','trial.request'])).min(1).max(4).refine(values=>values.includes('context.read')&&new Set(values).size===values.length)}).strict();
export const pageSyncSchema=z.object({pages:z.array(pageSchema).max(20)}).strict();
export const credentialsSchema=z.object({profileId:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function protocolError(code){return Object.assign(new Error(code),{code});}
