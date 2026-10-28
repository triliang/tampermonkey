import {afterEach,expect,it,vi} from 'vitest';
import {initializeTabPanels,openTabPanel,openToolbarPanel,configureTabPanel,forgetTabPanel} from './tab-panel';
import {panelTabId,executorKey} from '../../shared/panel-tab';
afterEach(()=>{for(const id of [11,22,33,44])forgetTabPanel(id);vi.unstubAllGlobals();});
it('default disabled, only clicked tab is enabled and opened; failed configuration never opens a global panel',async()=>{
 const setOptions=vi.fn(async()=>{}),open=vi.fn(async()=>{}),setPanelBehavior=vi.fn(async()=>{});vi.stubGlobal('chrome',{sidePanel:{setOptions,open,setPanelBehavior},tabs:{query:vi.fn(async()=>[{id:11},{id:22}])}});
 await initializeTabPanels();expect(setOptions).toHaveBeenCalledWith({enabled:false});expect(setPanelBehavior).toHaveBeenCalledWith({openPanelOnActionClick:false});expect(open).not.toHaveBeenCalled();
 await openTabPanel(11);await openTabPanel(22);expect(open.mock.calls).toEqual([[{tabId:11}],[{tabId:22}]]);expect(setOptions).toHaveBeenCalledWith({tabId:11,path:'src/sidepanel/index.html?tabId=11',enabled:true});
 setOptions.mockRejectedValueOnce(Error('blocked'));await expect(configureTabPanel(33)).rejects.toThrow('blocked');expect(open).toHaveBeenCalledTimes(2);
});
it('tab identities and executor preferences cannot collapse into the global panel',()=>{
 expect(panelTabId('chrome-extension://id/src/sidepanel/index.html?tabId=12')).toBe(12);
 for(const suffix of ['', '?tabId=0','?tabId=-2','?tabId=1.2','?tabId=2&tabId=3','?tabId=NaN'])expect(panelTabId('https://fixture.invalid/'+suffix)).toBeUndefined();
 expect(executorKey(11)).not.toBe(executorKey(22));expect(executorKey(11)).not.toBe(executorKey());
});

it('open invokes Chrome synchronously inside the gesture; an unprepared tab never opens a global panel',async()=>{
 const open=vi.fn(async()=>{});vi.stubGlobal('chrome',{sidePanel:{setOptions:vi.fn(async()=>{}),open}});
 await expect(openTabPanel(44)).rejects.toThrow('正在准备');expect(open).not.toHaveBeenCalled();await configureTabPanel(44);
 const result=openTabPanel(44);expect(open).toHaveBeenCalledWith({tabId:44});await result;
});

it('toolbar action opens synchronously without relying on worker memory or switching tabs',async()=>{const open=vi.fn(async()=>{});vi.stubGlobal('chrome',{sidePanel:{open}});const task=openToolbarPanel(55);expect(open).toHaveBeenCalledWith({tabId:55});await task;await expect(openToolbarPanel(-1)).rejects.toThrow('无效');expect(open).toHaveBeenCalledTimes(1);});
