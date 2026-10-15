'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {empty,apply,cost,summary,pricing,validateState,restoreState}=require('./core');
let seq=0;const id=()=>String(++seq),copy=x=>JSON.parse(JSON.stringify(x));
const material={shape:'plate',dimensions:{length:100,width:100,height:10},density:7.85,kgRate:2000,hours:2,hourRate:15000};
test('Fix regression: cancel empty bottleneck releases stock once and preserves replay',()=>{const h=setup(),b=base(h);h.run('process',{...b,name:'자체',mode:'자체',estimated:500});h.run('process',{...b,name:'빈 외주',mode:'외주',estimated:100});const [own,external]=h.s.orders[0].lines[0].processes;h.run('work',{...b,processId:own.id,hours:1,rate:100,good:5,bad:0});assert.equal(h.s.orders[0].lines[0].stockProduced,0);const cmd=h.run('cancelProcess',{...b,processId:external.id});const l=h.s.orders[0].lines[0];assert.equal(l.stockProduced,5);assert.equal(l.inventory['수입검사'],5);assert.deepEqual(apply(h.s,cmd,id),h.s);const before=copy(h.s);assert.throws(()=>h.run('cancelProcess',{...b,processId:external.id}),/진행\/취소/);assert.deepEqual(h.s,before);validateState(h.s);});
test('Fix regression: remaining empty bottleneck prevents early or duplicate stock',()=>{const h=setup(),b=base(h);for(const [name,mode] of [['자체','자체'],['외주1','외주'],['외주2','외주']])h.run('process',{...b,name,mode,estimated:0});const [own,a,z]=h.s.orders[0].lines[0].processes;h.run('work',{...b,processId:own.id,hours:1,rate:100,good:5,bad:0});h.run('cancelProcess',{...b,processId:a.id});assert.equal(h.s.orders[0].lines[0].inventory['수입검사'],0);h.run('cancelProcess',{...b,processId:z.id});assert.equal(h.s.orders[0].lines[0].inventory['수입검사'],5);h.run('inspect',{...b,quantity:5,rejected:0});assert.equal(h.s.orders[0].lines[0].inventory['완제품'],5);});
test('Fix regression: recorded internal time, defects and outsource receipt remain protected',()=>{for(const mode of ['time','bad','receipt']){const h=setup(),b=base(h);h.run('process',{...b,name:'진행 공정',mode:mode==='receipt'?'외주':'자체',estimated:0});const pid=h.s.orders[0].lines[0].processes[0].id;if(mode==='receipt')h.run('receive',{...b,processId:pid,quantity:1,actual:0});else h.run('work',{...b,processId:pid,hours:1,rate:100,good:0,bad:mode==='bad'?1:0});const before=copy(h.s);assert.throws(()=>h.run('cancelProcess',{...b,processId:pid}),/진행\/취소/);assert.deepEqual(h.s,before);}});
test('Fix regression: unused-only process cancellation keeps zero inventory and existing estimate policy',()=>{const h=setup(),b=base(h);h.run('process',{...b,name:'미진행',mode:'외주',estimated:500});const pid=h.s.orders[0].lines[0].processes[0].id;h.run('cancelProcess',{...b,processId:pid});assert.equal(h.s.orders[0].lines[0].stockProduced,0);assert.equal(summary(h.s.orders[0]).processingEstimated,0);validateState(h.s);});
function supplyFixture(){const h=harness();h.run('quote',{customer:'허구 공급구분',due:'2026-11-01',terms:'시험',items:[{name:'사급',drawing:'A',quantity:2,price:1000,material:{...material,supply:'customer'}},{name:'도급',drawing:'B',quantity:2,price:1000,material:{...material,supply:'contract'}}]});h.run('convert',{id:h.s.quotes[0].id});return h;}
test('Fix regression: customer actual material rejected; contract cost and internal machining retained',()=>{const h=supplyFixture(),before=copy(h.s);assert.throws(()=>h.run('materialActual',{...base(h),kg:1,kgRate:1200,note:'사급'}),/사급/);assert.deepEqual(h.s,before);h.run('materialActual',{...base(h,1),kg:2,kgRate:1500,note:'도급'});h.run('process',{...base(h),name:'사급 자체가공',mode:'자체',estimated:500});h.run('work',{...base(h),processId:h.s.orders[0].lines[0].processes[0].id,hours:2,rate:300,good:1,bad:0});assert.equal(summary(h.s.orders[0]).materialActual,3000);assert.equal(summary(h.s.orders[0]).actual,3600);assert.equal(h.s.orders[0].snapshot.items[0].estimate.materialExcluded,true);assert.equal(summary(h.s.orders[0]).materialEstimated,material.dimensions.length*material.dimensions.width*material.dimensions.height*material.density/1e6*material.kgRate*2);});
test('Fix regression: historical customer material records survive backup but are excluded from actual total',()=>{const h=supplyFixture(),historical=copy(h.s);historical.orders[0].lines[0].materialActual.push({id:id(),kg:1,kgRate:1200,amount:1200,note:'허구 과거 사급 기록'});historical.orders[0].lines[1].materialActual.push({id:id(),kg:1,kgRate:900,amount:900,note:'허구 도급 기록'});validateState(historical);assert.equal(summary(historical.orders[0]).materialActual,900);const restored=restoreState(h.s,historical,h.s.revision,id);assert.deepEqual(restored.orders[0].lines[0].materialActual,historical.orders[0].lines[0].materialActual);assert.equal(summary(restored.orders[0]).actual,900);});
test('Fix regression: legacy unspecified supply remains contract and invalid actual fields stay rejected',()=>{const h=harness();h.run('quote',{customer:'허구 과거',due:'2026-11-01',terms:'시험',items:[{name:'과거 도급',drawing:'R',quantity:2,price:1000,material}]});h.run('convert',{id:h.s.quotes[0].id});for(const invalid of [{kg:0},{kgRate:0},{note:''}]){const before=copy(h.s);assert.throws(()=>h.run('materialActual',{...base(h),kg:1,kgRate:1200,note:'정상',...invalid}));assert.deepEqual(h.s,before);}h.run('materialActual',{...base(h),kg:1,kgRate:1200,note:'정상'});assert.equal(summary(h.s.orders[0]).materialActual,1200);});
function harness(){let s=empty();return {get s(){return s},run(type,payload,key=id()){const cmd={key,revision:s.revision,type,payload};s=apply(s,cmd,id);return cmd;}};}
function setup(){const h=harness();h.run('quote',{customer:'허구',due:'2026-11-01',terms:'30일',items:[{name:'A',drawing:'R1',quantity:10,price:100},{name:'B',drawing:'R2',quantity:2,price:200}]});h.run('convert',{id:h.s.quotes[0].id});return h;}
function base(h,index=0){return {orderId:h.s.orders[0].id,lineId:h.s.orders[0].lines[index].id};}
function ready(h,index=0){const b=base(h,index);h.run('process',{...b,name:'밀링',mode:'자체',estimated:500});return {...b,processId:h.s.orders[0].lines[index].processes[0].id};}
test('견적→복수품목→자체/외주 분할입고→부분검사/납품→청구배분 완료',()=>{
 const h=setup(),b=base(h);h.run('process',{...b,name:'밀링',mode:'자체',estimated:500});h.run('process',{...b,name:'도금',mode:'외주',estimated:100});const ps=h.s.orders[0].lines[0].processes;
 h.run('work',{...b,processId:ps[0].id,hours:2,rate:120,good:10,bad:0});assert.equal(h.s.orders[0].lines[0].inventory['수입검사'],0);
 h.run('receive',{...b,processId:ps[1].id,quantity:4,actual:40});h.run('inspect',{...b,quantity:4,rejected:0});assert.throws(()=>h.run('deliver',{...b,quantity:5}),/초과/);
 h.run('deliver',{...b,quantity:4});h.run('invoice',{orderId:b.orderId,amount:400});const inv=h.s.orders[0].invoices[0].id;h.run('payment',{orderId:b.orderId,date:'2026-11-02',allocations:[{invoiceId:inv,amount:150}]});
 assert.equal(summary(h.s.orders[0]).balance,250);assert.equal(summary(h.s.orders[0]).complete,false);assert.equal(summary(h.s.orders[0]).deliveryProgress,4/12);
 h.run('receive',{...b,processId:ps[1].id,quantity:6,actual:60});h.run('inspect',{...b,quantity:6,rejected:0});h.run('deliver',{...b,quantity:6});
 const bb=ready(h,1);h.run('work',{...bb,hours:1,rate:30,good:2,bad:0});h.run('inspect',{...bb,quantity:2,rejected:0});h.run('deliver',{...bb,quantity:2});h.run('invoice',{orderId:b.orderId,amount:1000});const inv2=h.s.orders[0].invoices[1].id;
 h.run('payment',{orderId:b.orderId,date:'2026-11-03',allocations:[{invoiceId:inv,amount:250},{invoiceId:inv2,amount:1000}]});
 const sum=summary(h.s.orders[0]);assert.equal(sum.complete,true);assert.equal(sum.actual,370);assert.equal(sum.paymentProgress,1);assert.equal(h.s.orders[0].snapshot.items[0].drawing,'R1');validateState(h.s);
});
test('원가 3형상과 가격 추천/합의 분리',()=>{
 assert.equal(cost(material).kg,.785);assert.equal(cost(material).total,31570);
 const bar={...material,shape:'bar',dimensions:{length:100,diameter:20}};assert.ok(Math.abs(cost(bar).kg-Math.PI*.0785)<1e-10);
 assert.ok(cost({...bar,shape:'tube',dimensions:{length:100,diameter:20,innerDiameter:10}}).kg<cost(bar).kg);
 assert.equal(pricing(100,.2,'markup'),120);assert.equal(pricing(100,.2,'margin'),125);assert.throws(()=>pricing(100,1,'margin'));
 const h=harness();h.run('quote',{customer:'허구',due:'2026-11-01',terms:'선금',items:[{name:'A',drawing:'R1',quantity:10,price:50000,material,pricing:{mode:'margin',rate:.2,multiplier:1.1}}]});const i=h.s.quotes[0].items[0];assert.equal(i.price,50000);assert.equal(i.recommendedPrice,Math.ceil(31570/.8*1.1));h.run('convert',{id:h.s.quotes[0].id});const b=base(h);h.run('materialActual',{...b,kg:2,kgRate:3000,note:'허구 소재 사용'});assert.equal(summary(h.s.orders[0]).actual,6000);assert.equal(summary(h.s.orders[0]).materialEstimated,15700);
});
for(const [name,m] of [['누락단가',{...material,kgRate:null}],['잘못된 관',{...material,shape:'tube',dimensions:{length:100,diameter:10,innerDiameter:10}}],['NaN',{...material,density:NaN}],['음수',{...material,hours:-1}]]){
 test('원가 거절 '+name,()=>assert.throws(()=>cost(m)));
}
test('중복클릭/동일키 내용변경/stale revision/프로토타입 키',()=>{
 const h=setup(),s=h.s,b=base(h),cmd={key:'same',revision:s.revision,type:'process',payload:{...b,name:'A',mode:'자체',estimated:1}},n=apply(s,cmd,id);
 assert.deepEqual(apply(n,cmd,id),n);assert.throws(()=>apply(n,{...cmd,payload:{...cmd.payload,name:'B'}},id),/재사용/);assert.throws(()=>apply(n,{...cmd,key:'new'},id),/새로고침/);assert.equal(s.revision,h.s.revision);
 const p=apply(s,{...cmd,key:'__proto__'},id);assert.ok(Object.hasOwn(p.keys,'__proto__'));assert.equal(p.revision,s.revision+1);
});
test('견적버전 스냅샷/최신만 수주/취소',()=>{
 const h=harness();h.run('quote',{customer:'A',due:'2026-11-01',terms:'선금',items:[{name:'A',drawing:'R1',quantity:1,price:100}]});const old=h.s.quotes[0].id;
 h.run('quoteVersion',{id:old,due:'2026-11-05',terms:'후불',items:[{name:'A',drawing:'R2',quantity:1,price:200}]});assert.throws(()=>h.run('convert',{id:old}),/최신/);const next=h.s.quotes[1];h.run('convert',{id:next.id});assert.equal(h.s.orders[0].snapshot.items[0].drawing,'R2');assert.equal(h.s.quotes[0].items[0].price,100);assert.throws(()=>h.run('quoteCancel',{id:next.id,reason:'변경'}),/수주/);
 h.run('orderCancel',require('./qa/cancellation-fixture').payload(h.s.orders[0]));assert.equal(summary(h.s.orders[0]).complete,false);assert.throws(()=>h.run('invoice',{orderId:h.s.orders[0].id,amount:1}),/활성/);
});
test('재고이동/불량/출하 검사강제/재고보존',()=>{
 const h=setup(),b=ready(h);h.run('work',{...b,hours:1,rate:10,good:8,bad:2});
 h.run('stockMove',{...b,from:'수입검사',to:'재고',quantity:3,reason:'시험 보관'});assert.throws(()=>h.run('inspect',{...b,quantity:6,rejected:0}),/초과/);
 h.run('stockMove',{...b,from:'재고',to:'라인투입',quantity:3,reason:'이동'});h.run('stockMove',{...b,from:'라인투입',to:'수입검사',quantity:3,reason:'검사 재개'});h.run('inspect',{...b,quantity:8,rejected:2});const l=h.s.orders[0].lines[0];assert.equal(l.inventory['완제품'],6);assert.equal(l.inventory['반품'],2);assert.throws(()=>h.run('deliver',{...b,quantity:7}),/초과/);h.run('deliver',{...b,quantity:6});assert.equal(h.s.orders[0].lines[0].inventory['완제품'],0);validateState(h.s);
});
test('취소외주 원가제외 및 진행 공정취소/추가금지',()=>{
 const h=setup(),b=base(h);h.run('process',{...b,name:'외주',mode:'외주',estimated:999});const p=h.s.orders[0].lines[0].processes[0].id;h.run('cancelProcess',{...b,processId:p});assert.equal(summary(h.s.orders[0]).estimated,0);assert.throws(()=>h.run('receive',{...b,processId:p,quantity:1,actual:1}),/없음/);const work=ready(h);const last=h.s.orders[0].lines[0].processes.at(-1).id;h.run('work',{...work,processId:last,hours:1,rate:10,good:0,bad:0});assert.throws(()=>h.run('cancelProcess',{...work,processId:last}),/불가/);assert.throws(()=>h.run('process',{...b,name:'추가',mode:'외주',estimated:10}),/추가 불가/);assert.throws(()=>h.run('orderCancel',{orderId:b.orderId,reason:'취소'}),/영향 내역/);
});
for(const quantity of [-1,1.5,Infinity,null,11]){
 test('수량 경계 '+quantity,()=>{const h=setup(),b=ready(h),before=copy(h.s);assert.throws(()=>h.run('work',{...b,hours:1,rate:1,good:quantity,bad:0}));assert.deepEqual(h.s,before);});
}
test('수량0 입고 거절/산출0 준비작업시간 허용',()=>{const h=setup(),b=ready(h);h.run('work',{...b,hours:1,rate:10,good:0,bad:0});assert.equal(summary(h.s.orders[0]).actual,10);assert.equal(h.s.orders[0].lines[0].stockProduced,0);assert.throws(()=>h.run('inspect',{...b,quantity:0,rejected:0}),/수량/);});
test('부분입금 중복배분/초과청구/잘못된 날짜',()=>{
 const h=setup(),b=ready(h);h.run('work',{...b,hours:1,rate:1,good:10,bad:0});h.run('inspect',{...b,quantity:10,rejected:0});h.run('deliver',{...b,quantity:4});assert.throws(()=>h.run('invoice',{orderId:b.orderId,amount:401}),/초과/);h.run('invoice',{orderId:b.orderId,amount:400});const inv=h.s.orders[0].invoices[0].id;
 assert.throws(()=>h.run('payment',{orderId:b.orderId,date:'2026-02-30',allocations:[{invoiceId:inv,amount:1}]}),/날짜/);
 assert.throws(()=>h.run('payment',{orderId:b.orderId,date:'2026-11-01',allocations:[{invoiceId:inv,amount:250},{invoiceId:inv,amount:200}]}),/초과/);
 h.run('payment',{orderId:b.orderId,date:'2026-11-01',allocations:[{invoiceId:inv,amount:200}]});assert.equal(summary(h.s.orders[0]).balance,200);assert.equal(summary(h.s.orders[0]).complete,false);
});
test('백업 불변량 위변조 거절/복원 전후 감사·요청키 유지',()=>{
 const h=setup(),backup=copy(h.s),b=ready(h);h.run('work',{...b,hours:1,rate:1,good:1,bad:0});const n=restoreState(h.s,backup,h.s.revision,id);assert.equal(n.revision,h.s.revision+1);assert.equal(n.orders[0].lines[0].processes.length,0);assert.equal(n.audit.at(-1).type,'restore');assert.ok(Object.keys(n.keys).length>=Object.keys(h.s.keys).length);
 const forged=copy(h.s);forged.orders[0].lines[0].inventory['완제품']=100;assert.throws(()=>validateState(forged),/재고/);forged.orders[0].lines[0].inventory['완제품']=0;forged.orders[0].snapshot.items[0].price=3;assert.throws(()=>validateState(forged),/스냅샷/);assert.throws(()=>restoreState(h.s,backup,0,id),/충돌/);
});
test('기능 회귀: 견적분기/과대소재비/복원된명령/가공추정',()=>{
 const h=harness();h.run('quote',{customer:'A',due:'2026-11-01',terms:'30일',items:[{name:'A',drawing:'R1',quantity:2,price:50000,material}]});const root=h.s.quotes[0].id;h.run('quoteVersion',{id:root,due:'2026-11-02'});assert.throws(()=>h.run('quoteVersion',{id:root,due:'2026-11-03'}),/최신/);const backup=copy(h.s),converted=h.run('convert',{id:h.s.quotes[1].id});assert.equal(summary(h.s.orders[0]).estimated,31570*2);assert.throws(()=>h.run('materialActual',{...base(h),kg:1e12,kgRate:1e12,note:'overflow'}),/소재비/);const restored=restoreState(h.s,backup,h.s.revision,id);assert.throws(()=>apply(restored,converted,id),/무효화/);
 const b=base(h);h.run('process',{...b,name:'밀링',mode:'자체',estimated:500});assert.equal(summary(h.s.orders[0]).estimated,3140+500);
});
async function withServer(fn,options={}){const {createServer}=require('./server'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'mes-test-')),server=createServer({dataDir:dir,...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port,dir);}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}}
test('Fix regression: HTTP cancellation commit retry, reload and supply cost validation',async()=>{let failCommit=false;await withServer(async(url)=>{const get=()=>fetch(url+'/api/state').then(r=>r.json()),post=cmd=>fetch(url+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)});async function send(type,payload){const cmd={key:id(),revision:(await get()).revision,type,payload},r=await post(cmd);assert.equal(r.status,200,JSON.stringify(await r.json()));return cmd;}await send('quote',{customer:'허구 HTTP',due:'2027-01-01',terms:'시험',items:[{name:'사급',drawing:'A',quantity:10,price:1000,material:{...material,supply:'customer'}},{name:'도급',drawing:'B',quantity:2,price:1000,material}]});await send('convert',{id:(await get()).quotes[0].id});let o=(await get()).orders[0];const b={orderId:o.id,lineId:o.lines[0].id};await send('process',{...b,name:'자체',mode:'자체',estimated:0});await send('process',{...b,name:'빈 외주',mode:'외주',estimated:0});o=(await get()).orders[0];await send('work',{...b,processId:o.lines[0].processes[0].id,hours:1,rate:100,good:5,bad:0});const before=await get(),cmd={key:id(),revision:before.revision,type:'cancelProcess',payload:{...b,processId:o.lines[0].processes[1].id}};failCommit=true;const failed=await post(cmd);assert.equal(failed.status,503);assert.equal((await failed.json()).retryable,true);assert.deepEqual(await get(),before);assert.equal((await post(cmd)).status,200);assert.equal((await post(cmd)).status,200);assert.equal((await get()).orders[0].lines[0].inventory['수입검사'],5);const beforeDenied=await get(),denied=await post({key:id(),revision:beforeDenied.revision,type:'materialActual',payload:{...b,kg:1,kgRate:1200,note:'사급'}});assert.equal(denied.status,400);assert.match((await denied.json()).error,/사급/);assert.deepEqual(await get(),beforeDenied);await send('materialActual',{orderId:o.id,lineId:o.lines[1].id,kg:1,kgRate:1200,note:'도급'});const reloaded=await get();assert.equal(reloaded.summaries[0].materialActual,1200);assert.equal(reloaded.summaries[0].actual,1300);},{beforeCommit(){if(failCommit){failCommit=false;throw Error('simulated commit failure');}}});});
test('HTTP 동시요청/새로고침/반복클릭/복원 멱등/정적 asset',async()=>withServer(async(url)=>{
 const get=()=>fetch(url+'/api/state').then(r=>r.json()),post=(route,p)=>fetch(url+route,{method:'POST',body:JSON.stringify(p)});
 assert.equal((await fetch(url)).status,200);for(const name of ['/ui.js','/styles.css'])assert.equal((await fetch(url+name)).status,200);
 const cmd={key:'http1',revision:0,type:'quote',payload:{customer:'A',due:'2026-11-01',terms:'30일',items:[{name:'A',drawing:'R1',quantity:1,price:100}]}};
 const results=await Promise.all([post('/api/command',cmd),post('/api/command',{...cmd,key:'http2'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal((await get()).quotes.length,1);
 assert.equal((await post('/api/command',cmd)).status,200);assert.equal((await get()).revision,1);
 const backup=await fetch(url+'/api/backup').then(r=>r.json()),restore={key:'restore-http',revision:1,backup};assert.equal((await post('/api/restore',restore)).status,200);assert.equal((await post('/api/restore',restore)).status,200);assert.equal((await get()).revision,2);assert.equal((await post('/api/command',{...cmd,key:'http3'})).status,400);
 assert.equal((await fetch(url+'/api/command',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{}'})).status,403);
}));
test('파일 commit 실패는 상태보존, 같은 요청키 재시도 복구',async()=>{
 let fail=true;await withServer(async(url,dir)=>{const cmd={key:'retry',revision:0,type:'quote',payload:{customer:'A',due:'2026-11-01',terms:'30일',items:[{name:'A',drawing:'R1',quantity:1,price:100}]}};
 const post=()=>fetch(url+'/api/command',{method:'POST',body:JSON.stringify(cmd)});const failed=await post();assert.equal(failed.status,503);assert.equal((await failed.json()).retryable,true);assert.equal((await fetch(url+'/api/state').then(r=>r.json())).revision,0);fail=false;assert.equal((await post()).status,200);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8')).revision,1);assert.equal((await post()).status,200);},{beforeCommit(){if(fail)throw Error('모의 디스크 실패');}});
});
test('외부 접속 Host는 허용 목록과 https Origin만 통과',async()=>withServer(async(url)=>{
 const port=new URL(url).port,http=require('node:http');
 const status=(headers,method='GET',body)=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:method==='GET'?'/api/state':'/api/command',method,headers},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end(body);});
 assert.equal(await status({Host:'mes.example.test'}),200);
 assert.equal(await status({Host:'MES.example.test'}),200);
 assert.equal(await status({Host:'other.example.test'}),403);
 assert.equal(await status({Host:'mes.example.test',Origin:'http://mes.example.test'},'POST','{}'),403);
 assert.equal(await status({Host:'mes.example.test',Origin:'https://evil.invalid'},'POST','{}'),403);
 assert.notEqual(await status({Host:'mes.example.test',Origin:'https://mes.example.test'},'POST','{}'),403);
},{publicHosts:['mes.example.test']}));
test('외부 접속 Host 미설정 시 로컬 주소만 허용',async()=>withServer(async(url)=>{
 const port=new URL(url).port,http=require('node:http');
 const code=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/state',headers:{Host:'mes.example.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
 assert.equal(code,403);
},{publicHosts:[]}));
