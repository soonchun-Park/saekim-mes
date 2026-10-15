'use strict';
// 견적 → 수주 → 자체/외주 배정·발행 → 작업/입고 → 검사 → 납품 → 청구/입금 흐름을 무작위 조건으로 반복 실행합니다.
// 실제 자료는 쓰지 않습니다. 임시 폴더 서버에서 실행하며, 원하면 기존 카탈로그(거래처·소재)만 복사해 씁니다.
// 사용: node qa/stress-workflow.js [반복횟수=100] [카탈로그 복사 원본 폴더(선택)]
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {preview}=require('./integrated-server'),C=require('../core'),W=require('../workflow-overview'),D=require('../dashboard-model'),S=require('../settlement-model'),{buildView}=require('../ops/export-view');

const RUNS=Number(process.argv[2]||100),SEED_DIR=process.argv[3];
let seed=20261016;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const int=(a,b)=>a+Math.floor(rnd()*(b-a+1)),pick=a=>a[Math.floor(rnd()*a.length)],chance=p=>rnd()<p;

async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mes-stress-'));
 if(SEED_DIR)fs.copyFileSync(path.join(SEED_DIR,'material-catalog.json'),path.join(dir,'material-catalog.json'));
 const server=preview({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const stats={runs:0,commands:0,expectedRejects:0,unexpected:[],invariantFailures:[],byType:{}},log=[];
 let revision=0;
 const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let json;try{json=await r.json();}catch{json={};}return {status:r.status,body:json};};
 const get=route=>fetch(base+route).then(r=>r.json());
 async function cmd(type,payload,{expectFail=false,run}={}){const r=await post('/api/command',{key:crypto.randomUUID(),revision,type,payload});stats.commands++;stats.byType[type]=(stats.byType[type]||0)+1;
  if(r.status===200){if(expectFail){stats.unexpected.push({run,type,payload,problem:'거절돼야 할 요청이 저장됨'});}revision=r.body.revision;return r.body;}
  if(expectFail){stats.expectedRejects++;return null;}
  stats.unexpected.push({run,type,payload,status:r.status,error:r.body.error});if(process.env.STRESS_DEBUG)console.error('UNEXPECTED',run,type,r.status,r.body.error,JSON.stringify(payload).slice(0,300));if(/revision|새로고침/.test(r.body.error||''))revision=(await fullState()).revision;return null;}
 const read=async id=>(await post('/api/read',{kind:'orders',id})).body.item;
 const catalog=(await get('/api/catalog')).catalog,parties=(await get('/api/parties')).parties||[];
 let customers=parties.filter(p=>/customer|매출/.test(JSON.stringify(p.roles||p.role||''))),suppliers=parties.filter(p=>/supplier|매입/.test(JSON.stringify(p.roles||p.role||'')));
 if(!suppliers.length){const r=await post('/api/parties',{action:'command',command:{key:crypto.randomUUID(),revision:(await get('/api/catalog')).revision,type:'partyCreate',payload:{name:'허구 외주처',role:'supplier'}}});suppliers=[r.body.result];}
 const materials=(catalog.materials||[]).filter(m=>m.density&&m.kgRate);

 for(let run=1;run<=RUNS;run++){stats.runs++;
  const nItems=int(1,4),items=[];
  for(let i=0;i<nItems;i++){const item={name:'시험품목'+run+'-'+i,drawing:'D'+run+'-'+i+' REV'+pick(['A','B']),quantity:int(1,60),price:int(1,400)*100};
   if(materials.length&&chance(.6)){const m=pick(materials),shape=pick(['plate','bar']),len=int(10,300),allow=int(0,5);
    const productDimensions=shape==='plate'?{length:len,width:int(10,200),height:int(2,50)}:{length:len,diameter:int(5,120)};
    const dimensions=shape==='plate'?{...productDimensions,length:len+allow}:{length:len+allow,diameter:productDimensions.diameter+int(0,5)};
    const processing=chance(.4);
    item.material={supply:chance(.15)?'customer':'contract',masterId:m.id,masterRevision:m.revision,name:m.name,shape,productDimensions,allowance:shape==='plate'?{length:allow,width:0,height:0}:{length:allow},dimensions,density:m.density,kgRate:m.kgRate,processingIncluded:processing,...(processing?{hours:int(1,10),hourRate:int(3,9)*10000}:{})};}
   items.push(item);}
  const customer=chance(.7)&&customers.length?pick(customers):null;
  const quoteDate='2026-10-'+String(int(1,28)).padStart(2,'0'),due='2026-'+pick(['11','12'])+'-'+String(int(1,28)).padStart(2,'0');
  const q=await cmd('quote',{customer:customer?customer.name:'직접입력 고객'+run,...(customer?{customerPartyId:customer.id,customerPartyRevision:customer.revision}:{}),quoteDate,due,terms:pick(['마감 후 30일','마감 후 55일','납품시 즉시결제']),items},{run});
  if(!q){log.push(run+': 견적 저장 실패');continue;}
  let quoteId=(await fullState()).quotes.find(x=>x.items?.[0]?.name==='시험품목'+run+'-0')?.id;
  if(!quoteId){stats.invariantFailures.push({run,problem:'저장한 견적을 목록에서 찾지 못함'});continue;}
  if(chance(.15)){const v=await cmd('quoteVersion',{id:quoteId,quoteDate,due,terms:'마감 후 30일'},{run});if(v){const st=await fullState();quoteId=(st.quotes.find(x=>x.previousId===quoteId)||st.quotes.at(-1)).id;}}
  if(chance(.08)){await cmd('quoteCancel',{id:quoteId,reason:'시험 취소'},{run});await cmd('convert',{id:quoteId},{run,expectFail:true});continue;}
  const conv=await cmd('convert',{id:quoteId},{run});if(!conv){log.push(run+': 수주 전환 실패');continue;}
  await cmd('convert',{id:quoteId},{run,expectFail:true});// 같은 견적 두 번 전환 금지
  const orderId=(await fullState()).orders.find(x=>x.snapshot?.id===quoteId||x.quoteId===quoteId)?.id;let order=await read(orderId);
  if(!order){stats.invariantFailures.push({run,problem:'수주 조회 실패',orderId});continue;}
  if(chance(.05)){const v=require('../order-cancellation').preview(order);await cmd('orderCancel',{orderId,reason:'시험 취소',cancelRevision:v.status.revision,reviewSignature:v.signature,acknowledge:true,actor:'시험 담당자'},{run});continue;}
  for(const line of order.lines){const qty=line.quantity;if(process.env.STRESS_DEBUG)console.error('LINE',run,line.id.slice(0,8),qty,(line.executionAssignments||[]).length,line.delivered,JSON.stringify(line.inventory));const own=chance(.5)?qty:chance(.5)?0:int(0,qty),out=qty-own;const done=[];
   for(const [mode,quantity] of [['자체',own],['외주',out]]){if(!quantity)continue;
    const supplier=pick(suppliers);
    const a=await cmd('assignProduction',{orderId,lineId:line.id,mode,quantity,processName:mode+' 가공',estimated:int(10,500),requestedDue:due,paymentTerms:'마감 후 30일',instruction:'시험 지시',...(mode==='외주'?{supplierPartyId:supplier.id,supplierPartyRevision:supplier.revision,unitPrice:int(1,100)*100}:{})},{run});
    if(!a)continue;const l=(await read(orderId)).lines.find(x=>x.id===line.id),asg=l.executionAssignments.at(-1),doc=l.productionDocuments.at(-1);
    // 발행 전 실적 기록은 막혀야 함
    if(mode==='자체')await cmd('work',{orderId,lineId:line.id,processId:asg.processId,documentId:doc.id,hours:1,rate:10000,good:1,bad:0},{run,expectFail:true});
    await cmd('documentIssue',{orderId,lineId:line.id,documentId:doc.id},{run});
    done.push({mode,quantity,processId:asg.processId,documentId:doc.id});}
   await cmd('assignProduction',{orderId,lineId:line.id,mode:'자체',quantity:1,processName:'초과',estimated:1,requestedDue:due,paymentTerms:'합의',instruction:'초과'},{run,expectFail:true});// 배정 초과 금지
   for(const d of done){let left=d.quantity;
    while(left>0){const part=chance(.4)?int(1,left):left;
     if(d.mode==='자체'){const bad=chance(.1)?Math.min(1,part-1):0;const r=await cmd('work',{orderId,lineId:line.id,processId:d.processId,documentId:d.documentId,hours:int(1,8),rate:int(1,5)*10000,good:part-bad,bad},{run});if(!r)break;left-=part;}
     else{const r=await cmd('receive',{orderId,lineId:line.id,processId:d.processId,documentId:d.documentId,quantity:part,actual:part*int(1,100)*100},{run});if(!r)break;left-=part;}}
    if(d.mode==='외주')await cmd('receive',{orderId,lineId:line.id,processId:d.processId,documentId:d.documentId,quantity:1,actual:100},{run,expectFail:true});// 입고 초과 금지
   }
  }
  order=await read(orderId);
  // 검사·납품
  for(const line of order.lines){const st=await fullState();const o=st.orders.find(x=>x.id===orderId);if(!o)break;
   const available=inspectable(o,line.id);if(available<=0)continue;
   const rejected=chance(.15)?int(0,Math.min(2,available)):0;
   const ins=await cmd('inspect',{orderId,lineId:line.id,quantity:available,rejected},{run});if(!ins)continue;
   const passed=available-rejected;let left=passed;
   await cmd('deliver',{orderId,lineId:line.id,quantity:passed+1},{run,expectFail:true});// 합격 수량 초과 납품 금지
   while(left>0){const part=chance(.35)?int(1,left):left;const r=await cmd('deliver',{orderId,lineId:line.id,quantity:part},{run});if(!r)break;left-=part;}}
  // 청구·입금
  let st=await fullState();let o=st.orders.find(x=>x.id===orderId);if(!o)continue;let sm=C.summary(o);
  const deliveredAmount=o.lines.reduce((a,l)=>a+deliveredQty(l)*priceOf(o,l),0);
  if(deliveredAmount>0){
   await cmd('invoice',{orderId,amount:deliveredAmount+1},{run,expectFail:true});// 납품 금액 초과 청구 금지
   const first=chance(.4)?Math.max(1,Math.floor(deliveredAmount*rnd())):deliveredAmount;
   const inv1=await cmd('invoice',{orderId,amount:first},{run});
   if(first<deliveredAmount&&chance(.6))await cmd('invoice',{orderId,amount:deliveredAmount-first},{run});
   st=await fullState();o=st.orders.find(x=>x.id===orderId);
   for(const inv of o.invoices||[]){const pays=chance(.3)?2:1;let left=inv.amount;
    for(let p=0;p<pays&&left>0;p++){const amt=p===pays-1?left:Math.max(1,Math.floor(left/2));const r=await cmd('payment',{orderId,date:'2026-12-'+String(int(1,28)).padStart(2,'0'),allocations:[{invoiceId:inv.id,amount:amt}]},{run});if(r)left-=amt;}
    await cmd('payment',{orderId,date:'2026-12-30',allocations:[{invoiceId:inv.id,amount:1}]},{run,expectFail:true});// 초과 입금 금지
   }}
  // 불변 조건 검사
  st=await fullState();o=st.orders.find(x=>x.id===orderId);if(o)checkOrder(run,o,stats);
  if(run%10===0){const full=await fullState();checkGlobal(run,full,stats);}
 }
 const full=await fullState();checkGlobal('final',full,stats);
 // 백업 → 새 폴더 복원 후 동일성
 const backup=await get('/api/backup');const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'mes-stress-restore-'));const s2=preview({dataDir:dir2});await new Promise(r=>s2.listen(0,'127.0.0.1',r));const b2='http://127.0.0.1:'+s2.address().port;
 const rr=await fetch(b2+'/api/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),revision:0,backup})});
 if(rr.status!==200)stats.invariantFailures.push({run:'restore',problem:'복원 실패',error:(await rr.json()).error});else{const a=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8')),b=JSON.parse(fs.readFileSync(path.join(dir2,'state.json'),'utf8'));if(JSON.stringify(a.quotes)!==JSON.stringify(b.quotes)||JSON.stringify(a.orders)!==JSON.stringify(b.orders))stats.invariantFailures.push({run:'restore',problem:'복원 후 견적/수주 불일치'});}
 await new Promise(r=>s2.close(r));fs.rmSync(dir2,{recursive:true,force:true});
 const summary={runs:stats.runs,commands:stats.commands,expectedRejects:stats.expectedRejects,quotes:full.quotes.length,orders:full.orders.length,byType:stats.byType,unexpected:stats.unexpected.slice(0,40),unexpectedCount:stats.unexpected.length,invariantFailures:stats.invariantFailures.slice(0,40),invariantFailureCount:stats.invariantFailures.length,log:log.slice(0,20)};
 console.log(JSON.stringify(summary,null,1));
 server.closeAllConnections?.();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});
 if(stats.unexpected.length||stats.invariantFailures.length)process.exitCode=1;

 async function fullState(){const p=path.join(dir,'state.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):C.empty();}
}
function lineOf(o,lineId){return o.lines.find(l=>l.id===lineId);}
function priceOf(o,l){const it=(o.snapshot.items||[]).find(i=>i.id===l.itemId||i.id===l.id)||o.snapshot.items[o.lines.indexOf(l)];return it?it.price:0;}
function deliveredQty(l){return l.delivered||0;}
function inspectable(o,lineId){const l=lineOf(o,lineId);return l?.inventory?.['수입검사']||0;}
function checkOrder(run,o,stats){try{const s=C.summary(o);
  const fail=p=>stats.invariantFailures.push({run,orderId:o.id,problem:p,summary:{sale:s.sale,billed:s.billed,paid:s.paid,balance:s.balance,delivered:s.delivered,quantity:s.quantity}});
  if(s.delivered>s.quantity)fail('납품 수량이 주문 수량보다 큼');
  if(s.paid>s.billed)fail('입금이 청구보다 큼');
  if(s.balance!==s.billed-s.paid)fail('미수금 계산 불일치');
  if(s.billed>s.sale)fail('청구가 계약 금액보다 큼');
  if(s.settlementComplete&&!(s.deliveryComplete&&s.balance===0&&s.unbilled===0))fail('정산 완료 판정 오류');
 }catch(e){stats.invariantFailures.push({run,orderId:o.id,problem:'요약 계산 오류: '+e.message});}}
function checkGlobal(run,state,stats){try{C.validateState?.(state);}catch(e){stats.invariantFailures.push({run,problem:'저장 상태 검증 실패: '+e.message});}
 try{const w=W.build(state);for(const g of Object.values(w.groups))if(g.count!==g.rows.length&&g.rows.length<g.count===false)stats.invariantFailures.push({run,problem:'업무 흐름 건수 불일치 '+g.id});}catch(e){stats.invariantFailures.push({run,problem:'업무 흐름 계산 오류: '+e.message});}
 try{D.buildDashboard(state,{parties:[]});}catch(e){stats.invariantFailures.push({run,problem:'대시보드 계산 오류: '+e.message});}
 try{const st=S.buildSettlement(state,{parties:[]});const sum=state.orders.filter(o=>!o.canceled).reduce((a,o)=>a+C.summary(o).billed,0);if(st.totals.billedAmount!==sum)stats.invariantFailures.push({run,problem:'정산 청구 합계 불일치',settlement:st.totals.billedAmount,orders:sum});}catch(e){stats.invariantFailures.push({run,problem:'정산 계산 오류: '+e.message});}
 try{buildView(state,{parties:[]});}catch(e){stats.invariantFailures.push({run,problem:'외부 조회 자료 생성 오류: '+e.message});}
 const nums=state.quotes.map(q=>q.quoteNumber).filter(Boolean);if(new Set(nums).size!==nums.length)stats.invariantFailures.push({run,problem:'견적번호 중복'});}
main().catch(e=>{console.error(e);process.exitCode=1;});
