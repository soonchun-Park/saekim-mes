'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createCatalogStore}=require('../material-catalog');
const root=path.resolve(__dirname,'..');
function seed(){
 if(path.basename(root)!=='mes-erp-material-cert-lab')throw Error('독립 성적서 시험 프로젝트에서만 실행하세요.');
 const dir=path.join(root,'data','material-cert-test');fs.mkdirSync(dir,{recursive:true});
 const store=createCatalogStore(dir);if(store.read().revision!==0)throw Error('이미 사용 중인 시험 데이터에는 초기 자료를 쓰지 않습니다.');
 const reference=JSON.parse(fs.readFileSync(path.join(root,'reference','material-list-extracted.json'),'utf8'));
 for(const r of reference.rows.filter(r=>r.selectionCandidate))store.command({key:'reference-name:'+crypto.randomUUID(),revision:store.read().revision,type:'materialCreate',payload:{name:r.name,kgRate:null,provenance:{kind:'user',note:'소재명만 첨부 소재 리스트에서 참고. 통화 미확인으로 원본 단가 미적용. 밀도는 별도 공식 자료 근거.',verified:false}}});
 const result=store.read();return {materials:result.materials.length,densities:result.materials.filter(m=>m.density!==null).length,prices:result.materials.filter(m=>m.kgRate!==null).length,revision:result.revision};
}
if(require.main===module)console.log(JSON.stringify(seed()));
module.exports={seed};
