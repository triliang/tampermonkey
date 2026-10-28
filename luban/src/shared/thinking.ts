import type {ProviderConfig} from './types';
export type ThinkingProtocol='auto'|'thinking'|'none';
/** Unknown compatible servers must not receive vendor parameters automatically. */
export function thinkingProtocol(config:ProviderConfig):'thinking'|'none'{
 if(!config.customEndpoint)return 'thinking';
 if(config.thinkingProtocol==='thinking'||config.thinkingProtocol==='none')return config.thinkingProtocol;
 const host=new URL(config.baseUrl).hostname;
 return (host==='xiaomimimo.com'||host.endsWith('.xiaomimimo.com')||host==='api.deepseek.com')?'thinking':'none';
}
export function thinkingParameters(config:ProviderConfig,enabled:boolean):{thinking?:{type:'enabled'|'disabled'}}{return thinkingProtocol(config)==='thinking'?{thinking:{type:enabled?'enabled':'disabled'}}:{};}
