'use strict';
// 화면 위쪽 통합 검색칸: 입력하면 견적·수주·거래처 결과를 보여 주고, 누르면 해당 화면으로 이동합니다.
(function(root){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
 const label={quote:'견적',order:'수주',party:'거래처'};
 function mount(){
  const doc=root.document,header=doc.querySelector('header');if(!header||doc.querySelector('.global-search'))return;
  const wrap=doc.createElement('div');wrap.className='global-search';wrap.setAttribute('role','search');
  wrap.innerHTML='<input type="search" placeholder="견적번호 · 거래처 · 품목 · 도면 검색" aria-label="통합 검색" autocomplete="off"><div class="global-search-results" role="listbox" hidden></div>';
  const actions=header.querySelector('.theme-toggle,button');actions?actions.before(wrap):header.append(wrap);
  const input=wrap.querySelector('input'),box=wrap.querySelector('.global-search-results');let timer=0,seq=0,rows=[];
  const go=r=>{box.hidden=true;input.blur();const nav=root.MESNavigation;if(!nav)return;
   const p=r.kind==='quote'?nav.navigate('quotes',{quoteId:r.id}):r.kind==='order'?nav.navigate('orders',{orderId:r.id}):nav.navigate('parties');p?.catch?.(e=>console.error(e));};
  const paint=()=>{if(!input.value.trim()){box.hidden=true;return;}box.hidden=false;
   box.innerHTML=rows.length?rows.map((r,i)=>'<button type="button" role="option" data-i="'+i+'"><span class="gs-kind gs-'+r.kind+'">'+label[r.kind]+'</span><span class="gs-main"><b>'+esc(r.title)+'</b><small>'+esc([r.sub,r.date,r.amount!=null?won(r.amount):'',r.status].filter(Boolean).join(' · '))+'</small></span></button>').join(''):'<p class="gs-empty">찾는 기록이 없습니다.</p>';};
  const run=async()=>{const q=input.value.trim(),my=++seq;if(!q){rows=[];paint();return;}
   try{const r=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q})}).then(x=>x.json());if(my!==seq)return;rows=r.results||[];paint();}catch{rows=[];paint();}};
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(run,180);});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&rows[0]){e.preventDefault();go(rows[0]);}if(e.key==='Escape'){box.hidden=true;}});
  input.addEventListener('focus',()=>{if(input.value.trim())paint();});
  box.addEventListener('click',e=>{const b=e.target.closest('button[data-i]');if(b)go(rows[Number(b.dataset.i)]);});
  doc.addEventListener('click',e=>{if(!wrap.contains(e.target))box.hidden=true;});
 }
 root.SearchUI={mount};
 const start=()=>{let tries=0;const t=setInterval(()=>{if(root.document.querySelector('header')||++tries>50){clearInterval(t);mount();}},200);};
 if(root.document)root.document.readyState==='loading'?root.document.addEventListener('DOMContentLoaded',start):start();
})(globalThis);
