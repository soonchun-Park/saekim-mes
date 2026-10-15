'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./browser-harness'),{execute,originalNote}=require('./import-confirmed-krw-prices');
async function main(){const h=await harness(),checks=[],layouts=[];try{
 let revision=0;const create=async name=>(await h.api('/api/catalog',{action:'command',command:{key:crypto.randomUUID(),revision:revision++,type:'materialCreate',payload:{name,kgRate:null,provenance:{kind:'user',note:originalNote,verified:false}}}})).result;
 const al=await create('AL6061'),pvc=await create('CLEAN PVC');
 await h.api('/api/command',{key:crypto.randomUUID(),revision:0,type:'quote',payload:{customer:'허구 재접속 고객',due:'2026-12-31',terms:'허구 조건',items:[{name:'허구 저장 견적',drawing:'QA-A',quantity:1,price:12345}]}});
 await h.open();await h.wait('typeof state!=="undefined" && state?.quotes.length===1 && document.querySelectorAll("[data-f=master] option").length>=3');
 await h.cdp('Page.reload',{ignoreCache:true});await h.wait('typeof state!=="undefined" && state?.quotes.length===1 && document.querySelectorAll("[data-f=master] option").length>=3');checks.push('브라우저 재접속 후 저장 견적 조회');
 await h.run(`MESNavigation.navigate('quotes');var select=document.querySelector('[data-f=master]');select.value=${JSON.stringify(al.id)};select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-f=name]').value='허구 미저장 입력 보존';var rate=document.querySelector('[data-f=kgRate]');rate.value='7777';rate.dispatchEvent(new Event('input',{bubbles:true}));`);
 const result=await execute(h.base,path.join(h.dir,'import.json'));assert.equal(result.journal.imported,2);
 await h.run("document.querySelector('.catalog-refresh').click()");await h.wait("document.querySelector('.catalog-candidate-status').textContent.includes('자동 변경하지 않았습니다')");assert.equal(await h.run("document.querySelector('[data-f=kgRate]').value"),'7777');assert.equal(await h.run("document.querySelector('[data-f=name]').value"),'허구 미저장 입력 보존');checks.push('단가 반영·후보 새로 조회 시 작성 중 사용자 금액과 입력 보존');
 for(const [m,expected]of [[pvc,'5000'],[al,'6500']]){await h.run(`var s=document.querySelector('[data-f=master]');s.value=${JSON.stringify(m.id)};s.dispatchEvent(new Event('change',{bubbles:true}));`);assert.equal(await h.run("document.querySelector('[data-f=kgRate]').value"),expected);}checks.push('첨부 CLEAN PVC 5000원/kg·AL6061 6500원/kg 선택 자동 입력');
 assert.equal(await h.run("document.querySelector('[data-f=density]').value"),'2.7');checks.push('가격 반영 후 기존 공식 AL6061 밀도 유지');
 const reset=()=>h.run("var df=document.getElementById('due')._quoteDate.fields;df.forEach(x=>{x.value='';x.maxLength=2});df[0].focus();df[0].dispatchEvent(new Event('input',{bubbles:true}));");
 const type=async text=>{for(const ch of text)await h.cdp('Input.insertText',{text:ch});};
 const read=()=>h.run("({values:document.getElementById('due')._quoteDate.fields.map(x=>x.value),active:document.getElementById('due')._quoteDate.fields.indexOf(document.activeElement),iso:document.getElementById('due').value,valid:document.getElementById('due')._quoteDate.fields.every(x=>x.checkValidity())})");
 await reset();await type('261022');assert.deepEqual((await read()).values,['26','10','22']);assert.equal((await read()).iso,'2026-10-22');assert.equal((await read()).active,2);checks.push('실제 키 입력 두 자리 자동 이동·ISO 날짜 저장값');
 await h.run("var f=document.getElementById('due')._quoteDate.fields[0];f.focus();f.setSelectionRange(0,1)");await type('3');assert.equal((await read()).active,0);assert.equal((await read()).values[0],'36');checks.push('중간 숫자 교체 시 커서가 다음 칸으로 이동하지 않음');
 await reset();await type('250229');assert.equal((await read()).iso,'');assert.equal((await read()).valid,false);await reset();await type('240229');assert.equal((await read()).iso,'2024-02-29');checks.push('윤년·존재하지 않는 날짜 검증 유지');
 for(const width of [1365,1024,768,390,320]){
  await h.cdp('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<700});
  await h.run("document.querySelector('.due-segments').scrollIntoView({block:'center'})");
  const layout=await h.run("(()=>{const wrap=document.querySelector('.due-segments'),rect=wrap.getBoundingClientRect(),inputs=[...wrap.querySelectorAll('input')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,label:e.getAttribute('aria-label')}});return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,wrap:{x:rect.x,width:rect.width,right:rect.right},inputs,iso:document.getElementById('due').value}})()");
  assert.ok(layout.inputs.every(r=>Math.abs(r.y-layout.inputs[0].y)<1),'inputs wrapped '+width);assert.ok(layout.inputs.every(r=>r.width>=22&&r.right<=layout.wrap.right+1),'input overflow '+width);assert.ok(layout.scrollWidth<=layout.viewport+1,'document overflow '+width);assert.equal(layout.iso,'2024-02-29');assert.deepEqual(layout.inputs.map(i=>i.label),['연 YY','월 MM','일 DD']);layouts.push(layout);
  if([1365,390,320].includes(width)){const shot=await h.cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'krw-due-'+width+'.png'),Buffer.from(shot.data,'base64'));}
 }
 checks.push('1365·1024·768·390·320px: 연/월/일 한 줄·레이블 유지·가로 넘침 없음');
 await h.run("document.querySelector('.due-segments').style.width='170px'");const narrow=await h.run("[...document.querySelectorAll('.due-segment')].map(e=>({y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width}))");assert.ok(narrow.every(r=>r.y===narrow[0].y&&r.width>=22));checks.push('170px 입력 영역에서도 세 칸 한 줄 유지');
 assert.equal(h.errors.length,0);const report={passed:true,checks,layouts,isolatedFictionalData:true,actualUserViewportVerified:false,actualViewportBlock:'MXC launcher HRESULT 0x80070003',liveUserTabsReloaded:false,runtimeExceptions:0};fs.writeFileSync(path.join(__dirname,'reports/krw-date-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await h.close();assert.ok(path.resolve(h.dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(h.dir,{recursive:true,force:true});}}
main().catch(e=>{console.error(e);process.exitCode=1;});
