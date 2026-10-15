'use strict';
// Real browser UI + local RPC bridge to actual .gs code in mocked Google services.
// This NEVER connects to Google, authenticates, creates external files, or deploys.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createFixture,quote,assertOk}=require('./rowstore-mock');
async function main(){
 const f=createFixture();assertOk(f.call('command',quote('fixture-quote',0)));const q=f.call('state').state.quotes[0];assertOk(f.call('command',{key:'fixture-convert',revision:1,type:'convert',payload:{id:q.id}}));
 const assets={'/':['index.html','text/html'],'/ui.js':['ui.js','text/javascript'],'/styles.css':['styles.css','text/css']};
 const server=http.createServer((req,res)=>{if(req.url==='/mock-gateway'&&req.method==='POST'){const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{try{const p=JSON.parse(Buffer.concat(chunks).toString('utf8'));const r=f.call(p.action,p.payload);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...r,mode:'google-mock'}));}catch(e){res.writeHead(500);res.end(JSON.stringify({ok:false,error:e.message}));}});return;}if(assets[req.url]){const [file,type]=assets[req.url];res.setHeader('Content-Type',type+'; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,file)));return;}res.writeHead(404);res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,target=await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'}).then(r=>r.json()),ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 const waiters=new Map(),errors=[],rpc=[];let seq=0;
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const w=waiters.get(m.id);if(w){waiters.delete(m.id);m.error?w.reject(Error(JSON.stringify(m.error))):w.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;waiters.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async condition=>{for(let i=0;i<200;i++){if(await evaluate(condition))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+condition);};
 try{
  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'window.google={script:{get run(){return {withSuccessHandler(fn){this.success=fn;return this},withFailureHandler(fn){this.failure=fn;return this},gateway(action,payload){window.fetch("/mock-gateway",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload})}).then(r=>r.json()).then(r=>this.success(r)).catch(e=>this.failure(e));}}}}};'});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening')cdp('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});});
  await cdp('Page.navigate',{url});await wait('typeof state!=="undefined" && state && state.orders.length===1');
  assert.equal(await evaluate('state.paging.orders.total'),1);
  const initialRevision=await evaluate('state.revision');await evaluate('window.qaArchive=null;URL.createObjectURL=b=>{window.qaArchive=b;return "blob:mock-download"};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};document.getElementById("backup").click()');
  await wait('!busy && window.qaArchive!==null');const archive=await evaluate('qaArchive.text().then(t=>JSON.parse(t))');assert.equal(archive.format,'mes-row-backup-v1');assert.ok(archive.pages.length>0);assert.equal(archive.manifest.revision,initialRevision);
  await evaluate('send("quote",{customer:"복원 전 추가",due:"2026-12-10",terms:"허구 조건",items:[{name:"추가품목",drawing:"R1",quantity:1,price:100}]})');assert.equal(await evaluate('state.paging.quotes.total'),2);
  const archiveFile=path.join(__dirname,'qa','mock-archive-temporary.json');fs.mkdirSync(path.dirname(archiveFile),{recursive:true});fs.writeFileSync(archiveFile,JSON.stringify(archive));
  try{const doc=await cdp('DOM.getDocument'),input=await cdp('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#restore'});await cdp('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[archiveFile]});await wait('!busy && !chunkCheckpoint && state.paging.quotes.total===1');}finally{fs.unlinkSync(archiveFile);}
  assert.equal(await evaluate('state.paging.orders.total'),1);assert.equal(await evaluate('state.audit.at(-1).type'),'restore');assert.equal(await evaluate('sessionStorage.getItem("mesRowRestore")'),null);
  assert.equal(errors.length,0,JSON.stringify(errors));
  const report={passed:true,mode:'actual browser with local Google-service mock; NO real Google connection',checks:['actual .gs row store state/page reaches real UI','browser assembles manifest/page archive','file selection executes staged row upload/validation/publication','pre-backup quote/order restored without loss','restore audit visible','resume metadata cleared','runtime exceptions 0'],mockMetrics:f.metrics};
  fs.writeFileSync(path.join(__dirname,'qa','google-mock-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{ws.close();await fetch('http://127.0.0.1:9223/json/close/'+target.id);await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
