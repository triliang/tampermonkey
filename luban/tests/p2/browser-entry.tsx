import { Privacy } from '../../src/options/tabs/Privacy';
import { render, h } from 'preact';
import App from '../../src/sidepanel/App';
import '../../src/sidepanel/styles/panel.css';
import { installHarness } from './harness';
const storageKey=location.pathname.includes('p5-')?'luban-p5-harness-db':location.pathname.includes('p4-')?'luban-p4-harness-db':location.pathname.includes('p3-')?'luban-p3-harness-db':'luban-p2-harness-db';
const databaseName=localStorage.getItem(storageKey)??'luban-ui-browser-'+crypto.randomUUID();
localStorage.setItem(storageKey,databaseName);
const harness=await installHarness(databaseName);
render(h(App,{}),document.getElementById('app')!);
document.getElementById('switch')!.onclick=()=>harness.switchSite();
document.getElementById('pick-target')!.onclick=()=>harness.pick();
document.getElementById('failure')!.onchange=e=>harness.setFailure((e.target as HTMLInputElement).checked);
document.getElementById('transport')!.onclick=()=>{document.getElementById('requests')!.textContent=JSON.stringify(harness.sent,null,2);};

const permission=document.getElementById('permission');if(permission)permission.onchange=e=>harness.setPermission((e.target as HTMLInputElement).checked);
const registration=document.getElementById('registration');if(registration)registration.onchange=e=>harness.setRegistrationFailure((e.target as HTMLInputElement).checked);
const registry=document.getElementById('registry');if(registry)registry.onclick=()=>{document.getElementById('registry-result')!.textContent=JSON.stringify(harness.registry(),null,2);};

const privacy=document.getElementById('privacy-root');if(privacy)render(h(Privacy,{}),privacy);
