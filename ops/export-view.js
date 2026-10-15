'use strict';
// 밖에서 보는 조회 화면(Apps Script)용 요약 자료를 만듭니다.
// 저장소 파일을 읽기만 하며, 계좌·첨부·성적서 원본·감사기록·요청키는 넣지 않습니다.
// 사용: node ops/export-view.js [출력파일]   (기본: G:\내 드라이브\saekim-mes-view\mes-view.json)
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const C=require('../core'),W=require('../workflow-overview'),D=require('../dashboard-model'),S=require('../settlement-model');

const ROW_LIMIT=50,QUOTE_LIMIT=150,ORDER_LIMIT=300;
const kstDate=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(d);
const kstStamp=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(d);
const quoteTotal=q=>(q.items||[]).reduce((sum,i)=>sum+(Number(i.quantity)||0)*(Number(i.price)||0),0);
const items=list=>(list||[]).map(i=>({name:i.name,drawing:i.drawing,quantity:i.quantity}));

function buildView(state,catalog,now=new Date()){
 const today=kstDate(now);
 const workflow=Object.values(W.build(state,now).groups).map(g=>({id:g.id,label:g.label,unit:g.unit,basis:g.basis,count:g.count,rows:g.rows.slice(0,ROW_LIMIT).map(r=>({customer:r.customer,label:r.label,date:r.date||null,status:r.status}))}));
 const converted=new Set(state.orders.map(o=>o.snapshot&&o.snapshot.familyId).filter(Boolean));
 const superseded=new Set(state.quotes.map(q=>q.previousId).filter(Boolean));
 const quotes=[...state.quotes].reverse().slice(0,QUOTE_LIMIT).map(q=>({number:q.quoteNumber||null,version:q.version,date:q.quoteDate||null,customer:q.customer,due:q.due||null,terms:q.terms||null,total:quoteTotal(q),items:items(q.items),converted:converted.has(q.familyId),superseded:superseded.has(q.id),canceled:!!q.canceled}));
 const orders=[...state.orders].reverse().slice(0,ORDER_LIMIT).map(o=>{const s=C.summary(o),snap=o.snapshot||{};return {number:snap.quoteNumber||null,customer:snap.customer,due:snap.due||null,items:items(snap.items),quantity:s.quantity,delivered:s.delivered,sale:s.sale,billed:s.billed,paid:s.paid,balance:s.balance,unbilled:s.unbilled,deliveryComplete:!!s.deliveryComplete,settlementComplete:!!s.settlementComplete,canceled:!!o.canceled};});
 const settlement=S.buildSettlement(state,catalog);
 const dashboard=D.buildDashboard(state,catalog);
 const from=kstDate(new Date(now.getTime()-30*864e5));
 const schedule=dashboard.events.filter(e=>e.dateKind==='scheduled'&&!e.completed&&e.date&&e.date>=from).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,200).map(e=>({date:e.date,type:e.calendarStatus&&e.calendarStatus.stage?e.calendarStatus.stage.label:e.type,label:e.label,status:e.calendarStatus&&e.calendarStatus.status?e.calendarStatus.status.label:e.status,overdue:e.date<today}));
 return {schema:1,generatedAt:now.toISOString(),generatedAtKst:kstStamp(now),today,revision:state.revision,totals:settlement.totals,workflow,schedule,orders,quotes};
}

function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}

function main(){
 const dataDir=process.env.MES_DATA_DIR||path.join(root,'data','material-cert-test');
 const out=process.argv[2]||path.join('G:\\내 드라이브','saekim-mes-view','mes-view.json');
 const state=readJson(path.join(dataDir,'state.json'));
 const catalogFile=path.join(dataDir,'material-catalog.json'),catalog=fs.existsSync(catalogFile)?readJson(catalogFile):{parties:[]};
 const view=buildView(state,catalog);
 fs.mkdirSync(path.dirname(out),{recursive:true});
 const tmp=out+'.part';fs.writeFileSync(tmp,JSON.stringify(view));fs.renameSync(tmp,out);
 console.log('조회 자료 저장: '+out+' · revision '+view.revision+' · '+view.generatedAtKst);
}

if(require.main===module)main();
module.exports={buildView};
