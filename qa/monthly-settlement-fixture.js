'use strict';
const crypto=require('node:crypto'),Core=require('../core'),Catalog=require('../material-catalog'),Party=require('../party-model');
// All identities and business data are fictional. Date overrides are confined to this fixture.
function fixture(){let state=Core.empty(),catalog=Catalog.emptyCatalog();const uuid=()=>crypto.randomUUID();
function party(name,role){const r=Catalog.applyCatalog(catalog,{key:uuid(),revision:catalog.revision,type:'partyCreate',payload:{name,role}},uuid);catalog=r.state;return r.result;}
const customer=party('허구 월별 고객','customer'),other=party('허구 다른 고객','customer'),supplier=party('허구 월별 외주처','supplier'),context={resolveCustomer:id=>Party.customerSnapshot(catalog.suppliers.find(p=>p.id===id)),resolveSupplier:id=>catalog.suppliers.find(p=>p.id===id)};
function command(type,payload,time){const key=uuid();state=Core.apply(state,{key,revision:state.revision,type,payload},uuid,context);if(time)state.audit.at(-1).time=time;return state.keys[key].result;}
function order(party,time,name){const q=command('quote',{customer:party.name,customerPartyId:party.id,customerPartyRevision:party.revision,quoteDate:'2026-12-01',due:'2027-03-01',terms:'허구 조건',items:[{name,drawing:'R1',quantity:10,price:100}]});const o=command('convert',{id:q.id},time);return o.id;}
function delivered(orderId){let o=state.orders.find(o=>o.id===orderId),base={orderId,lineId:o.lines[0].id};command('process',{...base,name:'허구 공정',mode:'자체',estimated:1});o=state.orders.find(o=>o.id===orderId);const processId=o.lines[0].processes[0].id;command('work',{...base,processId,hours:1,rate:1,good:10,bad:0});command('inspect',{...base,quantity:10,rejected:0});command('deliver',{...base,quantity:10});}
const a=order(customer,'2026-12-01T00:00:00Z','허구 연말 품목');delivered(a);const invDec=command('invoice',{orderId:a,amount:600},'2026-12-31T14:59:59Z').id,invJan=command('invoice',{orderId:a,amount:400},'2026-12-31T15:00:00Z').id;
command('payment',{orderId:a,date:'2026-12-31',allocations:[{invoiceId:invDec,amount:100}]});command('payment',{orderId:a,date:'2027-01-01',allocations:[{invoiceId:invDec,amount:200}]});command('payment',{orderId:a,date:'2027-02-01',allocations:[{invoiceId:invDec,amount:100},{invoiceId:invJan,amount:100}]});
const b=order(other,'2027-01-20T00:00:00Z','허구 다른 매출처 품목');delivered(b);command('invoice',{orderId:b,amount:300},'2027-01-31T14:59:59Z');
const undated=order(customer,null,'허구 날짜 미확인 품목');delivered(undated);const oldInv=command('invoice',{orderId:undated,amount:200}).id;
// Keep successful requests/amounts intact but remove only their historical date evidence.
for(const e of state.audit){const c=JSON.parse(state.keys[e.key]?.body||'{}');if((c.type==='convert'&&state.keys[e.key].result.id===undated)||(c.type==='invoice'&&c.payload.orderId===undated))delete e.time;}
const out=order(customer,'2026-12-02T00:00:00Z','허구 월별 외주 품목'),lineId=state.orders.find(o=>o.id===out).lines[0].id,assigned=command('assignProduction',{orderId:out,lineId,mode:'외주',quantity:10,estimated:500,processName:'허구 외주',requestedDue:'2027-02-28',paymentTerms:'허구 조건',instruction:'허구 지시',supplierPartyId:supplier.id,supplierPartyRevision:supplier.revision,unitPrice:50});
command('documentIssue',{orderId:out,lineId,documentId:assigned.document.id});state.orders.find(o=>o.id===out).lines[0].productionDocuments[0].issuedAt='2026-12-31T14:59:59Z';
command('receive',{orderId:out,lineId,processId:assigned.assignment.processId,documentId:assigned.document.id,quantity:4,rejected:0,actual:200});state.orders.find(o=>o.id===out).lines[0].processes[0].drawingRecords[0].time='2027-01-31T14:59:59Z';
command('receive',{orderId:out,lineId,processId:assigned.assignment.processId,documentId:assigned.document.id,quantity:6,rejected:0,actual:300});state.orders.find(o=>o.id===out).lines[0].processes[0].drawingRecords[1].time='2027-01-31T15:00:00Z';
Core.validateState(state);Catalog.validateCatalog(catalog);return {state,catalog,customer,other,supplier,a,b,out,undated,oldInv,invDec,invJan};}
module.exports={fixture};
