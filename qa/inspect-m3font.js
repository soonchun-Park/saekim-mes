'use strict';
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const target=await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>(await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;
 try{await cdp('Page.enable');await cdp('DOM.enable');await cdp('CSS.enable');await cdp('Page.navigate',{url:'https://www.m3pn.com/main/'});
 for(let i=0;i<50;i++){if(await run("document.readyState==='complete'"))break;await new Promise(r=>setTimeout(r,300));}
 await run('document.fonts.ready.then(()=>true)');
 const sample=await run(`(()=>{const cssPath=e=>{const p=[];while(e&&e.nodeType===1){if(e.id){p.unshift('#'+CSS.escape(e.id));break;}let n=1;for(let a=e.previousElementSibling;a;a=a.previousElementSibling)if(a.tagName===e.tagName)n++;p.unshift(e.tagName.toLowerCase()+':nth-of-type('+n+')');e=e.parentElement;}return p.join('>');};return [...document.querySelectorAll('h1,h2,h3,p,strong,a,dt,dd')].filter(e=>e.children.length===0&&e.textContent.trim()&&e.getBoundingClientRect().height>0).slice(0,100).map(e=>{const s=getComputedStyle(e);return {selector:cssPath(e),text:e.textContent.trim().slice(0,70),family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing};});})()`);
 const {root}=await cdp('DOM.getDocument');for(const s of sample){const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector:s.selector});if(nodeId)s.renderedFonts=(await cdp('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
 const css=await run(`(()=>{const rules=[];for(const s of document.styleSheets){try{for(const r of s.cssRules){if(r.cssText.includes('font-family')||r.type===CSSRule.IMPORT_RULE)rules.push({sheet:s.href,rule:r.cssText});}}catch{}}return rules;})()`);
 const result={url:'https://www.m3pn.com/main/',browser:await cdp('Browser.getVersion'),samples:sample,fontRules:css,fontFaces:await run('[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status}))'),resources:await run("performance.getEntriesByType('resource').filter(e=>/woff|\.css|\.ttf|\.otf/.test(e.name)).map(e=>e.name)"),at:new Date().toISOString()};
 fs.writeFileSync(path.join(__dirname,'reports/m3pn-font-inspection.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{ws.close();await fetch('http://127.0.0.1:9223/json/close/'+target.id);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
