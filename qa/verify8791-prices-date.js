'use strict';
// Own headless QA tab only. No command, upload, restore or user-tab action.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='http://127.0.0.1:8791',hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function main(){
 const before=await fetch(base+'/api/backup').then(r=>r.text());
 const css=await fetch(base+'/quote-inputs.staged.css').then(r=>r.text()),disk=fs.readFileSync(path.join(__dirname,'../quote-inputs.staged.css'),'utf8');assert.equal(hash(css),hash(disk));
 const target=await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'}).then(r=>r.json()),ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let sequence=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 try{
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1365,height:950,deviceScaleFactor:1,mobile:false});await cdp('Page.navigate',{url:base});let ready=false;for(let i=0;i<200;i++){if(await run('typeof state!=="undefined"&&!!state&&document.querySelectorAll("[data-f=master] option").length>=81')){ready=true;break;}await new Promise(r=>setTimeout(r,40));}assert.ok(ready);
  const catalog=(await fetch(base+'/api/catalog').then(r=>r.json())).catalog;
  await run('MESNavigation.navigate("quotes")');
  const examples=[];for(const name of ['CLEAN PVC','AL6061','PEEK']){const m=catalog.materials.find(m=>m.name===name);await run(`var select=document.querySelector('[data-f=master]');select.value=${JSON.stringify(m.id)};select.dispatchEvent(new Event('change',{bubbles:true}));`);const rate=await run("Number(document.querySelector('[data-f=kgRate]').value)");assert.equal(rate,m.kgRate);examples.push({name,kgRate:rate});}
  const due=await run("(()=>{const w=document.querySelector('.due-segments');return {display:getComputedStyle(w).display,ys:[...w.querySelectorAll('input')].map(i=>i.getBoundingClientRect().y),labels:[...w.querySelectorAll('input')].map(i=>i.getAttribute('aria-label'))}})()");assert.equal(due.display,'grid');assert.ok(due.ys.every(y=>y===due.ys[0]));assert.deepEqual(due.labels,['연 YY','월 MM','일 DD']);
  const after=await fetch(base+'/api/backup').then(r=>r.text());assert.equal(hash(after),hash(before),'Live data changed during readonly probe');assert.equal(errors.length,0);
  const b=JSON.parse(after),report={passed:true,base,readOnlyProbe:true,ownHeadlessTab:true,userTabsTouched:false,liveBackupUnchanged:hash(after),catalogRevision:catalog.revision,materials:catalog.materials.length,prices:catalog.materials.filter(m=>m.kgRate!==null).length,partyCount:b.catalog.suppliers.length,quoteCount:b.state.quotes.length,orderCount:b.state.orders.length,attachmentCount:b.attachments.length,certificateCount:b.materialCertificates?.index.files.length||0,cssSHA256:hash(css),examples,due,runtimeExceptions:errors.length};
  fs.writeFileSync(path.join(__dirname,'reports/krw-live8791.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await fetch('http://127.0.0.1:9223/json/close/'+target.id);ws.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
