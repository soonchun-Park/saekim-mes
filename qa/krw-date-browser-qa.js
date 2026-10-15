'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./browser-harness'),{execute,originalNote}=require('./import-confirmed-krw-prices');
async function main(){const h=await harness(),checks=[],layouts=[];try{
 let revision=0;const create=async name=>(await h.api('/api/catalog',{action:'command',command:{key:crypto.randomUUID(),revision:revision++,type:'materialCreate',payload:{name,kgRate:null,provenance:{kind:'user',note:originalNote,verified:false}}}})).result;
 const al=await create('AL6061'),pvc=await create('CLEAN PVC');
 await h.api('/api/command',{key:crypto.randomUUID(),revision:0,type:'quote',payload:{customer:'허구 재접속 고객',due:'2026-12-31',terms:'허구 조건',items:[{name:'허구 저장 견적',drawing:'QA-A',quantity:1,price:12345}]}});
 await h.open();await h.wait('typeof state!=="undefined" && state?.quotes.length===1 && document.querySelectorAll("[data-f=master] option").length>=3');
 await h.cdp('Page.reload',{ignoreCache:true});await h.wait('typeof state!=="undefined" && state?.quotes.length===1 && document.querySelectorAll("[data-f=master] option").length>=3');checks.push('브라우저 재접속 후 저장 견적 조회');
 await h.run(`MESNavigation.navigate('quotes');var select=document.querySelector('[data-f=master]');select.value=${JSON.stringify(al.id)};select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-f=name]').value='허구 미저장 입력 보존';var rate=document.querySelector('[data-f=kgRate]');rate.value='7,777';rate.dispatchEvent(new Event('input',{bubbles:true}));`);
 const result=await execute(h.base,path.join(h.dir,'import.json'));assert.equal(result.journal.imported,2);
 await h.run("document.querySelector('.catalog-refresh').click()");await h.wait("document.querySelector('.catalog-candidate-status').textContent.includes('자동 변경하지 않았습니다')");assert.equal(await h.run("document.querySelector('[data-f=kgRate]').value"),'7,777');assert.equal(await h.run("document.querySelector('[data-f=name]').value"),'허구 미저장 입력 보존');checks.push('단가 반영·후보 새로 조회 시 작성 중 사용자 금액과 입력 보존');
 for(const [m,expected]of [[pvc,'5,000'],[al,'6,500']]){await h.run(`var s=document.querySelector('[data-f=master]');s.value=${JSON.stringify(m.id)};s.dispatchEvent(new Event('change',{bubbles:true}));`);assert.equal(await h.run("document.querySelector('[data-f=kgRate]').value"),expected);}checks.push('첨부 CLEAN PVC 5000원/kg·AL6061 6500원/kg 선택 자동 입력');
 assert.equal(await h.run("document.querySelector('[data-f=density]').value"),'2.7');checks.push('가격 반영 후 기존 공식 AL6061 밀도 유지');
 // 견적일자·납기요청일은 브라우저 달력(연도-월-일) 입력입니다(2026-10-16 사용자 요청).
 const due=await h.run("(()=>{const d=document.getElementById('due'),api=QuoteInputs.mountDate(d);api.set('261022');const a=d.value;api.set('2024-02-29');const b=d.value;let bad='';try{api.set('250229')}catch(e){bad=e.message}d.value='';let empty='';try{api.read()}catch(e){empty=e.message}return {type:d.type,a,b,bad,empty}})()");
 assert.equal(due.type,'date');assert.equal(due.a,'2026-10-22');assert.equal(due.b,'2024-02-29');assert.match(due.bad,/유효한 납기요청일/);assert.match(due.empty,/납기요청일 연·월·일/);checks.push('납기요청일 달력 입력: YYMMDD 붙여넣기 변환·윤년·빈값 검증');
 for(const width of [1365,1024,768,390,320]){
  await h.cdp('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<700});
  const layout=await h.run("(()=>{const d=document.getElementById('due');d.scrollIntoView({block:'center'});const r=d.getBoundingClientRect(),l=d.closest('label').getBoundingClientRect();return {width:r.width,right:r.right,labelRight:l.right,page:document.documentElement.scrollWidth,view:innerWidth}})()");layouts.push({width,...layout});
  assert.ok(layout.width>=120&&layout.right<=layout.labelRight+1,'date overflow '+width);assert.ok(layout.page<=layout.view+1,'page overflow '+width);
 }
 checks.push('1365·1024·768·390·320px: 날짜 칸 넘침 없음');
 assert.equal(h.errors.length,0);const report={passed:true,checks,layouts,isolatedFictionalData:true,actualUserViewportVerified:false,actualViewportBlock:'MXC launcher HRESULT 0x80070003',liveUserTabsReloaded:false,runtimeExceptions:0};fs.writeFileSync(path.join(__dirname,'reports/krw-date-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await h.close();assert.ok(path.resolve(h.dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(h.dir,{recursive:true,force:true});}}
main().catch(e=>{console.error(e);process.exitCode=1;});
