'use strict';
// 통합 검색: 견적번호·거래처·품목명·도면번호·사업자번호로 견적, 수주, 거래처를 찾습니다(저장된 전체 자료 기준, 읽기 전용).
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SearchModel=api;})(globalThis,function(){
 const norm=x=>String(x??'').toLowerCase().replace(/[\s\-_.()/]/g,'');
 function terms(query){const q=String(query??'').trim();if(q.length<1||q.length>100)return [];return q.split(/\s+/).map(norm).filter(Boolean);}
 const hit=(hay,ts)=>ts.every(t=>hay.includes(t));
 function itemText(items){return (items||[]).map(i=>[i.name,i.drawing,i.material?.name].join(' ')).join(' ');}
 function search(state,catalog,query,limit=30){
  const ts=terms(query);if(!ts.length)return [];
  const out=[],converted=new Set((state.orders||[]).map(o=>o.quoteId)),superseded=new Set((state.quotes||[]).map(q=>q.previousId).filter(Boolean));
  for(const q of [...(state.quotes||[])].reverse()){
   const hay=norm([q.quoteNumber,q.customer,q.customerSnapshot?.businessNumber,itemText(q.items)].join(' '));if(!hit(hay,ts))continue;
   const total=(q.items||[]).reduce((a,i)=>a+i.quantity*i.price,0);
   out.push({kind:'quote',id:q.id,title:(q.quoteNumber||'번호 없는 견적')+' · '+q.customer,sub:(q.items||[]).map(i=>i.name+(i.drawing?' ('+i.drawing+')':'')).join(', '),date:q.quoteDate||String(q.issuedAt||'').slice(0,10),amount:total,status:q.canceled?'취소':converted.has(q.id)?'수주 전환':superseded.has(q.id)?'개정됨':'전환 대기'});
  }
  for(const o of [...(state.orders||[])].reverse()){
   const s=o.snapshot||{};const hay=norm([s.quoteNumber,s.customer,s.customerSnapshot?.businessNumber,itemText(s.items)].join(' '));if(!hit(hay,ts))continue;
   const qty=(o.lines||[]).reduce((a,l)=>a+l.quantity,0),delivered=(o.lines||[]).reduce((a,l)=>a+(l.delivered||0),0);
   out.push({kind:'order',id:o.id,title:'수주 · '+(s.quoteNumber||'')+' · '+s.customer,sub:(s.items||[]).map(i=>i.name+(i.drawing?' ('+i.drawing+')':'')).join(', '),date:s.due||'',status:o.canceled?'취소':delivered>=qty?'납품 완료':'납품 '+delivered+' / '+qty});
  }
  for(const p of (catalog?.suppliers||[])){
   const hay=norm([p.name,p.businessNumber,p.phone,p.contactName].join(' '));if(!hit(hay,ts))continue;
   out.push({kind:'party',id:p.id,title:'거래처 · '+p.name,sub:[p.businessNumber,p.phone,p.contactName].filter(Boolean).join(' · '),status:p.active===false?'사용 중지':''});
  }
  return out.slice(0,limit);
 }
 return {search,terms};
});
