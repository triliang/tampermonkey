export const PANEL_PATH='src/sidepanel/index.html';
export function panelTabId(url:string):number|undefined{
 try{const values=new URL(url).searchParams.getAll('tabId');if(values.length!==1||!/^\d+$/.test(values[0]))return;const id=Number(values[0]);return Number.isSafeInteger(id)&&id>0?id:undefined;}catch{return;}
}
export const panelPath=(tabId:number)=>`${PANEL_PATH}?tabId=${tabId}`;
export const executorKey=(tabId?:number)=>tabId===undefined?'luban:v3:executor':`luban:v3:executor:tab:${tabId}`;
