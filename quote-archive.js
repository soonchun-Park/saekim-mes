(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QuoteArchive=api;})(globalThis,function(){'use strict';
// Historical quotation import. Original numbers/relative delivery terms are
// retained, and these reference records cannot become an order implicitly.
function text(v,label,max=500){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(label+' 확인 필요');return v;}
function validate(q){
 const s=q.sourceQuote;if(!s||s.schema!==1||s.mode!=='reference')throw Error('원문 견적 형식 오류');
 text(s.number,'원문 견적번호',100);if(!/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 ._/-]*$/.test(s.number)||q.quoteNumber!==s.number)throw Error('원문 견적번호 불일치');
 text(s.deliveryText,'원문 납기');if(q.due!==s.deliveryText)throw Error('원문 납기 불일치');text(s.title,'원문 건명');text(s.reviewedBy,'원문 검토자');
 if(!Array.isArray(s.files)||!s.files.length||s.files.length>20)throw Error('원문 출처 파일 필요');
 for(const f of s.files){text(f.name,'원문 파일명',200);text(f.path,'원문 상대 경로',1000);if(!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('원문 SHA256 오류');}
 if(!Array.isArray(s.conditions)||s.conditions.length>20)throw Error('원문 조건 형식 오류');for(const c of s.conditions){text(c.label,'조건명',100);text(c.value,'조건 내용',2000);}
 if(!Array.isArray(s.lines)||s.lines.length!==q.items.length)throw Error('원문 품목 대조 오류');for(const l of s.lines)for(const k of ['material','specification','finish','unit','note'])if(l[k]!==undefined&&(typeof l[k]!=='string'||l[k].length>1000))throw Error('원문 품목 정보 오류');
 const supply=q.items.reduce((n,i)=>n+i.quantity*i.price,0);for(const n of [s.supplyAmount,s.vatAmount,s.totalAmount])if(!Number.isSafeInteger(n)||n<0)throw Error('원문 금액 오류');
 if(!Number.isFinite(s.vatRate)||s.vatRate<0||s.vatRate>1||s.supplyAmount!==supply||s.vatAmount!==Math.round(supply*s.vatRate)||s.totalAmount!==supply+s.vatAmount)throw Error('원문 공급가액·부가세·합계 불일치');
 if(!q.customerPartyId||!q.customerSnapshot)throw Error('원문 견적 거래처 연결 필요');return s;
}
function identity(state,p){
 text(p.quoteDate,'원문 견적일자');if(!/^\d{4}-\d{2}-\d{2}$/.test(p.quoteDate)||!Number.isFinite(Date.parse(p.quoteDate))||new Date(p.quoteDate).toISOString().slice(0,10)!==p.quoteDate)throw Error('원문 견적일자 오류');
 const number=p.sourceQuote?.number;text(number,'원문 견적번호',100);if([...state.quotes,...Object.values(state.keys).map(k=>k.result)].some(q=>q?.quoteNumber===number))throw Error('이미 등록·예약된 원문 견적번호');
 return {quoteNumber:number,quoteDate:p.quoteDate,sourceQuote:JSON.parse(JSON.stringify(p.sourceQuote))};
}
return {validate,identity};
});
