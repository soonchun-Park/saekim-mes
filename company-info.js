'use strict';
// 우리 회사(공급자) 정보: 거래명세서 공급자란에 씁니다. 저장소 폴더의 company.json에 보관합니다.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CompanyInfo=api;})(globalThis,function(){
 const FIELDS=[
  ['name','상호'],['businessNumber','사업자등록번호'],['ceo','대표자'],['address','사업장 주소'],
  ['businessType','업태'],['businessItem','종목'],['phone','전화'],['fax','팩스'],['email','이메일'],
  ['bankName','은행'],['accountNumber','계좌번호'],['accountHolder','예금주']
 ];
 function normalize(input){
  if(input==null)return {};
  if(typeof input!=='object'||Array.isArray(input))throw Error('회사 정보 형식 오류');
  const out={};
  for(const [key,label] of FIELDS){const v=input[key];if(v===undefined||v===null||v==='')continue;if(typeof v!=='string')throw Error(label+'은(는) 글자로 입력하세요');const t=v.trim();if(t.length>200)throw Error(label+'은(는) 200자 이내로 입력하세요');if(t)out[key]=t;}
  return out;
 }
 return {FIELDS,normalize};
});
