import type {BridgeAction, BridgeReply, BridgeSnapshot,LocalTasksReply,PageGrant,ExternalCommand} from '../../shared/bridge-types';
import {localTasks} from './local-tasks';
import {BRIDGE_HOST,BRIDGE_PROTOCOL_VERSION} from '../../shared/bridge-protocol';

const HOST = BRIDGE_HOST;
const KEY = 'luban:v3:bridge-pairing';
type Credentials = {profileId: string; token: string};
type NativeReply = {protocolVersion: number; requestId: string; ok: boolean; data?: Record<string, unknown>; error?: {code: string}};
const actions = new Set<BridgeAction>(['status', 'connect', 'disconnect', 'revoke', 'check-page-access']);

export class BridgeConnection {
  private port?: chrome.runtime.Port;
  private pending = new Map<string, {resolve: (r: NativeReply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>}>();
  private snapshot: BridgeSnapshot = {status: 'disconnected', extensionId: chrome.runtime.id, paired: false, pageCount: 0};
  private queue: Promise<unknown> = Promise.resolve();
  private onInvalidated:()=>Promise<void>=async()=>undefined;
  private pollTimer?:ReturnType<typeof setInterval>;
  private pollBusy=false;private evidenceBusy=false;private evidenceHandler:((c:import('../../shared/v4-types').V4Conversation)=>Promise<unknown>)|null=null;
  setEvidenceHandler(handler:(c:import('../../shared/v4-types').V4Conversation)=>Promise<unknown>){this.evidenceHandler=handler;}
  private pollEvidence(){if(!this.evidenceHandler||this.evidenceBusy)return;this.evidenceBusy=true;void this.rpc('harness.evidencePull').then(async data=>{if(Array.isArray(data.conversations))for(const c of data.conversations)await this.evidenceHandler!(c);}).catch(()=>{}).finally(()=>{this.evidenceBusy=false;});}
  private onTask:(command:ExternalCommand)=>Promise<void>=async()=>undefined;
  private onCancel:(taskId:string,epoch:number)=>Promise<void>=async()=>undefined;
  private onConnected:()=>Promise<void>=async()=>undefined;
  setTaskHandlers(task:(command:ExternalCommand)=>Promise<void>,cancel:(taskId:string,epoch:number)=>Promise<void>,connected:()=>Promise<void>){this.onTask=task;this.onCancel=cancel;this.onConnected=connected;}
  rpc(method:string,params:Record<string,unknown>={}):Promise<Record<string,unknown>>{const next=this.queue.then(()=>this.call(method,params));this.queue=next.catch(()=>undefined);return next;}
  private startPolling(){clearInterval(this.pollTimer);this.pollTimer=setInterval(()=>{if(this.pollBusy||this.snapshot.status!=='connected')return;this.pollBusy=true;this.pollEvidence();void this.rpc('tasks.pull').then(data=>{if(Array.isArray(data.cancellations))for(const entry of data.cancellations as Array<{taskId:string;epoch:number}>)void this.onCancel(entry.taskId,entry.epoch).catch(()=>{});if(Array.isArray(data.commands))for(const command of data.commands as ExternalCommand[])void this.onTask(command).catch(()=>{});}).catch(()=>{}).finally(()=>{this.pollBusy=false;});},1000);}
  setInvalidationHandler(handler:()=>Promise<void>):void{this.onInvalidated=handler;}
  syncPages(grants:PageGrant[]):Promise<void>{const next=this.queue.then(async()=>{if(this.snapshot.status!=='connected')throw new Error('请先连接 Bridge。');const pages=grants.filter(g=>g.profileId===this.snapshot.profileId).map(g=>({pageRef:g.id,browserSession:g.browserSession,documentId:g.binding.documentId,navigationEpoch:g.navigationEpoch,title:g.title,url:g.binding.url,...(g.workspaceId?{workspaceId:g.workspaceId}:{}),capabilities:g.capabilities??['context.read']}));await this.call('pages.sync',{pages});this.snapshot.pageCount=pages.length;});this.queue=next.catch(()=>undefined);return next;}

  run(action: BridgeAction): Promise<BridgeSnapshot> {
    const next = this.queue.then(() => this.perform(action));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async credentials(): Promise<Credentials | undefined> {
    const value = (await chrome.storage.local.get(KEY))[KEY] as Partial<Credentials> | undefined;
    return value && typeof value.profileId === 'string' && typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token)
      ? value as Credentials : undefined;
  }

  private detach(message?: string): void {
    const port = this.port;
    this.port = undefined;
    clearInterval(this.pollTimer);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error(message ?? '连接已断开。')); }
    this.pending.clear();
    void this.onInvalidated().catch(()=>undefined);
    port?.disconnect();
    this.snapshot = {...this.snapshot, status: message ? 'error' : 'disconnected', pageCount: 0, message};
  }

  private request(method: string, params: Record<string, unknown> = {}): Promise<NativeReply> {
    const port = this.port;
    if (!port) return Promise.reject(new Error('Bridge 尚未连接。'));
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Bridge 响应超时，请重新连接。')); this.detach('Bridge 响应超时，请重新连接。'); }, 10000);
      this.pending.set(requestId, {resolve, reject, timer});
      try { port.postMessage({protocolVersion: BRIDGE_PROTOCOL_VERSION, requestId, method, params}); }
      catch { clearTimeout(timer); this.pending.delete(requestId); reject(new Error('无法向 Bridge 发送请求。')); }
    });
  }

  private async call(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const reply = await this.request(method, params);
    if (!reply.ok) throw Object.assign(new Error(reply.error?.code === 'PAIRING_REQUIRED' ? '配对已失效，请重新连接。' : reply.error?.code === 'INVALID_REQUEST' ? '请求参数未通过本机 Bridge 校验，本次操作未执行。' : reply.error?.code ?? 'Bridge 请求失败。'), {code: reply.error?.code});
    return reply.data ?? {};
  }

  private async perform(action: BridgeAction): Promise<BridgeSnapshot> {
    if (action === 'status') return {...this.snapshot, paired: !!await this.credentials()};
    if (action === 'disconnect') { this.detach(); return {...this.snapshot}; }
    if (action === 'check-page-access') {
      const pages = await this.call('pages.list');
      this.snapshot.pageCount = Array.isArray(pages.pages) ? pages.pages.length : 0;
      const reply = await this.request('context.read');
      if (reply.ok || reply.error?.code !== 'PAGE_NOT_GRANTED') throw new Error('页面访问边界检查未通过。');
      this.snapshot.message = '页面访问已阻止：尚未授权任何网页。';
      return {...this.snapshot};
    }
    if (action === 'revoke') {
      // Keep credentials until native revocation succeeds, so a lost connection
      // cannot be presented as a successful revocation.
      if (!this.port || this.snapshot.status !== 'connected') await this.perform('connect');
      await this.call('profile.revoke');
      await chrome.storage.local.remove(KEY);
      this.detach();
      this.snapshot = {...this.snapshot, paired: false, profileId: undefined, message: '本机配对已撤销。'};
      return {...this.snapshot};
    }
    if (this.port && this.snapshot.status === 'connected') {
      try{await this.call('health.get');const pages=await this.call('pages.list');this.snapshot.pageCount=Array.isArray(pages.pages)?pages.pages.length:0;return {...this.snapshot};}
      catch(error){if((error as {code?:string}).code==='PAIRING_REQUIRED'){await chrome.storage.local.remove(KEY);this.snapshot.paired=false;this.snapshot.profileId=undefined;}this.detach(error instanceof Error?error.message:'连接检查失败。');throw error;}
    }
    if (!await chrome.permissions.contains({permissions: ['nativeMessaging']})) throw new Error('请先允许鲁班连接本机应用。');
    this.detach();
    this.snapshot = {...this.snapshot, status: 'connecting', message: undefined};
    const port = chrome.runtime.connectNative(HOST);
    this.port = port;
    port.onDisconnect.addListener(() => {
      const raw = chrome.runtime.lastError?.message;
      if (this.port !== port) return;
      const message = /forbidden/i.test(raw ?? '') ? 'Bridge 未允许当前扩展 ID，请核对安装注册。'
        : /not found|not registered/i.test(raw ?? '') ? '尚未安装 Bridge，请按安装说明注册。' : 'Bridge 连接已断开，请重新连接。';
      this.detach(message);
    });
    port.onMessage.addListener((value: NativeReply) => {
      if (!value || value.protocolVersion !== BRIDGE_PROTOCOL_VERSION || typeof value.requestId !== 'string' || typeof value.ok !== 'boolean') { this.detach('Bridge 协议不兼容。'); return; }
      const item = this.pending.get(value.requestId);
      if (!item) return;
      clearTimeout(item.timer); this.pending.delete(value.requestId); item.resolve(value);
    });
    try {
      const health = await this.call('health.get');
      if (health.service !== 'luban-bridge' || health.protocolVersion !== BRIDGE_PROTOCOL_VERSION || typeof health.version !== 'string') throw new Error('Bridge 版本不兼容。');
      let credentials = await this.credentials();
      if (credentials) {
        try { await this.call('profile.authenticate', credentials); }
        catch (error) {
          if ((error as {code?: string}).code === 'PAIRING_REQUIRED') {
            await chrome.storage.local.remove(KEY);
            this.snapshot.paired = false;
            this.snapshot.profileId = undefined;
          }
          throw error;
        }
      }
      else {
        const pair = await this.call('profile.pair');
        if (typeof pair.profileId !== 'string' || typeof pair.token !== 'string' || !/^[a-f0-9]{64}$/.test(pair.token)) throw new Error('Bridge 配对响应无效。');
        credentials = {profileId: pair.profileId, token: pair.token};
        await chrome.storage.local.set({[KEY]: credentials});
      }
      const pages = await this.call('pages.list');
      this.snapshot = {status: 'connected', extensionId: chrome.runtime.id, paired: true, profileId: credentials.profileId,
        version: health.version, node: String(health.node ?? ''), platform: `${health.platform ?? ''}/${health.arch ?? ''}`,
        pageCount: Array.isArray(pages.pages) ? pages.pages.length : 0};
      this.startPolling();void Promise.resolve().then(()=>this.onConnected()).catch(()=>{});
      return {...this.snapshot};
    } catch (error) { this.detach(error instanceof Error ? error.message : 'Bridge 连接失败。'); throw error; }
  }
}

export const bridgeConnection = new BridgeConnection();
export function isBridgeMessage(raw: unknown): boolean {return !!raw && typeof raw === 'object' && ['V3_BRIDGE','V3_LOCAL_TASKS'].includes(String((raw as {type?: unknown}).type));}
export async function handleBridgeMessage(raw: unknown, sender: chrome.runtime.MessageSender): Promise<BridgeReply|LocalTasksReply> {
  try {
    // Options is the only pairing/revocation surface; a content script cannot
    // gain native credentials by forwarding the same message type.
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('src/options/index.html')) throw new Error('此操作只允许从鲁班连接设置发起。');
    if ((raw as {type?:string})?.type === 'V3_LOCAL_TASKS') return await localTasks(raw);
    const msg = raw as {action?: BridgeAction};
    if (!msg || !msg.action || !actions.has(msg.action)) throw new Error('连接操作无效。');
    return {ok: true, data: await bridgeConnection.run(msg.action)};
  } catch (error) { return {ok: false, error: error instanceof Error ? error.message : '连接失败。'}; }
}
