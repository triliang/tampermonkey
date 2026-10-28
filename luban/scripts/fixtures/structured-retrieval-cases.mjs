// Fixed synthetic gold declared independently of retrieval scores. No runtime site rules.
const scopes=['Profile','Privacy','Security','Display','Language','Notifications','Payments','History','Devices','Storage','Sessions','Billing'];
const group=(scope,i,layout)=>`<section><h2>${scope}</h2>${layout==='grid'?'<div style="display:grid;grid-template-columns:1fr 1fr">':'<div>'}<div><button id="edit-${i}">Edit</button><button id="open-${i}">Open</button></div></div></section>`;
export const comparisonCases=[
 ...['flow','grid','nested'].flatMap(layout=>['Billing Edit','Security Open'].map(query=>({id:layout+'-'+query.replace(' ','-'),category:'contextual',query,html:scopes.map((s,i)=>group(s,i,layout)).join(''),gold:[query.startsWith('Billing')?'edit-11':'open-2']}))),
 ...['flow','grid','nested'].map(layout=>({id:layout+'-multiple',category:'multiple',query:'登录方式',html:`<main><h1>账户</h1><div${layout==='grid'?' style="display:grid"':''}><section><h2>登录方式</h2><div><div><button id="mail">邮箱登录</button><button id="phone">手机登录</button></div></div></section><section><h2>偏好</h2><div><button id="keep">显示设置</button></div></section></div></main>`,gold:['mail','phone']})),
 {id:'no-match',category:'negative',query:'退款入口',html:'<main><h1>账户</h1><section><h2>个人资料</h2><button id="keep">显示设置</button></section></main>',gold:[]},
 {id:'inaccessible',category:'negative',query:'iframe 内部的确认按钮',html:'<main>正文</main><iframe title="外部内容" src="about:blank"></iframe>',gold:[]},
 {id:'synonym-gap',category:'unsupported-semantic',query:'推广',html:'<section><h2>Sponsored</h2><div><button id="sponsored">Learn more</button></div></section>',gold:['sponsored']},
 ...['flow','grid','nested'].map(layout=>({id:layout+'-exact',category:'exact',query:'账户设置',html:`<main><h1>首页</h1></main><section${layout==='grid'?' style="display:grid"':''}><div><button id="account" aria-label="账户设置"></button><button id="keep">帮助</button></div></section>`,gold:['account']}))
];
export const liveCaseIds=['nested-Billing-Edit','nested-multiple','no-match'];
