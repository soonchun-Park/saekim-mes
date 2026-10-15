'use strict';
const crypto=require('node:crypto'),XLSX=require('./xlsx-values'),Party=require('./party-model'),Material=require('./material-model'),PartyInputs=require('./party-inputs');
const {applyCatalog,emptyCatalog}=require('./material-catalog'),Core=require('./core');
const clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const col=(key,label,required=false,help='')=>({key,label,required,help});
const operation=[col('operation','작업',false,'빈칸/신규: 새 기록. 수정: 기존ID 필수, 미리보기에서 별도 선택.'),col('id','기존ID',false,'수정에만 사용. 참조ID 시트에서 복사. 빈 수정값은 기존 값 유지; 삭제/비우기 미지원.')];
const dimensions=[col('length','길이(mm)'),col('width','폭(mm)'),col('height','두께(mm)'),col('diameter','외경(mm)'),col('innerDiameter','내경(mm)')];
const CONFIG={
 quote:{label:'견적 품목',max:100,columns:[col('name','품목명',true),col('drawing','도면/버전',true),col('quantity','수량(개)',true),col('price','합의판매단가(원)',true),col('materialId','소재ID',false,'소재 계산을 사용할 때 등록 소재ID 필수. 빈 비중·단가는 해당 소재 기준값 사용.'),col('supply','공급구분',false,'소재ID 입력 시 도급 또는 사급 필수'),col('shape','형상',false,'봉재 / 판재 / 파이프'),...dimensions,col('allowanceLength','길이여유(mm)',false,'소재 계산 시 필수. 여유 없으면 숫자 0을 명시.'),col('allowanceWidth','폭여유(mm)'),col('allowanceHeight','두께여유(mm)'),col('stockDiameter','발주외경(mm)'),col('stockInnerDiameter','발주내경(mm)'),col('density','비중(g/cm3)'),col('kgRate','소재단가(원/kg)'),col('hours','가공시간(h)'),col('hourRate','시간당단가(원/h)'),col('pricingMode','추천가격기준',false,'원가가산률 / 매출이익률; 추천만 계산하고 합의판매단가는 바꾸지 않음'),col('pricingRate','가산률/이익률(%)'),col('multiplier','수량요율(배수)')]},
 party:{label:'거래처',max:1000,columns:[...operation,col('name','거래처명',true),col('role','역할',true,'매출처 / 매입처 / 매출·매입'),col('businessNumber','사업자번호',false,'텍스트로 입력. 앞자리 0 보존. 숫자 셀은 오류.'),col('businessType','업태'),col('businessItem','종목'),col('contactName','담당자'),col('phone','연락처',false,'텍스트로 입력'),col('address','주소'),col('paymentTerms','결제조건'),col('bankName','은행'),col('accountNumber','계좌번호',false,'텍스트로 입력. 앞자리 0 보존. 숫자 셀은 오류.'),col('accountHolder','예금주'),col('salesEmail','영업이메일'),col('taxEmail','세금이메일'),col('note','메모'),col('active','사용상태',false,'신규 빈칸은 사용; 사용 / 중지. 수정 빈칸은 유지.')]},
 material:{label:'소재',max:1000,columns:[...operation,col('name','재질명',true),col('density','비중(g/cm3)',false,'양수. 빈칸은 미입력; 신규는 정확 등급 공식 기준값이 있을 때만 자동 적용.'),col('kgRate','기준단가(원/kg)',false,'양수. 빈칸을 0원으로 바꾸지 않음.'),col('note','출처메모')]},
 price:{label:'매입처별 단가',max:1000,columns:[...operation,col('materialId','소재ID',true),col('supplierId','매입처ID',true),col('shape','형상',true,'전체 / 봉재 / 판재 / 파이프'),col('scope','치수범위',true,'전체 / 정확'),...dimensions,col('rate','단가',true),col('unit','단위',true,'원/kg / 원/개 / 원/m (자동 환산 안 함)'),col('effectiveDate','적용일',true,'텍스트 YYYY-MM-DD. Excel 날짜 일련번호는 지원하지 않음.'),col('note','메모',true)]}
};
const roles={'매출처':'customer','매입처':'supplier','매출·매입':'both'},shapes={'봉재':'bar','판재':'plate','파이프':'tube','전체':'all'},scopes={'전체':'all','정확':'exact'},units={'원/kg':'KRW/kg','원/개':'KRW/ea','원/m':'KRW/m'};
const getConfig=kind=>{if(!Object.hasOwn(CONFIG,kind))throw Error('업로드 대상 오류');return CONFIG[kind];};
const empty=v=>v===undefined||v===null||v==='';
function text(v,label,required=false,max=500){if(empty(v)){if(required)throw Error(label+' 필수');return undefined;}if(typeof v!=='string'||v.length>max||!v.trim())throw Error(label+'은 '+max+'자 이내 텍스트로 입력하세요');return v.trim();}
function num(v,label,required=false,zero=false,integer=false){if(empty(v)){if(required)throw Error(label+' 필수 (빈칸을 0으로 처리하지 않습니다)');return undefined;}let n=v;if(typeof v==='string'){const t=v.trim();if(!/^(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(t))throw Error(label+' 숫자 형식 오류');n=Number(t.replace(/,/g,''));}if(typeof n!=='number'||!Number.isFinite(n)||(zero?n<0:n<=0)||n>1e12||integer&&!Number.isSafeInteger(n))throw Error(label+'은 '+(zero?'0 이상의':'양수')+(integer?' 정수':' 숫자')+'가 필요합니다');return n;}
function date(v,label){const t=text(v,label,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(t)||!Number.isFinite(Date.parse(t))||new Date(t).toISOString().slice(0,10)!==t)throw Error(label+'은 텍스트 YYYY-MM-DD의 유효한 날짜여야 합니다');return t;}
function choice(v,map,label){const t=text(v,label,true);if(!Object.hasOwn(map,t))throw Error(label+': '+Object.keys(map).join(' / ')+' 중 선택');return map[t];}
function ref(v,list,label){const id=text(v,label,true),m=list.find(x=>x.id===id);if(!m)throw Error(label+'가 현재 등록되어 있지 않습니다');return m;}
const canonical=v=>String(v).trim().toLocaleLowerCase();
const pick=(m,keys)=>Object.fromEntries(keys.filter(k=>m[k]!==undefined).map(k=>[k,clone(m[k])]));
function visible(m){return pick(m,['id','name','role','active','businessNumber','businessType','businessItem','contactName','phone','address','paymentTerms','bankName','accountNumber','accountHolder','salesEmail','taxEmail','note','density','kgRate','densitySource','provenance','materialId','supplierId','shape','scope','dimensions','rate','unit','effectiveDate']);}
function priceKey(p){return JSON.stringify([p.materialId,p.supplierId,p.shape,p.scope,Object.entries(p.dimensions||{}).sort(([a],[b])=>a.localeCompare(b)),p.unit,p.effectiveDate]);}
function parseFile(kind,filename,base64){
 const cfg=getConfig(kind);if(typeof filename!=='string'||filename.length>200||!/^([^\\/\x00-\x1f]+)\.xlsx$/i.test(filename))throw Error('파일명은 .xlsx만 지원합니다 (xls/xlsm/CSV 미지원)');
 if(typeof base64!=='string'||base64.length>Math.ceil(XLSX.MAX_FILE/3)*4||!base64.length||base64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('파일 크기 또는 base64 형식 오류');const bytes=Buffer.from(base64,'base64');if(bytes.toString('base64')!==base64)throw Error('파일 인코딩 오류');const read=XLSX.read(bytes);
 const header=read.rows[0];if(!header||header.row!==1)throw Error('입력 시트 첫 행에 양식의 열 이름이 필요합니다');const mapping=[],seen=new Set();for(let c=0;c<header.cells.length;c++){const label=header.cells[c]?.value;if(empty(label))throw Error('빈 열 이름은 허용하지 않습니다');const column=cfg.columns.find(x=>x.label===label||(x.required&&x.label+' *'===label));if(!column)throw Error('알 수 없는 열: '+String(label));if(seen.has(column.key))throw Error('중복 열: '+label);seen.add(column.key);mapping.push({...column,index:c});}for(const column of cfg.columns.filter(x=>x.required))if(!seen.has(column.key))throw Error('필수 열 누락: '+column.label);
 const data=read.rows.slice(1);if(!data.length||data.length>cfg.max)throw Error('입력 행은 1~'+cfg.max+'개입니다');
 const rows=data.map(r=>{const values={},errors=[];r.cells.forEach((cell,index)=>{if(!cell||empty(cell.value))return;if(!mapping[index]){errors.push('제목 없는 열 '+(index+1)+'에 값이 있습니다');return;}if(cell.value&&typeof cell.value==='object'){errors.push(mapping[index].label+': Excel 오류 셀');return;}values[mapping[index].key]=cell.value;});return {row:r.row,values,errors};});
 return {kind,filename,fileHash:hash(bytes.toString('base64')),mapping,rows};
}
function quoteHeader(header,catalog){
 if(!header||typeof header!=='object')throw Error('새 견적의 거래처·납기·결제조건을 입력하세요');const out={customer:text(header.customer,'거래처',true),due:date(header.due,'납기'),terms:text(header.terms,'결제조건',true)};
 if(header.quoteDate!==undefined)out.quoteDate=date(header.quoteDate,'견적일자');
 if(header.customerPartyId){const customer=ref(header.customerPartyId,catalog.suppliers,'매출처ID');if(!Party.isCustomer(customer)||customer.active===false)throw Error('활성 매출처만 선택하세요');if(customer.name!==out.customer)throw Error('매출처 ID와 이름 불일치');out.customerPartyId=customer.id;out.customerPartyRevision=customer.revision;}
 return out;
}
function quoteItem(v,catalog,origin){
 const item={name:text(v.name,'품목명',true),drawing:text(v.drawing,'도면/버전',true),quantity:num(v.quantity,'수량',true,false,true),price:num(v.price,'합의판매단가',true)};
 const costKeys=CONFIG.quote.columns.slice(4).map(x=>x.key);if(!costKeys.some(k=>!empty(v[k])))return item;
 const master=ref(v.materialId,catalog.materials,'소재ID'),shape=choice(v.shape,{'봉재':'bar','판재':'plate','파이프':'tube'},'형상'),supply=choice(v.supply,{'도급':'contract','사급':'customer'},'공급구분');
 const needed=shape==='plate'?['length','width','height']:shape==='bar'?['length','diameter']:['length','diameter','innerDiameter'];const product=Object.fromEntries(needed.map(k=>[k,num(v[k],dimensions.find(c=>c.key===k).label,true)]));
 for(const key of ['length','width','height','diameter','innerDiameter'].filter(k=>!needed.includes(k)))if(!empty(v[key]))throw Error('선택 형상에서 사용하지 않는 치수: '+key);
 const allowance={length:num(v.allowanceLength,'길이여유',true,true)};if(shape==='plate'){allowance.width=num(v.allowanceWidth,'폭여유',true,true);allowance.height=num(v.allowanceHeight,'두께여유',true,true);}else if(!empty(v.allowanceWidth)||!empty(v.allowanceHeight))throw Error('봉/관에는 폭·두께 여유를 넣지 마세요');
 const overrides={};for(const [key,input]of [['diameter','stockDiameter'],['innerDiameter','stockInnerDiameter']])if(!empty(v[input])){if(shape==='plate'||key==='innerDiameter'&&shape!=='tube')throw Error('발주 외경/내경 형상 불일치');overrides[key]=num(v[input],input,true);}
 const m={name:master.name,masterId:master.id,masterRevision:master.revision,shape,supply,productDimensions:product,allowance,dimensions:Material.deriveDimensions(shape,product,allowance,overrides),provenance:{kind:'user',note:origin+'; 등록 소재 참고, XLSX 값 확인',verified:false},processingIncluded:false};
 if(supply==='contract'){m.density=empty(v.density)?master.density:num(v.density,'비중',true);m.kgRate=empty(v.kgRate)?master.kgRate:num(v.kgRate,'소재단가',true);if(m.density===null||m.density===undefined||m.kgRate===null||m.kgRate===undefined)throw Error('소재 기준 비중/단가가 미입력입니다. 파일에 확인값을 넣으세요');}else if(!empty(v.density)||!empty(v.kgRate))throw Error('사급 소재에는 재료 단가·비중을 계산에 사용하지 않습니다. 해당 칸을 비우세요');
 if(!empty(v.hours)||!empty(v.hourRate)){m.processingIncluded=true;m.hours=num(v.hours,'가공시간',true,true);m.hourRate=num(v.hourRate,'시간당단가',true);}Material.estimateLine(m,item.quantity);Material.cost(m);item.material=m;
 if(['pricingMode','pricingRate','multiplier'].some(k=>!empty(v[k]))){const mode=choice(v.pricingMode,{'원가가산률':'markup','매출이익률':'margin'},'추천가격기준'),rate=num(v.pricingRate,'가산률/이익률',true,true)/100;if(mode==='margin'&&rate>=1)throw Error('매출이익률은 100% 미만');item.pricing={mode,rate,multiplier:num(v.multiplier,'수량요율',true)};}
 return item;
}
function normalizeRow(kind,row,catalog,file){
 const v=row.values,origin='XLSX '+file.filename+' 행 '+row.row+' · SHA256 '+file.fileHash.slice(0,16);
 if(kind==='quote'){const payload=quoteItem(v,catalog,origin);return {operation:'create',type:'quote',payload,identity:JSON.stringify([canonical(payload.name),canonical(payload.drawing),payload.material?.masterId||'',payload.material?.shape||'',payload.material?.dimensions||{}]),before:null,after:payload};}
 const operation=empty(v.operation)||v.operation==='신규'?'create':v.operation==='수정'?'update':null;if(!operation)throw Error('작업은 신규 / 수정 중 선택');const table=kind==='party'?'suppliers':kind==='material'?'materials':'supplierPrices';let existing;
 if(operation==='update')existing=ref(v.id,catalog[table],'기존ID');else if(!empty(v.id))throw Error('기존ID를 지정한 행은 작업을 수정으로 명시하세요');
 let payload={...(existing?{id:existing.id}:{})},identity;
 if(kind==='party'){
  payload.name=text(v.name,'거래처명',true);payload.role=choice(v.role,roles,'역할');
  for(const c of CONFIG.party.columns.filter(c=>!['operation','id','name','role','active'].includes(c.key))){const value=text(v[c.key],c.label,false,['address','note'].includes(c.key)?2000:500);if(value!==undefined)payload[c.key]=c.key==='businessNumber'?PartyInputs.business(value):c.key==='phone'?PartyInputs.phone(value):value;}
  if(!empty(v.active))payload.active=choice(v.active,{'사용':true,'중지':false},'사용상태');
  const normalized=Party.normalizeParty({...existing,...payload});Object.assign(payload,normalized);identity=canonical(payload.name);
  if(catalog.suppliers.some(x=>x.id!==existing?.id&&canonical(x.name)===identity))throw Error('동일 거래처명이 이미 있습니다. 기존ID로 수정을 명시하세요');
  if(payload.businessNumber&&catalog.suppliers.some(x=>x.id!==existing?.id&&x.businessNumber?.replace(/-/g,'')===payload.businessNumber.replace(/-/g,'')))throw Error('동일 사업자번호가 이미 있습니다');
 }else if(kind==='material'){
  payload.name=text(v.name,'재질명',true);for(const [key,label]of [['density','비중'],['kgRate','기준단가']]){const value=num(v[key],label);if(value!==undefined)payload[key]=value;}
  const note=text(v.note,'출처메모');payload.provenance={kind:'user',note:[existing?.provenance?.note,note,origin].filter(Boolean).join(' / ').slice(0,500),verified:false};identity=canonical(payload.name);
  if(catalog.materials.some(x=>x.id!==existing?.id&&canonical(x.name)===identity))throw Error('동일 재질명이 이미 있습니다. 기존ID로 수정을 명시하세요');
 }else{
  const merged={...existing,...payload},m=ref(v.materialId,catalog.materials,'소재ID'),s=ref(v.supplierId,catalog.suppliers,'매입처ID');if(!Party.isSupplier(s)||s.active===false)throw Error('사용 중인 매입처/매출·매입 거래처가 필요합니다');
  Object.assign(payload,{materialId:m.id,supplierId:s.id,shape:choice(v.shape,shapes,'형상'),scope:choice(v.scope,scopes,'치수범위'),rate:num(v.rate,'단가',true),unit:choice(v.unit,units,'단위'),effectiveDate:date(v.effectiveDate,'적용일'),note:text(v.note,'메모',true)});
  if(payload.scope==='exact'){if(payload.shape==='all')throw Error('정확 치수에는 구체적 형상이 필요합니다');const keys=payload.shape==='plate'?['length','width','height']:payload.shape==='bar'?['length','diameter']:['length','diameter','innerDiameter'];payload.dimensions=Object.fromEntries(keys.map(k=>[k,num(v[k],dimensions.find(x=>x.key===k).label,true)]));Material.estimateLine({shape:payload.shape,dimensions:payload.dimensions,supply:'customer'},1);for(const c of dimensions.filter(x=>!keys.includes(x.key)))if(!empty(v[c.key]))throw Error('선택 형상에서 사용하지 않는 치수: '+c.label);}else if(dimensions.some(c=>!empty(v[c.key])))throw Error('전체 치수 범위는 치수 칸을 비우세요');
  identity=priceKey(payload);if(catalog.supplierPrices.some(x=>x.id!==existing?.id&&priceKey(x)===identity))throw Error('같은 소재·매입처·형상·치수·단위·적용일 단가가 있습니다. 기존ID로 수정하세요');
  if(payload.scope==='all'&&merged.dimensions)payload.dimensions=null;
 }
 const type=kind==='party'?'party'+(operation==='create'?'Create':'Update'):kind==='material'?'material'+(operation==='create'?'Create':'Update'):'price'+(operation==='create'?'Create':'Update');
 return {operation,type,payload,identity,before:existing?visible(existing):null,after:{...visible(existing||{}),...payload}};
}
async function preview(file,header,catalog,state,draft=[]){
 const cfg=getConfig(file.kind),rows=[];let quote;
 if(file.kind==='quote'){
  quote=quoteHeader(header,catalog);
  if(!Array.isArray(draft)||draft.length>100)throw Error('작성 중 품목 형식/100품목 한도 오류');
  if(draft.length)Core.apply(Core.empty(),{key:crypto.randomUUID(),revision:0,type:'quote',payload:{...quote,customerPartyId:undefined,customerPartyRevision:undefined,items:draft}},crypto.randomUUID);
 }
 else draft=[];
 for(const row of file.rows){let value;const errors=[...row.errors];try{value=normalizeRow(file.kind,row,catalog,file);if(file.kind!=='quote'){
    // Run the same server validator on a small, isolated catalog for each row.
    const table=file.kind==='party'?'suppliers':file.kind==='material'?'materials':'supplierPrices';const testCatalog={...catalog,[table]:catalog[table].map(e=>e.id===value.payload.id?clone(e):e),audit:[],keys:{}};const trial=applyCatalog(testCatalog,{key:crypto.randomUUID(),revision:testCatalog.revision,type:value.type,payload:value.payload,actor:'XLSX 미리보기 검증'},crypto.randomUUID,true);value.after=visible(trial.result);
   }else Core.apply(Core.empty(),{key:crypto.randomUUID(),revision:0,type:'quote',payload:{customer:'미리보기',due:quote.due,terms:quote.terms,items:[value.payload]}},crypto.randomUUID);
  }catch(e){errors.push(e.message);}
  rows.push({row:row.row,values:row.values,errors,...(value||{})});if(rows.length%10===0)await new Promise(setImmediate);
 }
 const groups=new Map();
 if(file.kind==='quote')for(const item of draft){const key=JSON.stringify([canonical(item.name),canonical(item.drawing),item.material?.masterId||'',item.material?.shape||'',item.material?.dimensions||{}]);for(const row of rows)if(row.identity===key)row.errors.push('작성 중인 견적 품목과 중복입니다');}for(const r of rows){const keys=[];if(r.identity)keys.push('identity:'+r.identity);if(r.payload?.id)keys.push('id:'+r.payload.id);if(file.kind==='party'&&r.payload?.businessNumber)keys.push('business:'+r.payload.businessNumber.replace(/-/g,''));for(const key of keys){const group=groups.get(key)||[];group.push(r);groups.set(key,group);}}
 for(const group of groups.values())if(group.length>1)for(const r of group)if(!r.errors.some(x=>x.startsWith('파일 내 중복')))r.errors.push('파일 내 중복: 행 '+group.map(x=>x.row).join(', '));
 return {kind:file.kind,label:cfg.label,filename:file.filename,fileHash:file.fileHash,quoteHeader:quote||null,quoteDraft:clone(draft),catalogRevision:catalog.revision,stateRevision:state.revision,mapping:file.mapping.map(c=>({column:c.index+1,label:c.label,field:c.key})),rows,validCount:rows.filter(r=>!r.errors.length).length,errorCount:rows.filter(r=>r.errors.length).length,updateCount:rows.filter(r=>r.operation==='update'&&!r.errors.length).length};
}
function template(kind,catalog){getConfig(kind);return require('./bulk-template').template(kind,catalog);}
module.exports={CONFIG,getConfig,parseFile,preview,normalizeRow,quoteHeader,template,hash,priceKey,visible};
