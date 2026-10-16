'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),T=require('./transaction-statement'),Company=require('./company-info');
const {fixture}=require('./qa/schedule-fixture');
function delivered(){const f=fixture();f.send('work',{...f.base,processId:f.self.assignment.processId,documentId:f.self.document.id,hours:1,rate:10,good:5,bad:0});f.send('receive',{...f.base,processId:f.outside.assignment.processId,documentId:f.outside.document.id,quantity:5,actual:50});f.send('inspect',{...f.base,quantity:10,rejected:0});f.send('deliver',{...f.base,quantity:3});f.send('deliver',{...f.base,quantity:4});return f.get().orders[0];}
test('거래명세서: 납품 날짜별·누적 수량, 공급가액과 10% 세액, 공급자/공급받는자',()=>{const o=delivered(),dates=T.deliveryDates(o);assert.equal(dates.length,1);
 const day=T.build(o,{name:'새김솔루션',businessNumber:'000-00-00000'},{date:dates[0]});assert.equal(day.items.length,1);assert.equal(day.items[0].quantity,7);assert.equal(day.items[0].supply,7000);assert.equal(day.items[0].tax,700);assert.equal(day.total,7700);assert.equal(day.customer.name,'허구 일정 고객');
 const all=T.build(o,{},{});assert.equal(all.items[0].quantity,7);assert.equal(all.scope,'all');
 const html=T.render(day);assert.match(html,/거 래 명 세 서/);assert.match(html,/새김솔루션/);assert.match(html,/7,700/);assert.ok(!html.includes('<script'));
 assert.throws(()=>T.build(o,{},{date:'1999-01-01'}),/납품한 기록이 없습니다/);});
test('거래명세서는 납품 전에는 만들지 않고, 글자는 HTML로 해석되지 않음',()=>{const f=fixture();assert.throws(()=>T.build(f.get().orders[0],{},{}),/아직 납품한 기록이 없습니다/);const o=delivered();o.snapshot.items[0].name='<img src=x onerror=alert(1)>';assert.ok(!T.render(T.build(o,{},{})).includes('<img'));});
test('회사 정보: 알려진 칸만 저장하고 길이·형식 검증',()=>{assert.deepEqual(Company.normalize({name:' 새김솔루션 ',unknown:'x',phone:''}),{name:'새김솔루션'});assert.throws(()=>Company.normalize({name:5}),/글자/);assert.throws(()=>Company.normalize({address:'a'.repeat(201)}),/200자/);assert.deepEqual(Company.normalize(null),{});});
test('회사 정보 API 저장·조회와 백업 포함·새 저장소 복원',async()=>{const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{createServer}=require('./server');
 const mk=async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mes-company-'));const s=createServer({dataDir:dir});await new Promise(r=>s.listen(0,'127.0.0.1',r));return {dir,s,url:'http://127.0.0.1:'+s.address().port};};
 const a=await mk(),b=await mk();try{
  const post=(u,r,body)=>fetch(u+r,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.deepEqual((await fetch(a.url+'/api/company').then(r=>r.json())).company,{});
  assert.equal((await post(a.url,'/api/company',{company:{name:'새김솔루션',businessNumber:'123-45-67890'}})).status,200);
  assert.equal((await fetch(a.url+'/api/company').then(r=>r.json())).company.name,'새김솔루션');
  assert.equal((await post(a.url,'/api/company',{company:{name:7}})).status,400);
  // 카탈로그가 있어야 묶음 백업 형식이 됩니다
  await post(a.url,'/api/catalog',{action:'command',command:{key:crypto.randomUUID(),revision:0,type:'materialCreate',payload:{name:'시험 재질'}}});
  const backup=await fetch(a.url+'/api/backup').then(r=>r.json());assert.equal(backup.company.name,'새김솔루션');
  assert.equal((await post(b.url,'/api/restore',{key:crypto.randomUUID(),revision:0,backup})).status,200);
  assert.equal((await fetch(b.url+'/api/company').then(r=>r.json())).company.businessNumber,'123-45-67890');
 }finally{for(const x of [a,b]){x.s.closeAllConnections?.();await new Promise(r=>x.s.close(r));fs.rmSync(x.dir,{recursive:true,force:true});}}});
