'use strict';
// Read-only check of the user's existing trial server. Does not click or mutate.
const fs=require('node:fs');
async function main(){
 const url='http://127.0.0.1:8787',response=await fetch(url+'/api/state',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('HTTP '+response.status);const before=await response.json();
 const target=await fetch('http://127.0.0.1:9223/json/new?'+encodeURIComponent(url),{method:'PUT'}).then(r=>r.json()),ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let n=0;const tasks=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&tasks.has(m.id)){const task=tasks.get(m.id);tasks.delete(m.id);m.error?task.reject(Error(JSON.stringify(m.error))):task.resolve(m.result);}};
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;tasks.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 try{await rpc('Page.enable');let result;for(let i=0;i<50;i++){const r=await rpc('Runtime.evaluate',{expression:'JSON.stringify({title:document.title,loaded:typeof state!=="undefined"&&!!state,message:document.getElementById("message")?.textContent,revision:typeof state!=="undefined"&&state?.revision})',returnByValue:true});if(r.exceptionDetails)throw Error('Browser runtime error');result=JSON.parse(r.result.value);if(result.loaded)break;await new Promise(r=>setTimeout(r,100));}if(!result.loaded)throw Error('UI data did not load');const shot=await rpc('Page.captureScreenshot',{format:'png'});fs.writeFileSync('qa/live-user-server.png',Buffer.from(shot.data,'base64'));const after=await fetch(url+'/api/state').then(r=>r.json());if(after.revision!==before.revision)console.log('Revision changed concurrently; this read-only check did not write.');const report={httpStatus:response.status,url,browser:'installed Chrome read-only',...result,trialRevisionBefore:before.revision,trialRevisionAfter:after.revision,mutations:0};fs.writeFileSync('qa/live-server-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
 finally{ws.close();await fetch('http://127.0.0.1:9223/json/close/'+target.id);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
