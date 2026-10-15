'use strict';
// Installed Chrome, isolated headless profile. No sign-in, network site, or production data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{createServer}=require('./server');
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mes-browser-')),server=createServer({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port,target=await fetch('http://127.0.0.1:9223/json/new?'+encodeURIComponent(url),{method:'PUT'}).then(r=>r.json()),ws=new WebSocket(target.webSocketDebuggerUrl),waiters=new Map(),errors=[];let next=0;
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const w=waiters.get(m.id);if(w){waiters.delete(m.id);m.error?w.reject(Error(JSON.stringify(m.error))):w.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;waiters.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evalJS=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async condition=>{for(let i=0;i<100;i++){if(await evalJS(condition))return;await new Promise(r=>setTimeout(r,50));}throw Error('DOM wait timeout: '+condition);};
 const fill=values=>evalJS('(()=>{const v='+JSON.stringify(values)+';for(const [selector,value] of Object.entries(v)){const el=document.querySelector(selector);if(!el)throw Error(selector);el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));}})()');
 const click=label=>evalJS('(()=>{const buttons=[...document.querySelectorAll("button")];const b=buttons.find(b=>b.textContent.trim()==='+JSON.stringify(label)+');if(!b)throw Error("button "+'+JSON.stringify(label)+'+" available="+buttons.map(x=>x.textContent).join("|"));b.click();})()');
 const revision=()=>evalJS('state.revision');
 const act=async(label,values)=>{const before=await revision();await click(label);if(values){await wait('document.getElementById("dialog").open');await fill(Object.fromEntries(Object.entries(values).map(([k,v])=>['#form [name="'+k+'"]',v])));await evalJS('document.querySelector("#form [type=submit]").click()');}await wait('state.revision>'+before+' && !busy');};
 try{
  await cdp('Runtime.enable');await cdp('Page.enable');await wait('typeof state!=="undefined" && state && document.querySelector(".item")');
  assert.equal(await evalJS('document.querySelector("#todoOrders").textContent'),'0건');
  await fill({'#customer':'허구 QA기업','#due':'2026-11-01','#terms':'납품후30일','.item [data-f=name]':'브래킷','.item [data-f=drawing]':'QA-R1','.item [data-f=quantity]':'10','.item [data-f=price]':'50000'});
  await evalJS('document.querySelector(".material-panel").open=true;document.querySelector("[data-f=costEnabled]").checked=true;document.querySelector("[data-f=costEnabled]").dispatchEvent(new Event("change",{bubbles:true}))');
  await fill({'.item [data-f=length]':100,'.item [data-f=width]':100,'.item [data-f=height]':10,'.item [data-f=density]':7.85,'.item [data-f=kgRate]':2000,'.item [data-f=hours]':2,'.item [data-f=hourRate]':15000,'.item [data-f=pricingRate]':20,'.item [data-f=multiplier]':1});
  assert.ok((await evalJS('document.querySelector(".estimate").textContent')).includes('0.7850 kg'));
  const quoteRevision=await revision();
  await evalJS('(()=>{const original=window.fetch;let lose=true;window.fetch=async(...args)=>{const response=await original(...args);if(lose && args[0]==="/api/command"){lose=false;throw Error("QA simulated response loss AFTER commit");}return response;};})()');
  await evalJS('document.getElementById("create").click();document.getElementById("create").click()');await wait('!busy && pending && !document.getElementById("retryArea").hidden');assert.ok(await evalJS('!!sessionStorage.getItem("mesPending")'));
  await click('같은 요청 다시 시도');await wait('state.revision>'+quoteRevision+' && !busy');assert.equal(await evalJS('state.quotes.length'),1);await act('수주 전환 →');
  const cancelRevision=await revision();await click('공정 추가');await wait('document.getElementById("dialog").open');await fill({'#form [name=name]':'미저장 작업'});await click('취소');assert.equal(await revision(),cancelRevision);
  await act('공정 추가',{name:'밀링',mode:'자체',estimated:300000});
  await act('작업 기록 →',{hours:2,rate:15000,good:10,bad:0});
  await act('재고 위치 이동',{from:'수입검사',to:'재고',quantity:3,reason:'시험 보관'});
  await act('재고 위치 이동',{from:'재고',to:'수입검사',quantity:3,reason:'검사 준비'});
  await act('실제 소재비 기록',{kg:7.85,kgRate:2000,note:'시험소재'});
  await act('수량 검사 →',{quantity:4,rejected:0});
  await act('부분 납품 →',{quantity:4});
  await act('청구 기록 →',{amount:200000});
  await act('부분 입금 기록 →',{date:'2026-11-02',amount:100000});
  assert.equal(await evalJS('state.summaries[0].balance'),100000);
  assert.equal(await evalJS('state.summaries[0].complete'),false);
  await act('수량 검사 →',{quantity:6,rejected:0});await act('부분 납품 →',{quantity:6});await act('청구 기록 →',{amount:300000});
  await act('부분 입금 기록 →',{date:'2026-11-03',amount:100000});await act('부분 입금 기록 →',{date:'2026-11-03',amount:300000});
  assert.equal(await evalJS('state.summaries[0].complete'),true);
  const before=await revision();await click('부분 납품 →');await fill({'#form [name=quantity]':1});await evalJS('document.querySelector("#form [type=submit]").click()');await wait('!busy && !document.getElementById("dialogError").hidden');assert.equal(await revision(),before);await click('취소');
  await cdp('Page.reload');await wait('typeof state!=="undefined" && state && state.orders.length===1');assert.equal(await evalJS('state.summaries[0].complete'),true);
  const backed=await fetch(url+'/api/backup').then(r=>r.json()),backupFile=path.join(dir,'browser-backup.json');fs.writeFileSync(backupFile,JSON.stringify(backed));
  await fill({'#customer':'복원전추가','#due':'2026-11-10','#terms':'선금','.item [data-f=name]':'추가품목','.item [data-f=drawing]':'R0','.item [data-f=quantity]':1,'.item [data-f=price]':100});await act('견적 저장 →');assert.equal(await evalJS('state.quotes.length'),2);
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening')cdp('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});});
  const doc=await cdp('DOM.getDocument'),input=await cdp('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#restore'}),restoreRev=await revision();await cdp('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[backupFile]});await wait('state.revision>'+restoreRev+' && !busy');assert.equal(await evalJS('state.quotes.length'),1);assert.equal(await evalJS('state.summaries[0].complete'),true);
  await evalJS('location.hash="orders"');await evalJS('location.hash="newQuote"');await evalJS('history.back()');await wait('location.hash==="#orders"');assert.equal(await evalJS('state.orders.length'),1);
  fs.mkdirSync(path.join(__dirname,'qa'),{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
   await evalJS('document.documentElement.style.scrollBehavior="auto";window.scrollTo({top:0,behavior:"instant"})');await new Promise(r=>setTimeout(r,100));
   assert.ok(await evalJS('document.documentElement.scrollWidth<=window.innerWidth+1'),'horizontal overflow '+name);
   const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(__dirname,'qa',name+'.png'),Buffer.from(shot.data,'base64'));
   await evalJS('document.getElementById("orders").scrollIntoView({behavior:"instant"})');await new Promise(r=>setTimeout(r,100));const orderShot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(__dirname,'qa',name+'-order.png'),Buffer.from(orderShot.data,'base64'));
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  const report={browser:'Chrome headless via isolated profile',passed:true,checks:['actual browser complete quote/order/production/inventory/inspection/delivery/payment','material formula preview','simulated response loss after real commit retries same key without duplicate','double click quote creates once','cancel dialog makes no mutation','partial payment balance and incomplete','invalid excess delivery refused','reload persisted snapshot','actual file-input backup restore','hash navigation back preserves state','desktop 1440 and mobile 390 no horizontal overflow','zero runtime exceptions'],revision:await revision()};
  fs.writeFileSync(path.join(__dirname,'qa','browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{ws.close();await fetch('http://127.0.0.1:9223/json/close/'+target.id);await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
