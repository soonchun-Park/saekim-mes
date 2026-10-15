(function(){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const COMMANDS=['assignProduction','documentIssue','documentRevise','assignmentCancel','assignmentReplace'];
function text(x,n){if(typeof x!=='string'||!x.trim()||x.length>500)throw Error(n+' 필수 (500자 이하)');return x;}
function num(x,n,integer=true,min=0){if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>1e12||integer&&!Number.isSafeInteger(x))throw Error(n+' 숫자 오류');return x;}
function date(x){text(x,'요청납기');if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||new Date(x).toISOString().slice(0,10)!==x)throw Error('요청납기 오류');return x;}
function progressed(r){return !!(r.hours||r.actual||r.good||r.bad||r.received);}
function output(r){return r.mode==='자체'?r.good:r.received-r.bad;}
function drawing(l,i){return clone(l.currentDrawing||l.orderDrawing||{revision:i.drawingRevision||i.drawing,attachments:i.attachments||[]});}
function apply(l,item,p,type,ctx){
 const {id,now,resolveSupplier}=ctx;
 if(!l)throw Error('생산 배정 품목 없음');
 if(l.pendingDrawing)throw Error('도면 변경 확인 대기 중');
 function assignment(){const a=l.executionAssignments?.find(a=>a.id===p.assignmentId);if(!a||a.canceled)throw Error('활성 생산 배정 없음');const r=l.processes.find(r=>r.id===a.processId);return {a,r};}
 function draft(a,snapshot,familyId,version){const doc={id:id(),familyId,version,number:(a.mode==='자체'?'WO-':'PO-')+familyId,status:'draft',snapshot:clone(snapshot),createdAt:now};l.productionDocuments.push(doc);return doc;}
 function assign(){
  if(l.executionAssignments===undefined){if(l.processes.length||l.stockProduced||l.inspected||l.delivered)throw Error('기존 공정 품목의 분할 배정 전환 정책이 미확정입니다. 기존 공정을 보존합니다');l.executionAssignments=[];l.productionDocuments=[];l.assignmentHistory=[];}
  if(!['자체','외주'].includes(p.mode))throw Error('자체/외주 구분 오류');num(p.quantity,'배정 수량',true,1);num(p.estimated,'추정 가공비');text(p.processName,'공정명');date(p.requestedDue);text(p.paymentTerms,'결제조건');text(p.instruction,'작업지시');
  if(l.executionAssignments.filter(a=>!a.canceled).reduce((n,a)=>n+a.quantity,0)+p.quantity>l.quantity)throw Error('수주 수량 초과 배정');
  let supplier=null,unitPrice=null;
  if(p.mode==='외주'){text(p.supplierPartyId,'외주업체');num(p.supplierPartyRevision,'외주업체 revision',true,1);num(p.unitPrice,'외주 합의단가',true,1);if(typeof resolveSupplier!=='function')throw Error('외주업체 서버 확인 필요');const s=resolveSupplier(p.supplierPartyId,p.supplierPartyRevision);if(!s||s.id!==p.supplierPartyId||s.revision!==p.supplierPartyRevision||s.active===false||s.role&&!['supplier','both'].includes(s.role))throw Error('사용 중 외주업체 확인 오류');supplier={id:s.id,revision:s.revision,name:text(s.name,'외주업체명')};unitPrice=p.unitPrice;}
  if(p.materialDispatchNote!==undefined)text(p.materialDispatchNote,'사급 지시');
  const familyId=id(),a={id:id(),mode:p.mode,quantity:p.quantity,processId:id(),documentFamily:familyId,canceled:false,createdAt:now};
  const r={id:a.processId,assignmentId:a.id,name:p.processName,mode:p.mode,estimated:p.estimated,actual:0,hours:0,good:0,bad:0,received:0,canceled:false,createdAt:now,createdDrawing:drawing(l,item),drawingRecords:[]};
  if(supplier){r.supplierPartyId=supplier.id;r.supplierSnapshot=supplier;r.expectedReceiptDate=p.requestedDue;}
  const snapshot={orderId:ctx.orderId,sourceQuoteId:ctx.sourceQuoteId,assignmentId:a.id,processId:r.id,mode:a.mode,itemId:item.id,itemName:item.name,quantity:a.quantity,processName:r.name,drawing:drawing(l,item),requestedDue:p.requestedDue,instruction:p.instruction,supplier,unitPrice,paymentTerms:p.paymentTerms,material:clone(item.material||null),materialDispatchNote:p.materialDispatchNote||null};
  l.executionAssignments.push(a);l.processes.push(r);const doc=draft(a,snapshot,familyId,1);return {assignment:clone(a),document:clone(doc)};
 }
 if(type==='assignProduction')return assign();
 if(type==='assignmentCancel'||type==='assignmentReplace'){const {a,r}=assignment();text(p.reason,'배정 취소/교체 사유');if(progressed(r))throw Error('실적/입고 진행 후 배정 취소·전환 불가');a.canceled=true;a.canceledAt=now;a.cancelReason=p.reason;r.canceled=true;l.assignmentHistory.push({id:id(),assignmentId:a.id,type: type==='assignmentReplace'?'replace':'cancel',reason:p.reason,time:now});return type==='assignmentReplace'?assign():clone(a);}
 if(type==='documentIssue'||type==='documentRevise'){
  const doc=l.productionDocuments?.find(d=>d.id===p.documentId);if(!doc)throw Error('생산 문서 없음');const a=l.executionAssignments.find(a=>a.documentFamily===doc.familyId);if(!a||a.canceled)throw Error('취소 배정 문서 발행/개정 불가');const family=l.productionDocuments.filter(d=>d.familyId===doc.familyId);if(doc.version!==Math.max(...family.map(d=>d.version)))throw Error('최신 문서 버전만 처리 가능');
  const r=l.processes.find(r=>r.id===a.processId);
  if(type==='documentIssue'){if(doc.status!=='draft')throw Error('이미 발행된 문서');if(JSON.stringify(doc.snapshot.drawing)!==JSON.stringify(drawing(l,item)))throw Error('도면 REV 변경: 최신 도면으로 문서를 개정하세요');doc.status='issued';doc.issuedAt=now;return clone(doc);}
  text(p.reason,'문서 개정 사유');if(progressed(r))throw Error('실적/입고 진행 후 문서 개정 불가');if(p.quantity!==undefined||p.mode!==undefined)throw Error('문서 개정으로 수량/구분 변경 불가');
  const snap=clone(doc.snapshot);snap.drawing=drawing(l,item);for(const k of ['requestedDue','instruction','paymentTerms','unitPrice'])if(p[k]!==undefined)snap[k]=p[k];date(snap.requestedDue);text(snap.instruction,'작업지시');text(snap.paymentTerms,'결제조건');if(a.mode==='외주')num(snap.unitPrice,'외주 단가',true,1);const next=draft(a,snap,doc.familyId,doc.version+1);next.previousId=doc.id;next.reviseReason=p.reason;return clone(next);
 }
 if(type==='work'||type==='receive'){
  const r=l.processes.find(r=>r.id===p.processId),a=l.executionAssignments.find(a=>a.processId===p.processId);if(!r||!a||a.canceled||r.canceled)throw Error('활성 생산 배정 없음');
  const doc=l.productionDocuments.find(d=>d.id===p.documentId&&d.familyId===a.documentFamily&&d.status==='issued');if(!doc)throw Error('발행된 생산 문서 선택 필수');
  const latest=l.productionDocuments.filter(d=>d.familyId===a.documentFamily).sort((a,b)=>b.version-a.version)[0];if(latest.id!==doc.id)throw Error('최신 문서 발행 후 실적 기록 필요');
  if(JSON.stringify(doc.snapshot.drawing)!==JSON.stringify(drawing(l,item)))throw Error('발행 문서와 현재 도면 REV 불일치');
  if(type==='work'){if(r.mode!=='자체')throw Error('자체 배정만 작업 기록 가능');num(p.hours,'작업시간',false,0.000001);num(p.rate,'시간당 단가',true,1);num(p.good,'양품');num(p.bad,'불량');if(r.good+r.bad+p.good+p.bad>a.quantity)throw Error('배정 수량 초과 작업');r.hours+=p.hours;r.good+=p.good;r.bad+=p.bad;r.actual+=Math.round(p.hours*p.rate);}
  else{if(r.mode!=='외주')throw Error('외주 배정만 입고 가능');num(p.quantity,'입고 수량',true,1);num(p.actual,'실제 외주비');const rejected=p.rejected===undefined?0:num(p.rejected,'입고 불량');if(rejected>p.quantity||r.received+p.quantity>a.quantity)throw Error('배정 수량/입고 불량 초과');r.received+=p.quantity;r.bad+=rejected;r.actual+=p.actual;}
  r.drawingRecords.push({id:id(),type,time:now,drawing:clone(doc.snapshot.drawing),documentId:doc.id,documentVersion:doc.version,payload:clone(p)});return {processId:r.id,documentId:doc.id,remaining:a.quantity-(r.mode==='자체'?r.good+r.bad:r.received),good:output(r)};
 }
 throw Error('지원하지 않는 생산 명령');
}
function validate(l,item,uid,checkDrawing,order){
 if(l.executionAssignments===undefined){if(l.productionDocuments!==undefined||l.assignmentHistory!==undefined)throw Error('생산 배정 메타 누락');return;}
 if(!Array.isArray(l.executionAssignments)||!Array.isArray(l.productionDocuments)||!Array.isArray(l.assignmentHistory))throw Error('생산 배정 배열 오류');
 let total=0;const used=new Set();
 for(const a of l.executionAssignments){uid(a.id);num(a.quantity,'배정수량',true,1);if(!['자체','외주'].includes(a.mode)||typeof a.canceled!=='boolean'||!Number.isFinite(Date.parse(a.createdAt)))throw Error('생산 배정 메타 오류');const r=l.processes.find(r=>r.id===a.processId);if(!r||r.assignmentId!==a.id||r.mode!==a.mode||r.canceled!==a.canceled||used.has(r.id))throw Error('생산 배정 공정 연결 오류');used.add(r.id);if(r.good+r.bad>a.quantity||r.received>a.quantity||a.mode==='외주'&&r.bad>r.received)throw Error('배정 실적 수량 오류');if(!a.canceled)total+=a.quantity;else{text(a.cancelReason,'취소 사유');if(progressed(r))throw Error('진행 배정 취소 오류');}}
 if(total>l.quantity||used.size!==l.processes.length)throw Error('수주 배정 수량/미연결 공정 오류');
 const docIds=new Set(),numbers=new Map();
 for(const a of l.executionAssignments){const family=l.productionDocuments.filter(d=>d.familyId===a.documentFamily).sort((x,y)=>x.version-y.version);if(!family.length)throw Error('배정 문서 누락');family.forEach((d,n)=>{uid(d.id);docIds.add(d.id);if(d.version!==n+1||d.number!==(a.mode==='자체'?'WO-':'PO-')+a.documentFamily||numbers.has(d.number)&&numbers.get(d.number)!==a.id||!['draft','issued'].includes(d.status)||!Number.isFinite(Date.parse(d.createdAt))||d.status==='issued'&&!Number.isFinite(Date.parse(d.issuedAt)))throw Error('생산 문서 버전/번호 오류');numbers.set(d.number,a.id);if(n&&(d.previousId!==family[n-1].id||!d.reviseReason))throw Error('생산 문서 개정 이력 오류');const s=d.snapshot;if(!s||s.orderId!==order.id||s.sourceQuoteId!==order.quoteId||JSON.stringify(s.material)!==JSON.stringify(item.material||null)||s.assignmentId!==a.id||s.processId!==a.processId||s.mode!==a.mode||s.quantity!==a.quantity||s.itemId!==item.id||s.itemName!==item.name)throw Error('생산 문서 품목 스냅샷 오류');text(s.processName,'공정명');date(s.requestedDue);text(s.instruction,'작업지시');text(s.paymentTerms,'결제조건');checkDrawing(s.drawing,item);if(a.mode==='외주'){if(!s.supplier||s.supplier.id!==l.processes.find(r=>r.id===a.processId).supplierPartyId)throw Error('외주 문서 업체 오류');text(s.supplier.name,'업체명');num(s.supplier.revision,'업체 revision',true,1);num(s.unitPrice,'외주 단가',true,1);}else if(s.supplier!==null||s.unitPrice!==null)throw Error('자체 문서 외주 정보 오류');});}
 if(docIds.size!==l.productionDocuments.length)throw Error('미연결 생산 문서');
 for(const r of l.processes){
  let hours=0,good=0,bad=0,received=0,actual=0;
  for(const e of r.drawingRecords||[]){const d=l.productionDocuments.find(d=>d.id===e.documentId);if(!d||d.status!=='issued'||d.snapshot.processId!==r.id||d.version!==e.documentVersion||JSON.stringify(d.snapshot.drawing)!==JSON.stringify(e.drawing)||e.payload?.processId!==r.id||e.payload?.documentId!==d.id)throw Error('실적 문서/도면 연결 오류');
   const p=e.payload;if(e.type==='work'){if(r.mode!=='자체')throw Error('외주 작업실적 오류');hours+=num(p.hours,'작업시간',false,0.000001);good+=num(p.good,'양품');bad+=num(p.bad,'불량');actual+=Math.round(p.hours*num(p.rate,'시급',true,1));}
   else if(e.type==='receive'){if(r.mode!=='외주')throw Error('자체 외주입고 오류');const count=num(p.quantity,'입고',true,1),rejected=p.rejected===undefined?0:num(p.rejected,'입고불량');if(rejected>count)throw Error('입고불량 초과');received+=count;bad+=rejected;actual+=num(p.actual,'외주 실제비용');}else throw Error('실적 유형 오류');
  }
  if(Math.abs(hours-r.hours)>1e-9||good!==r.good||bad!==r.bad||received!==r.received||actual!==r.actual)throw Error('배정 실적 집계와 기록 불일치');
 }
 for(const h of l.assignmentHistory){uid(h.id);text(h.reason,'배정 이력 사유');if(!l.executionAssignments.some(a=>a.id===h.assignmentId&&a.canceled)||!['cancel','replace'].includes(h.type)||!Number.isFinite(Date.parse(h.time)))throw Error('배정 취소 이력 오류');}
}
const api={COMMANDS,apply,validate,output};if(typeof module!=='undefined')module.exports=api;else globalThis.ProductionWorkflow=api;

})();
