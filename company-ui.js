'use strict';
// 거래처 관리 화면 위쪽의 "우리 회사 정보" 입력 칸(거래명세서 공급자란에 사용).
(function(root){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function mount(){
  const host=root.document.getElementById('screen-parties');if(!host||host.querySelector('.company-info'))return;
  const box=root.document.createElement('details');box.className='company-info card';
  const fields=root.CompanyInfo.FIELDS;
  box.innerHTML='<summary><b>우리 회사 정보</b> <small>거래명세서 공급자란에 들어갑니다</small></summary><form class="grid">'+fields.map(([k,l])=>'<label>'+esc(l)+'<input name="'+k+'" maxlength="200" autocomplete="off"></label>').join('')+'</form><div class="actions"><button type="button" class="company-save">회사 정보 저장</button><span class="company-status hint" role="status"></span></div>';
  host.prepend(box);
  const form=box.querySelector('form'),status=box.querySelector('.company-status');
  try{const c=(await fetch('/api/company').then(r=>r.json())).company||{};for(const [k] of fields)form.elements[k].value=c[k]||'';if(!c.name)box.open=true;status.textContent=c.name?'저장된 정보: '+c.name:'아직 입력하지 않았습니다.';}catch{status.textContent='회사 정보를 불러오지 못했습니다.';}
  box.querySelector('.company-save').onclick=async()=>{const company={};for(const [k] of fields)company[k]=form.elements[k].value;
   try{const r=await fetch('/api/company',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company})});const j=await r.json();if(!r.ok)throw Error(j.error||'저장 실패');status.textContent='저장했습니다: '+(j.company.name||'(상호 미입력)');}catch(e){status.textContent='저장하지 못했습니다: '+e.message;}};
 }
 root.CompanyUI={mount};
 const start=()=>{let tries=0;const t=setInterval(()=>{if(root.document.getElementById('screen-parties')||++tries>50){clearInterval(t);mount();}},200);};
 if(root.document)root.document.readyState==='loading'?root.document.addEventListener('DOMContentLoaded',start):start();
})(globalThis);
