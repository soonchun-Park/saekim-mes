'use strict';
// 거래명세서: 수주의 납품 기록을 한국 날짜(KST)별로 묶어 공급자·공급받는자·품목·공급가액·세액을 출력합니다.
// 저장 기록을 읽기만 하며 아무것도 바꾸지 않습니다.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TransactionStatement=api;})(globalThis,function(){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const won=n=>Number(n||0).toLocaleString('ko-KR');
 const kst=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(t));
 const VAT=0.1;

 // 이 수주의 납품 날짜 목록(KST) - 최근 날짜 먼저
 function deliveryDates(order){const set=new Set();for(const l of order.lines||[])for(const r of l.deliveryRecords||[])if(r&&r.time&&r.quantity>0)set.add(kst(r.time));return [...set].sort().reverse();}

 // date가 없으면 지금까지 납품한 전체 수량, 있으면 그 날짜에 납품한 수량
 function build(order,company={},options={}){
  if(!order||!Array.isArray(order.lines))throw Error('수주 정보가 필요합니다.');
  const date=options.date||null,items=[];
  for(const l of order.lines){
   const item=(order.snapshot?.items||[]).find(i=>i.id===l.id);if(!item)continue;
   const records=(l.deliveryRecords||[]).filter(r=>r&&r.quantity>0&&(!date||kst(r.time)===date));
   const quantity=date?records.reduce((a,r)=>a+r.quantity,0):(l.delivered||0);
   if(quantity<=0)continue;
   const supply=quantity*item.price,tax=Math.round(supply*VAT);
   items.push({name:item.name,spec:item.drawing,quantity,price:item.price,supply,tax});
  }
  if(!items.length)throw Error(date?date+'에 납품한 기록이 없습니다.':'아직 납품한 기록이 없습니다.');
  const supplyTotal=items.reduce((a,i)=>a+i.supply,0),taxTotal=items.reduce((a,i)=>a+i.tax,0);
  const c=order.snapshot?.customerSnapshot||{};
  return {
   date:date||kst(Date.now()),scope:date?'day':'all',
   number:'TS-'+(date||kst(Date.now())).replace(/-/g,'').slice(2)+'-'+String(order.snapshot?.quoteNumber||order.id).split('-').pop(),
   orderNumber:order.snapshot?.quoteNumber||null,
   supplier:company||{},
   customer:{name:order.snapshot?.customer||'',businessNumber:c.businessNumber||'',ceo:c.ceo||c.representative||'',address:c.address||'',businessType:c.businessType||'',businessItem:c.businessItem||'',phone:c.phone||''},
   items,supplyTotal,taxTotal,total:supplyTotal+taxTotal
  };
 }

 const css=`@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#111;font:10pt/1.4 "SUIT Variable","Malgun Gothic","Apple SD Gothic Neo",sans-serif}.sheet{max-width:210mm;margin:16px auto;padding:12mm;background:#fff}h1{text-align:center;letter-spacing:.4em;font-size:20pt;margin:0 0 4px}.sub{text-align:center;color:#555;margin:0 0 10px}.top{display:flex;justify-content:space-between;margin-bottom:6px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #333;padding:5px 6px;overflow-wrap:anywhere;vertical-align:middle}th{background:#f1f3f6;font-weight:600}.parties td.k{background:#f7f8fa;width:16%;font-weight:600}.side{width:4%;text-align:center;font-weight:700;background:#f1f3f6;writing-mode:vertical-rl;letter-spacing:.3em}.n{text-align:right;font-variant-numeric:tabular-nums}.sum td{font-weight:700;background:#fafbfc}.sign{margin-top:14px;display:flex;justify-content:flex-end;gap:24px}.sign span{display:inline-block;min-width:160px;border-bottom:1px solid #333;padding:14px 0 2px}.note{color:#555;font-size:9pt;margin-top:8px}@media print{body{background:#fff}.sheet{margin:0;padding:0;max-width:none}th,.side,.parties td.k,.sum td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;

 function partyRows(side,p){const r=(k1,v1,k2,v2)=>'<tr><td class="k">'+k1+'</td><td'+(k2?'':' colspan="3"')+'>'+esc(v1)+'</td>'+(k2?'<td class="k">'+k2+'</td><td>'+esc(v2)+'</td>':'')+'</tr>';
  return '<table class="parties"><tr><td class="side" rowspan="4">'+side+'</td><td class="k">등록번호</td><td colspan="3">'+esc(p.businessNumber)+'</td></tr>'+r('상호',p.name,'대표자',p.ceo).replace('<tr>','<tr>')+r('주소',p.address)+r('업태',p.businessType,'종목',p.businessItem)+'</table>';}

 function render(v){
  const blank=Math.max(0,8-v.items.length);
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>거래명세서 '+esc(v.customer.name)+' '+esc(v.date)+'</title><style>'+css+'</style></head><body><main class="sheet">'
   +'<h1>거 래 명 세 서</h1><p class="sub">(공급받는자 보관용)</p>'
   +'<div class="top"><span>작성일자 <b>'+esc(v.date)+'</b></span><span>No. '+esc(v.number)+(v.orderNumber?' · 수주 '+esc(v.orderNumber):'')+'</span></div>'
   +'<table><tr><td style="width:50%;padding:0;border:0;vertical-align:top">'+partyRows('공 급 자',v.supplier)+'</td><td style="width:50%;padding:0 0 0 6px;border:0;vertical-align:top">'+partyRows('공급받는자',v.customer)+'</td></tr></table>'
   +'<p style="margin:10px 0 6px">합계금액 (공급가액 + 세액) <b style="font-size:13pt">'+won(v.total)+' 원</b></p>'
   +'<table><colgroup><col style="width:6%"><col style="width:24%"><col style="width:20%"><col style="width:8%"><col style="width:12%"><col style="width:16%"><col style="width:14%"></colgroup><thead><tr><th>No</th><th>품명</th><th>규격 / 도면</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th></tr></thead><tbody>'
   +v.items.map((i,n)=>'<tr><td class="n">'+(n+1)+'</td><td>'+esc(i.name)+'</td><td>'+esc(i.spec)+'</td><td class="n">'+won(i.quantity)+'</td><td class="n">'+won(i.price)+'</td><td class="n">'+won(i.supply)+'</td><td class="n">'+won(i.tax)+'</td></tr>').join('')
   +'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(blank)
   +'<tr class="sum"><td colspan="5">합계</td><td class="n">'+won(v.supplyTotal)+'</td><td class="n">'+won(v.taxTotal)+'</td></tr></tbody></table>'
   +'<div class="sign"><div>인수자 <span></span> (인)</div></div>'
   +'<p class="note">'+(v.scope==='day'?esc(v.date)+' 납품분 기준':'누적 납품 전체 기준')+' · 세액은 공급가액의 10%(원 단위 반올림)입니다. 저장된 납품 기록과 수주 시점 단가로 작성했습니다.'+(v.supplier.name?'':' · 우리 회사 정보가 비어 있습니다. 거래처 관리 화면에서 입력하세요.')+'</p>'
   +'</main></body></html>';
 }

 // 브라우저: 날짜 선택 + 미리보기 + 인쇄 창
 async function open(order){
  const doc=globalThis.document;if(!doc)throw Error('브라우저에서 열 수 있습니다.');
  let company={};try{company=(await fetch('/api/company').then(r=>r.json())).company||{};}catch{}
  const dates=deliveryDates(order);if(!dates.length&&!(order.lines||[]).some(l=>l.delivered>0))throw Error('아직 납품한 기록이 없습니다. 납품 후 거래명세서를 만들 수 있습니다.');
  const dialog=doc.createElement('dialog');dialog.className='quote-document-dialog statement-dialog';dialog.setAttribute('aria-label','거래명세서 미리보기');
  const bar=doc.createElement('div');bar.className='quote-document-toolbar';
  const select=doc.createElement('select');select.setAttribute('aria-label','납품일 선택');select.innerHTML=dates.map(d=>'<option value="'+d+'">'+d+' 납품분</option>').join('')+'<option value="">누적 납품 전체</option>';
  const print=doc.createElement('button');print.textContent='인쇄 / PDF로 저장';const close=doc.createElement('button');close.textContent='닫기';close.className='secondary';
  const hint=doc.createElement('p');hint.textContent='인쇄 대화상자에서 PDF로 저장을 선택하세요. 외부로 발송하지 않습니다.';
  const frame=doc.createElement('iframe');frame.title='거래명세서';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='width:100%;height:70vh;border:1px solid #ccd;background:#fff';
  const paint=()=>{try{frame.srcdoc=render(build(order,company,{date:select.value||null}));print.disabled=false;}catch(e){frame.srcdoc='<p style="font:14px sans-serif;padding:20px">'+esc(e.message)+'</p>';print.disabled=true;}};
  select.onchange=paint;print.onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print();};close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
  bar.append(select,print,close,hint);dialog.append(bar,frame);doc.body.append(dialog);paint();dialog.showModal();return dialog;
 }
 return {deliveryDates,build,render,open};
});
