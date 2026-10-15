(function(root){'use strict';
 const storageKey='mesQuoteDraft',valid=id=>typeof id==='string'&&/^[a-f\d-]{36}$/i.test(id);let record,box,status,options={},ready=false;
 function save(){root.sessionStorage.setItem(storageKey,JSON.stringify(record));}
 function unfinished(){return ['mesBulkPending','mesPending','mesLocalRestore'].some(k=>root.sessionStorage.getItem(k));}
 function paint(){if(!box)return;box.hidden=!record?.quoteId;if(!record?.quoteId)return;
  status.textContent='저장 완료 · 견적 '+record.quoteId+(record.changed?' · 화면 입력이 변경됐습니다. 변경값은 보존되지만 저장된 견적에 자동 반영되지 않습니다.':' · 현재 입력은 확인용으로 보존되어 있습니다.')+' 일반 저장과 엑셀 재등록은 중복을 방지하기 위해 차단됩니다.';
 }
 function assertCreate(){if(!ready)throw Error('견적 작성 상태를 보관하지 못했습니다. 브라우저 저장 공간을 확인하세요.');if(unfinished())throw Error('저장 여부가 확인되지 않은 요청이 있습니다. 같은 요청 재시도로 먼저 확인하세요.');if(record.quoteId){paint();throw Error('이미 저장한 견적입니다. 저장된 견적 보기 또는 이 입력으로 새 견적 작성을 선택하세요.');}save();return record.draftId;}
 function complete(result){if(!result?.quoteId)return;const draftId=result.quoteDraftId||record?.draftId;if(!valid(draftId)||!valid(result.quoteId))throw Error('저장된 견적 연결 확인 실패');record={draftId,quoteId:result.quoteId,changed:false};ready=true;paint();try{save();}catch{status.textContent+=' 완료 상태의 브라우저 보관에 실패했습니다. 새로고침 전에 저장된 견적 ID를 확인하세요.';}}
 function startNew(){if(options.busy?.()||unfinished()){options.onError?.('미확인 저장 요청을 먼저 같은 요청으로 확인하세요.');return;}if(!root.confirm('현재 입력을 그대로 유지한 채 별도 새 견적 작성을 시작합니다. 이전 견적은 수정하지 않습니다. 새 견적으로 작성하시겠습니까?'))return;const previous=record;record={draftId:root.crypto.randomUUID(),quoteId:null,changed:false};try{save();ready=true;paint();options.onInfo?.('새 견적 작성을 시작했습니다. 보존된 입력을 확인한 후 저장하세요.');}catch(e){record=previous;options.onError?.('새 작성 상태를 보관하지 못해 전환하지 않았습니다.');paint();}}
 function init(opts={}){options=opts;const host=root.document.getElementById('newQuote');if(!host)return;box=root.document.createElement('div');box.className='quote-draft-status';box.setAttribute('role','status');box.innerHTML='<p></p><div class="actions"><button type="button" class="secondary quote-draft-view">저장된 견적 보기</button><button type="button" class="secondary quote-draft-new">이 입력으로 새 견적 작성</button></div>';host.querySelector('.heading').after(box);status=box.querySelector('p');
  try{const old=JSON.parse(root.sessionStorage.getItem(storageKey)||'null');record=old&&valid(old.draftId)&&(!old.quoteId||valid(old.quoteId))?old:{draftId:root.crypto.randomUUID(),quoteId:null,changed:false};save();ready=true;}catch{record=null;ready=false;options.onError?.('견적 작성 상태 보관 실패로 신규 견적 저장을 중단했습니다.');}
  box.querySelector('.quote-draft-view').onclick=()=>root.MESNavigation.navigate('quotes',{quoteId:record.quoteId}).catch(e=>options.onError?.(e.message));box.querySelector('.quote-draft-new').onclick=startNew;
  const changed=()=>{if(record?.quoteId){record.changed=true;paint();try{save();}catch{}}};host.addEventListener('input',changed);host.addEventListener('change',changed);paint();
 }
 root.QuoteDraftUI={init,assertCreate,complete,id:()=>record?.draftId,current:()=>record?{...record}:null};
})(globalThis);
