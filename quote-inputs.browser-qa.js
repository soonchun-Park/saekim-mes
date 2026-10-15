'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const allowed=new Set(['quote-inputs.fixture.html','quote-inputs.staged.js','quote-inputs.staged.css']);
 const server=http.createServer((req,res)=>{const file=req.url==='/'?'quote-inputs.fixture.html':req.url.slice(1);if(!allowed.has(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,file)));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let ws,target;const checks=[];
 try{
 const version=await fetch('http://127.0.0.1:9223/json/version').then(r=>r.json());
 target=await fetch('http://127.0.0.1:9223/json/new?'+encodeURIComponent('http://127.0.0.1:'+server.address().port),{method:'PUT'}).then(r=>r.json());
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),runtimeErrors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')runtimeErrors.push(m.params.exceptionDetails);};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await cdp('Runtime.enable');await cdp('Page.enable');for(let n=0;n<60;n++){if(await evaluate('typeof dateInput!=="undefined"'))break;await new Promise(r=>setTimeout(r,50));}
 const focus=async(sel,start,end)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});el.focus();el.setSelectionRange(${start??0},${end??0});})()`);
 const resetDate=()=>evaluate('dateInput.fields.forEach(x=>{x.value="";x.maxLength=2});dateInput.fields[0].focus();dateInput.fields[0].dispatchEvent(new Event("input",{bubbles:true}))');
 const type=async(text,delay=0)=>{for(const ch of text){await cdp('Input.insertText',{text:ch});if(delay)await new Promise(r=>setTimeout(r,delay));}};
 const read=()=>evaluate('({values:dateInput.fields.map(x=>x.value),active:dateInput.fields.indexOf(document.activeElement),iso:document.querySelector("#due").value,valid:dateInput.fields.every(x=>x.checkValidity())})');
 const key=async(key,code,modifiers=0)=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:key==='Tab'?9:key==='Backspace'?8:key==='Delete'?46:0});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});};
 for(const delay of [0,30]){await resetDate();await type('261022',delay);assert.deepEqual((await read()).values,['26','10','22']);assert.equal((await read()).iso,'2026-10-22');checks.push('six digits via actual key insertion '+(delay?'slow':'fast'));}
 await resetDate();await type('260102');assert.equal((await read()).iso,'2026-01-02');checks.push('leading zeros');
 await resetDate();await type('240229');assert.equal((await read()).iso,'2024-02-29');await resetDate();await type('250229');assert.equal((await read()).iso,'');assert.equal((await read()).valid,false);checks.push('leap year / invalid leap day');
 await resetDate();await type('261');assert.equal((await read()).iso,'');assert.equal((await read()).active,1);checks.push('partial input retains validation');
 await evaluate('dateInput.set("2026-10-22")');await focus('.due-segment',1,1);await key('Backspace','Backspace');assert.equal((await read()).active,0);assert.equal((await read()).values[0],'6');checks.push('delete does not move focus');
 await evaluate('dateInput.set("2026-10-22")');await focus('.due-segment',0,1);await type('3');assert.equal((await read()).values[0],'36');assert.equal((await read()).active,0);checks.push('middle/selection replacement does not jump');
 await focus('.due-segment',0,0);await key('Tab','Tab');assert.equal((await read()).active,1);await key('Tab','Tab',8);assert.equal((await read()).active,0);checks.push('Tab and Shift+Tab navigation');
 const pasteDate=text=>evaluate(`(()=>{const dt=new DataTransfer();dt.setData('text',${JSON.stringify(text)});dateInput.fields[0].dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));})()`);
 for(const [text,iso] of [['261022','2026-10-22'],['2026-10-22','2026-10-22'],['1999-12-31','1999-12-31']]){await pasteDate(text);assert.equal((await read()).iso,iso);}checks.push('paste six digits, ISO and legacy four-digit year');
 await evaluate('document.querySelector("#price").value=""');await focus('#price',0,0);await type('1234567');assert.equal(await evaluate('document.querySelector("#price").value'),'1,234,567');checks.push('live comma grouping');
 await focus('#price',4,4);await key('Backspace','Backspace');assert.equal(await evaluate('document.querySelector("#price").value'),'124,567');assert.equal(await evaluate('document.querySelector("#price").selectionStart'),2);checks.push('middle deletion preserves semantic caret');
 await focus('#price',0,3);await type('98');assert.equal(await evaluate('document.querySelector("#price").value'),'98,567');checks.push('selection replacement');
 await focus('#price',0,100);await type('1234.50');assert.equal(await evaluate('document.querySelector("#price").value'),'1,234.50');assert.equal(await evaluate('QuoteInputs.readPrice(document.querySelector("#price").value)'),1234.5);checks.push('decimal input remains visible');
 await focus('#price',0,100);await key('Backspace','Backspace');assert.equal(await evaluate('document.querySelector("#price").value'),'');await type('0');assert.equal(await evaluate('QuoteInputs.readPrice(document.querySelector("#price").value)'),0);checks.push('empty versus explicit zero');
 await focus('#price',0,100);await cdp('Input.insertText',{text:'1,234,567'});assert.equal(await evaluate('document.querySelector("#price").value'),'1,234,567');checks.push('comma-containing insertion');
 assert.equal(await evaluate('termInput.read()'),'선금 20%, 잔금 검사 후');assert.equal(await evaluate('document.querySelector("#terms").hidden'),false);await evaluate('termInput.set("마감 후 30일")');assert.equal(await evaluate('termInput.read()'),'마감 후 30일');assert.equal(await evaluate('document.querySelector("#terms").hidden'),true);await evaluate('termInput.set("협의된 특별 조건")');assert.equal(await evaluate('termInput.read()'),'협의된 특별 조건');checks.push('preset and custom value loading');
 await evaluate('termInput.select.value="마감 후 55일";termInput.select.dispatchEvent(new Event("change",{bubbles:true}))');assert.equal(await evaluate('termInput.read()'),'마감 후 55일');await evaluate('termInput.select.value=QuoteInputs.terms[0];termInput.select.dispatchEvent(new Event("change",{bubbles:true}))');assert.equal(await evaluate('termInput.read()'),'협의된 특별 조건');checks.push('custom draft survives preset toggle');
 assert.equal(runtimeErrors.length,0);checks.push('zero runtime errors');
 const report={passed:true,browser:version.Browser,scope:'isolated fixture, no application state/data access',checks};fs.mkdirSync(path.join(__dirname,'qa'),{recursive:true});fs.writeFileSync(path.join(__dirname,'qa','quote-inputs-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{if(ws)ws.close();if(target)await fetch('http://127.0.0.1:9223/json/close/'+target.id);await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
