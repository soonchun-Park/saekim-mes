'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./bulk-import-model'),Core=require('./core'),{applyCatalogBatch,validateCatalog}=require('./material-catalog');
const uuid=s=>typeof s==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(s);
function createBulkImportService({dir,getState,getCatalog,replaceCatalog,commitState,context,backup,options={}}){
 const jobs=new Map(),inFlight=new Map();
 function cleanup(){const now=Date.now();for(const [id,j]of jobs)if(now-j.createdAt>30*60*1000)jobs.delete(id);while(jobs.size>4)jobs.delete(jobs.keys().next().value);}
 function requestOf(p){if(!uuid(p.key)||!uuid(p.previewId)||!Array.isArray(p.selectedRows)||!p.selectedRows.length||p.selectedRows.length>1000||p.selectedRows.some(n=>!Number.isInteger(n)||n<2)||new Set(p.selectedRows).size!==p.selectedRows.length||typeof p.approveUpdates!=='boolean')throw Error('확정 요청 키·선택 행·수정 승인 형식 오류');return {key:p.key,previewId:p.previewId,selectedRows:[...p.selectedRows].sort((a,b)=>a-b),approveUpdates:p.approveUpdates};}
 function receipt(p){for(const state of [getState(),getCatalog()]){const saved=state.keys[p.key];if(!saved)continue;if(saved.retired)throw Error('복원으로 무효화된 일괄 요청입니다');const cmd=JSON.parse(saved.body),meta=cmd.bulkImport;if(!meta||JSON.stringify(meta.request)!==JSON.stringify(p))throw Error('일괄 요청키 내용 충돌');const result=cmd.type==='quote'?{kind:'quote',rowCount:meta.rowCount,createdCount:1,updatedCount:0,quoteId:saved.result.id,quoteDraftId:cmd.quoteDraftId,backupName:meta.backupName}:saved.result;return {ok:true,...result,replayed:true};}return null;}
 function writeBackup(name){const file=path.join(dir,name),bytes=JSON.stringify(backup());if(Buffer.byteLength(bytes)>48000000)throw Error('일괄 저장 전 백업이 48 MB를 초과합니다. 먼저 별도 보관 계획이 필요합니다');if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==bytes)throw Error('같은 요청키의 백업 상태가 달라졌습니다');return;}const tmp=file+'.tmp',fd=fs.openSync(tmp,'w');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
 async function commit(p){
  const existing=receipt(p);if(existing)return existing;
  cleanup();const job=jobs.get(p.previewId);if(!job)throw Error('미리보기가 만료되었거나 서버가 다시 시작되었습니다. 파일을 다시 미리보기 하세요');
  const currentState=getState(),currentCatalog=getCatalog(),preview=job.preview;
  if(preview.kind==='quote')require('./quote-draft-id').assertUnused(currentState,preview.quoteDraftId,p.key);
  if(preview.stateRevision!==currentState.revision||preview.catalogRevision!==currentCatalog.revision)throw Error('미리보기 이후 데이터가 변경되었습니다. 저장하지 않았습니다. 다시 미리보기 하세요');
  const selected=p.selectedRows.map(n=>preview.rows.find(r=>r.row===n));if(selected.some(r=>!r||r.errors.length))throw Error('오류 행 또는 미리보기에 없는 행은 저장할 수 없습니다');if(selected.some(r=>r.operation==='update')&&!p.approveUpdates)throw Error('기존 기록의 선택한 수정 내용을 별도로 승인하세요');
  const fingerprint=Model.hash({kind:preview.kind,fileHash:preview.fileHash,header:preview.quoteHeader,draft:preview.quoteDraft,rows:p.selectedRows});
  for(const state of [currentState,currentCatalog])for(const saved of Object.values(state.keys)){if(saved.retired)continue;const cmd=JSON.parse(saved.body);if(cmd.bulkImport?.fingerprint===fingerprint)throw Error('같은 파일·조건·선택 행을 이미 저장했습니다. 목록을 확인하세요');}
  const backupName='before-bulk-'+p.key+'.json',meta={request:p,fingerprint,filename:preview.filename,fileHash:preview.fileHash,rowCount:selected.length,backupName};let next,result;
  if(preview.kind==='quote'){
   if(selected.length+preview.quoteDraft.length>100)throw Error('작성 중 품목과 선택 품목 합계는 100개 이내입니다');
   const cmd={key:p.key,revision:currentState.revision,type:'quote',...(preview.quoteDraftId?{quoteDraftId:preview.quoteDraftId}:{}),payload:{...preview.quoteHeader,items:[...preview.quoteDraft,...selected.map(r=>r.payload)]},bulkImport:meta};
   next=Core.apply(currentState,cmd,crypto.randomUUID,context);result={kind:'quote',rowCount:selected.length,createdCount:1,updatedCount:0,quoteId:next.keys[p.key].result.id,quoteDraftId:preview.quoteDraftId,backupName};
  }else{
   const commands=selected.map((row,index)=>{const cmd={key:'bulk-row:'+p.key+':'+row.row,revision:currentCatalog.revision+index,type:row.type,payload:row.payload,actor:'XLSX '+preview.filename+' 행 '+row.row+' / '+preview.fileHash.slice(0,16)};return cmd;});const batch=await applyCatalogBatch(currentCatalog,commands);next=batch.state;const ids=batch.results.map(r=>r.id);
   result={kind:preview.kind,rowCount:selected.length,createdCount:selected.filter(r=>r.operation==='create').length,updatedCount:selected.filter(r=>r.operation==='update').length,ids,backupName};
   const cmd={key:p.key,revision:currentCatalog.revision,type:'bulkImport',bulkImport:meta};next.revision++;next.audit.push({id:crypto.randomUUID(),key:p.key,type:'bulkImport',revision:next.revision,time:new Date().toISOString(),actor:'사용자 XLSX 일괄 확정'});Object.defineProperty(next.keys,p.key,{value:{body:JSON.stringify(cmd),result},enumerable:true,writable:true});validateCatalog(next);
  }
  // Cooperative validation above can overlap other reads/writes. Recheck both
  // revisions immediately before the single synchronous atomic commit.
  if(getState().revision!==currentState.revision||getCatalog().revision!==currentCatalog.revision)throw Error('검증 중 다른 저장이 발생했습니다. 이번 일괄 저장은 0건입니다. 다시 미리보기 하세요');
  try{writeBackup(backupName);if(options.beforeBulkCommit)options.beforeBulkCommit();if(preview.kind==='quote')commitState(next);else replaceCatalog(next);if(options.afterBulkCommit)options.afterBulkCommit();}catch(e){e.retryable=true;throw e;}
  jobs.delete(p.previewId);return {ok:true,...result,replayed:false};
 }
 return {
  template:kind=>Model.template(kind,getCatalog()),
  async request(p){
   if(p.action==='preview'){
    cleanup();if(jobs.size>=4)jobs.delete(jobs.keys().next().value);
    const file=Model.parseFile(p.kind,p.filename,p.base64),catalog=getCatalog(),state=getState(),preview=await Model.preview(file,p.quoteHeader,catalog,state,p.quoteDraft);
    if(file.kind==='quote'){require('./quote-draft-id').assertUnused(state,p.quoteDraftId);preview.quoteDraftId=p.quoteDraftId;}
    const previewId=crypto.randomUUID();jobs.set(previewId,{createdAt:Date.now(),preview});return {ok:true,previewId,...preview,expiresInMinutes:30};
   }
   if(p.action==='cancel'){if(uuid(p.previewId))jobs.delete(p.previewId);return {ok:true,savedRows:0};}
   if(p.action==='commit'){
    const request=requestOf(p),running=inFlight.get(request.key);if(running){if(running.body!==JSON.stringify(request))throw Error('진행 중 요청키 내용 충돌');return running.promise;}
    const promise=commit(request);inFlight.set(request.key,{body:JSON.stringify(request),promise});try{return await promise;}finally{inFlight.delete(request.key);}
   }
   throw Error('일괄 업로드 action 오류');
  }
 };
}
module.exports={createBulkImportService};
