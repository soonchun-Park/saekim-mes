(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PartyModel=api;})(globalThis,function(){
 'use strict';const clone=x=>JSON.parse(JSON.stringify(x));
 const snapshotFields=['id','revision','name','businessNumber','contactName','phone','address','salesEmail','paymentTerms','businessType','businessItem'];
 function string(value,label,max=500){if(value===undefined)return '';if(typeof value!=='string'||value.length>max)throw Error(label+'은 문자열로 입력하세요');return value.trim();}
 function normalizeParty(p){if(!p||typeof p!=='object'||Array.isArray(p))throw Error('거래처 입력 오류');const name=string(p.name,'거래처명');if(!name)throw Error('거래처명 필수 (500자 이내)');const role=p.role===undefined?'supplier':p.role;if(!['customer','supplier','both'].includes(role))throw Error('거래처 역할 오류');const active=p.active===undefined?true:p.active;if(typeof active!=='boolean')throw Error('사용 상태 오류');const out={name,role,active};for(const key of ['businessType','businessItem','businessNumber','contactName','phone','address','paymentTerms','note','bankName','accountNumber','accountHolder','salesEmail','taxEmail'])out[key]=string(p[key],key,key==='address'||key==='note'?2000:500);
  if(out.businessNumber&&!/^(?:\d{10}|\d{3}-\d{2}-\d{5})$/.test(out.businessNumber))throw Error('사업자번호는 숫자 10자리 또는 000-00-00000 형식으로 입력하세요');
  for(const key of ['salesEmail','taxEmail'])if(out[key]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out[key]))throw Error((key==='salesEmail'?'견적/영업 이메일':'세금계산서 이메일')+' 형식 오류');
  if(p.email!==undefined){out.email=string(p.email,'기존 이메일');if(out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))throw Error('기존 이메일 형식 오류');if(p.salesEmail===undefined)out.salesEmail=out.email;}
  if(out.accountNumber&&!/^[0-9]+(?:-[0-9]+)*$/.test(out.accountNumber))throw Error('계좌번호는 숫자와 하이픈으로 된 문자열로 입력하세요');return out;
 }
 const isCustomer=p=>!!p&&(p.role==='customer'||p.role==='both');
 const isSupplier=p=>!!p&&(p.role===undefined||p.role==='supplier'||p.role==='both');
 function customerSnapshot(p){if(!isCustomer(p)||p.active===false)throw Error('사용 중인 매출처를 선택하세요');const n=normalizeParty(p),out={id:p.id,revision:p.revision};for(const k of snapshotFields.slice(2))out[k]=n[k];validateSnapshot(out);return clone(out);}
 function validateSnapshot(p){if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!snapshotFields.includes(k)))throw Error('고객 스냅샷 필드 오류');if(typeof p.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.id)||!Number.isSafeInteger(p.revision)||p.revision<1)throw Error('고객 스냅샷 ID/revision 오류');for(const k of snapshotFields.slice(2))if(typeof p[k]!=='string'&&!(['businessType','businessItem'].includes(k)&&p[k]===undefined))throw Error('고객 스냅샷 문자열 오류');normalizeParty({...p,role:'customer'});return true;}
 function publicSummary(p){const n=normalizeParty(p),out={id:p.id,revision:p.revision,updatedAt:p.updatedAt};for(const k of ['name','role','active','businessNumber','contactName','phone','address','salesEmail','paymentTerms'])out[k]=n[k];return out;}
 function publicDetail(p){return {id:p.id,revision:p.revision,updatedAt:p.updatedAt,...normalizeParty(p)};}
 return {normalizeParty,customerSnapshot,validateSnapshot,isCustomer,isSupplier,publicSummary,publicDetail};
});
