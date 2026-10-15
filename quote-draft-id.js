'use strict';
const valid=id=>typeof id==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
// Both creation routes bind one browser drafting session to one immutable quote.
// Request-key replay still runs through the original exact-body checks.
function assertUnused(state,draftId,requestKey){
 if(draftId===undefined)return;
 if(!valid(draftId))throw Error('견적 작성 식별자 형식 오류');
 for(const [key,saved]of Object.entries(state.keys)){
  if(saved.retired)continue;const cmd=JSON.parse(saved.body);
  if(cmd.type==='quote'&&cmd.quoteDraftId===draftId&&key!==requestKey){
   const e=Error('이 작성 건은 이미 견적 '+saved.result.id+'로 저장됐습니다. 저장된 견적을 확인하거나 새 견적 작성을 명시적으로 선택하세요.');
   e.quoteId=saved.result.id;e.quoteDraftId=draftId;e.errorCode='QUOTE_DRAFT_SAVED';throw e;
  }
 }
}
module.exports={valid,assertUnused};
