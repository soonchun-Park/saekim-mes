'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {harness}=require('./browser-harness'),{fixture}=require('./monthly-settlement-fixture');
const screens=['dashboard','quotes','orders','settlements','materials','parties','inspections'];
const checks=[],measurements=[];let active,report;
async function screenshot(h,name){const s=await h.cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'reports/alignment-'+name+'.png'),Buffer.from(s.data,'base64'));}
async function ready(h){await h.open();await h.wait("typeof state!=='undefined'&&state&&document.querySelector('.party-create')&&document.querySelector('.settlement-period-select')");}
async function navigate(h,screen){await h.run(`MESNavigation.navigate(${JSON.stringify(screen)})`);if(screen==='settlements')await h.wait("document.getElementById('settlementManager').getAttribute('aria-busy')==='false'");}
async function size(h,width,height){await h.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});}
async function main(){try{
 active=await harness();await ready(active);const emptyBefore=await active.api('/api/backup');
 for(const [width,height] of [[1920,1200],[1440,1100],[1024,768],[700,900],[390,844]]){
  await size(active,width,height);
  for(const screen of screens){await navigate(active,screen);const m=await active.run(`(()=>{const main=document.querySelector('main').getBoundingClientRect(),layout=document.querySelector('.layout').getBoundingClientRect(),aside=document.querySelector('aside').getBoundingClientRect();return {screen:${JSON.stringify(screen)},width:innerWidth,top:main.top,expectedTop:innerWidth<=700?aside.bottom:layout.top,left:main.left,right:main.right,asideRight:aside.right,overflow:document.documentElement.scrollWidth>innerWidth+1,scrollY}})()`);
   assert.ok(Math.abs(m.top-m.expectedTop)<1,JSON.stringify(m));assert.equal(m.overflow,false,screen+' '+width+' horizontal overflow');assert.equal(m.scrollY,0);if(width>1636){const contentWidth=await active.run('document.documentElement.clientWidth');assert.ok(Math.abs((m.left-m.asideRight)-(contentWidth-m.right))<1,'Horizontal centering preserved');}measurements.push(m);
  }
 }
 checks.push('빈 자료의 7개 주요 화면 × 5개 크기: 본문 상단 일치, 가로 넘침 없음, 메뉴 이동 시 상단 스크롤');
 await size(active,1440,1100);await navigate(active,'parties');await screenshot(active,'desktop');
 assert.deepEqual(await active.api('/api/backup'),emptyBefore);assert.deepEqual(active.errors,[]);await active.close();active=null;
 const f=fixture();active=await harness({seed:dir=>{fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(f.state));fs.writeFileSync(path.join(dir,'material-catalog.json'),JSON.stringify(f.catalog));}});await ready(active);const before=await active.api('/api/backup');
 await size(active,1440,1400);await navigate(active,'quotes');
 await active.run("document.getElementById('customer').value='가상 미저장 거래처';document.querySelector('[data-f=name]').value='가상 미저장 품목';");
 const styles=await active.run("({number:getComputedStyle(document.querySelector('[data-f=quantity]')).textAlign,date:getComputedStyle(document.querySelector('#due')).textAlign,header:getComputedStyle(document.querySelector('header')).alignItems,button:getComputedStyle(document.querySelector('[data-bulk-kind=quote]')).alignItems})");
 assert.equal(styles.number,'right');assert.equal(styles.date,'start');assert.equal(styles.header,'center');checks.push('수량 우측·날짜 가운데·헤더/버튼 내부 정렬 유지');
 // Unequal content in an existing form row must still start together.
 const grid=await active.run("(()=>{const g=document.querySelector('.item .grid'),children=[...g.children].filter(c=>c.tagName==='LABEL');const c=children[0],note=document.createElement('p');note.textContent='가상 긴 안내 문구 '.repeat(30);c.append(note);const row=children.slice(0,2).map(e=>({top:e.getBoundingClientRect().top,inputTop:e.querySelector('input,select')?.getBoundingClientRect().top}));return row})()");
 assert.equal(grid.length,2);assert.ok(Math.abs(grid[0].top-grid[1].top)<1);assert.ok(Math.abs(grid[0].inputTop-grid[1].inputTop)<1);checks.push('길이가 다른 견적 입력 컬럼의 시작 위치 상단 일치');
 await navigate(active,'parties');await active.run("document.querySelector('.party-create').click()");await active.wait("document.querySelector('.party-dialog').open");
 const modal=()=>active.run("(()=>{const d=document.querySelector('.party-dialog'),r=d.getBoundingClientRect();return {top:r.top,left:r.left,width:r.width,height:r.height,center:r.top+r.height/2,viewport:innerHeight,overflow:getComputedStyle(d).overflowY}})()");
 const afterModal=await modal();await active.run("document.querySelector('main').style.setProperty('margin','auto','important');document.querySelector('main').style.setProperty('align-self','auto','important');");const oldModal=await modal();assert.deepEqual(afterModal,oldModal);assert.ok(Math.abs(afterModal.center-afterModal.viewport/2)<1);await active.run("document.querySelector('main').style.removeProperty('margin');document.querySelector('main').style.removeProperty('align-self');document.querySelector('.party-editor-close').click()");checks.push('거래처 팝업은 수정 전후 위치·크기가 같고 세로 가운데 배치 유지');
 await navigate(active,'quotes');assert.equal(await active.run("document.getElementById('customer').value"),'가상 미저장 거래처');assert.equal(await active.run("document.querySelector('[data-f=name]').value"),'가상 미저장 품목');checks.push('메뉴 이동·팝업 취소 후 견적 미저장 입력 보존');
 for(const [width,height]of [[1440,1000],[390,844]]){
  await size(active,width,height);await navigate(active,'quotes');await active.run("document.getElementById('quotes').scrollIntoView({block:'start'})");assert.ok(await active.run('scrollY>0'));assert.equal(await active.run("document.documentElement.scrollWidth<=innerWidth+1"),true);assert.equal(await active.run("getComputedStyle(document.querySelector('.quote-table .number')).textAlign"),'right');
  if(width===390){assert.equal(await active.run("document.querySelector('.quote-table-scroll').scrollWidth>document.querySelector('.quote-table-scroll').clientWidth"),true);await active.run("document.querySelector('.quote-table-scroll').scrollLeft=120");assert.ok(await active.run("document.querySelector('.quote-table-scroll').scrollLeft>0"));}
  await active.run("document.querySelector('.quote-detail-open').click()");await active.wait("document.querySelector('.quote-detail-dialog')?.open");assert.equal(await active.run("document.documentElement.scrollWidth<=innerWidth+1"),true);const d=await active.run("(()=>{const e=document.querySelector('.quote-detail-dialog'),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight}})()");assert.ok(d.top>=0&&d.bottom<=d.viewport+1);assert.ok(Math.abs(d.top+d.height/2-d.viewport/2)<1);if(width===390)await screenshot(active,'mobile-dialog');await active.run("document.querySelector('.quote-detail-close').click()");
  await navigate(active,'settlements');await active.run("document.querySelector('.settlement-year').value='2027';document.querySelector('.settlement-month').value='01';document.querySelector('.settlement-period-select').value='month';document.querySelector('.settlement-period-select').dispatchEvent(new Event('change',{bubbles:true}))");await active.wait("document.querySelector('.settlement-period-title').textContent.includes('2027-01')&&document.getElementById('settlementManager').getAttribute('aria-busy')==='false'");assert.equal(await active.run("document.documentElement.scrollWidth<=innerWidth+1"),true);if(width===390)await screenshot(active,'mobile');
 }
 checks.push('견적·정산의 긴 내용 스크롤, 모바일 표 가로 스크롤/줄바꿈, 견적 상세 팝업 위치 유지');
 assert.deepEqual(await active.api('/api/backup'),before);assert.deepEqual(active.errors,[]);checks.push('가상 자료 조회·탐색·취소 동안 저장 0건, 브라우저 실행 오류 0건');
 report={passed:true,checks,measurements,userDataTouched:false,userTabsTouched:false,runtimeErrors:0,at:new Date().toISOString()};
 }catch(e){report={passed:false,checks,measurements,error:e.stack};throw e;}finally{fs.writeFileSync(path.join(__dirname,'reports/alignment-browser.json'),JSON.stringify(report,null,2));if(active)await active.close();}console.log(JSON.stringify({passed:report.passed,checks:report.checks,screenSizes:measurements.length}));}
main().catch(e=>{console.error(e);process.exitCode=1;});
