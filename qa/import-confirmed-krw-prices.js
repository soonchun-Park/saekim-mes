'use strict';
// One-off, explicitly approved import. Uses the running server's validated API;
// never writes its in-memory catalog's backing file directly.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const approvalId='Sentinel_86ee93bbda1c8191a13be5da37e18e4e';
const marker='2026-10-13 사용자 원/kg 확인';
const originalNote='소재명만 첨부 소재 리스트에서 참고. 통화 미확인으로 원본 단가 미적용. 밀도는 별도 공식 자료 근거.';
const digest=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
function loadSource(){
 const source=JSON.parse(fs.readFileSync(path.join(root,'reference/material-list-extracted.json'),'utf8'));
 const approval=JSON.parse(fs.readFileSync(path.join(root,'reference/krw-price-confirmation-20261013.json'),'utf8'));
 if(approval.confirmationMessageId!==approvalId||approval.currency!=='KRW'||approval.denominator!=='kg'||!approval.readSucceeded||approval.libraryFileId!==source.source.libraryFileId)throw Error('Explicit price-unit approval/source required');
 const rows=approval.sheetExtract[1].split('\n').slice(2).map(line=>line.split(',')).filter(c=>c[2]);
 if(rows.length!==source.rows.length)throw Error('Library source row count differs');
 for(const c of rows){const row=source.rows.find(r=>r.sourceRow===Number(c[0]));if(!row||row.name!==c[2]||row.sourcePrice!==(c[3]===''?null:Number(c[3]))||row.sourceDensity!==(c[4]===''?null:Number(c[4])))throw Error('Library source differs at row '+c[0]);}
 return {source,approval};
}
function plan(catalog,source){
 const eligible=[],held=[];
 for(const row of source.rows){
  const matches=catalog.materials.filter(m=>m.name===row.name);
  let reason=!row.selectionCandidate?'non-material':row.sourcePrice===null?'missing-price':!(row.sourcePrice>1)?'placeholder-price':['인발','고베'].includes(row.name)?'unidentified-material':matches.length!==1?'exact-name-not-unique':null;
  const m=matches[0];
  if(!reason){
   if(m.kgRate!==null&&m.kgRate!==undefined||m.history.some(h=>h.value?.kgRate!==null&&h.value?.kgRate!==undefined))reason='existing-or-historical-price';
   else if(m.revision!==1||m.history.length!==1||m.provenance?.note!==originalNote)reason='user-edited-or-nonseed-material';
  }
  if(reason){held.push({name:row.name,sourceRow:row.sourceRow,sourcePrice:row.sourcePrice,reason});continue;}
  eligible.push({id:m.id,name:m.name,sourceRow:row.sourceRow,kgRate:row.sourcePrice,key:'approved-krw-20261013:'+m.id});
 }
 return {eligible,held};
}
function makeCommand(catalog,item){
 const m=catalog.materials.find(x=>x.id===item.id);
 return {key:item.key,revision:catalog.revision,type:'materialUpdate',payload:{id:m.id,kgRate:item.kgRate,provenance:{...m.provenance,note:m.provenance.note+' 추가: '+marker+'; quote for yurim(1).xlsx / 소재 리스트 / 키로당단가 / 원본 행 '+item.sourceRow+'. 기준단가만 반영, 원본 비중 미적용.'}},actor:'첨부 단가 승인 반영 ('+approvalId+')'};
}
function writeJournal(file,journal){const next=file+'.tmp',fd=fs.openSync(next,'w');try{fs.writeFileSync(fd,JSON.stringify(journal,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(next,file);}
async function api(base,route,p){const response=await fetch(base+route,{signal:AbortSignal.timeout(15000),...(p?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)}:{})});const body=await response.json();if(!response.ok)throw Error(response.status+' '+JSON.stringify(body));return body;}
async function execute(base,journalFile){
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Loopback-only import');
 const {source}=loadSource();
 const journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):{approvalId,base,sourceHash:digest(source),startedAt:new Date().toISOString(),requests:[]};
 if(journal.approvalId!==approvalId||journal.base!==base||journal.sourceHash!==digest(source))throw Error('Journal/source mismatch');
 // Retry uncertain outcomes byte-for-byte, with the original revision and key.
 for(const r of journal.requests.filter(r=>!r.completedAt)){const response=await api(base,'/api/catalog',{action:'command',command:r.command});r.completedAt=new Date().toISOString();r.revision=response.revision;r.replayed=response.replayed;writeJournal(journalFile,journal);}
 const initial=(await api(base,'/api/catalog')).catalog,initialPlan=plan(initial,source);
 for(const item of initialPlan.eligible){
  const current=(await api(base,'/api/catalog')).catalog;
  const fresh=plan(current,source).eligible.find(x=>x.id===item.id);
  if(!fresh){journal.requests.push({id:item.id,name:item.name,skipped:'changed-since-plan',completedAt:new Date().toISOString()});writeJournal(journalFile,journal);continue;}
  const command=makeCommand(current,fresh),entry={id:item.id,name:item.name,sourceRow:item.sourceRow,command};journal.requests.push(entry);writeJournal(journalFile,journal);
  const result=await api(base,'/api/catalog',{action:'command',command});entry.completedAt=new Date().toISOString();entry.revision=result.revision;entry.replayed=result.replayed;writeJournal(journalFile,journal);
 }
 const final=(await api(base,'/api/catalog')).catalog;
 journal.finishedAt=new Date().toISOString();journal.initialRevision=initial.revision;journal.finalRevision=final.revision;journal.initialPlan=initialPlan;journal.imported=journal.requests.filter(r=>r.command&&r.completedAt).length;writeJournal(journalFile,journal);
 return {journal,catalog:final};
}
async function main(){
 const {source}=loadSource(),base='http://127.0.0.1:8791';
 const dir=path.resolve(root,fs.readFileSync(path.join(__dirname,'krw-price-due-backup-path.txt'),'utf8').trim());
 if(!dir.startsWith(path.join(root,'backups')+path.sep))throw Error('Unexpected backup destination');
 const before=await api(base,'/api/backup');
 if(!process.argv.includes('--apply-live')){console.log(JSON.stringify(plan(before.catalog,source),null,2));return;}
 const beforeFile=path.join(dir,'immediately-before-import.json');if(!fs.existsSync(beforeFile))fs.writeFileSync(beforeFile,JSON.stringify(before,null,2));
 const result=await execute(base,path.join(dir,'import-journal.json'));
 const after=await api(base,'/api/backup');fs.writeFileSync(path.join(dir,'after-import.json'),JSON.stringify(after,null,2));
 const evidence={imported:result.journal.imported,revision:after.catalog.revision,held:result.journal.initialPlan.held,stateUnchanged:digest(before.state)===digest(after.state),partiesUnchanged:digest(before.catalog.suppliers)===digest(after.catalog.suppliers),supplierPricesUnchanged:digest(before.catalog.supplierPrices)===digest(after.catalog.supplierPrices),attachmentsUnchanged:digest(before.attachments)===digest(after.attachments),certificatesUnchanged:digest(before.materialCertificates??null)===digest(after.materialCertificates??null),beforeHash:digest(before),afterHash:digest(after),liveRestarted:false};
 for(const key of ['stateUnchanged','partiesUnchanged','supplierPricesUnchanged','attachmentsUnchanged','certificatesUnchanged'])if(!evidence[key])throw Error('Concurrent change requires review: '+key);
 fs.writeFileSync(path.join(dir,'import-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={loadSource,plan,makeCommand,execute,api,digest,originalNote};
