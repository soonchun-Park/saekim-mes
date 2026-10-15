(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PartyInputs=api;})(globalThis,function(){
 'use strict';
 function business(value){const raw=String(value??'');if(!/^[\d-]*$/.test(raw))return raw;const d=raw.replace(/-/g,'');if(d.length>10)return raw;return d.length<=3?d:d.length<=5?d.slice(0,3)+'-'+d.slice(3):d.slice(0,3)+'-'+d.slice(3,5)+'-'+d.slice(5);}
 function phone(value){const raw=String(value??'');if(!/^[\d-]+$/.test(raw))return raw;const d=raw.replace(/-/g,'');if(/^02\d{7,8}$/.test(d))return d.slice(0,2)+'-'+d.slice(2,-4)+'-'+d.slice(-4);if(/^(?:010|070)\d{8}$/.test(d))return d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7);if(/^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/.test(d))return d.slice(0,3)+'-'+d.slice(3,-4)+'-'+d.slice(-4);if(/^1[568]\d{6}$/.test(d))return d.slice(0,4)+'-'+d.slice(4);return raw;}
 function position(value,count){if(count<=0)return 0;let found=0;for(let i=0;i<value.length;i++)if(/\d/.test(value[i])&&++found===count)return i+1;return value.length;}
 function mount(input,kind){if(!input||input._partyFormat)return;const format=kind==='business'?business:phone;input._partyFormat=true;if(kind==='business')input.inputMode='numeric';
  function update(){if(input._partyComposing)return;const old=input.value,start=input.selectionStart??old.length,end=input.selectionEnd??start,next=format(old);if(next===old)return;const before=n=>(old.slice(0,n).match(/\d/g)||[]).length;input.value=next;input.setSelectionRange(position(next,before(start)),position(next,before(end)));}
  input.addEventListener('compositionstart',()=>input._partyComposing=true);input.addEventListener('compositionend',()=>{input._partyComposing=false;update();});
  input.addEventListener('beforeinput',e=>{if(input._partyComposing||input.selectionStart!==input.selectionEnd||!/^\d[\d-]*$/.test(input.value)||format(input.value)!==input.value)return;const p=input.selectionStart,back=e.inputType==='deleteContentBackward'&&input.value[p-1]==='-',forward=e.inputType==='deleteContentForward'&&input.value[p]==='-';if(!back&&!forward)return;const index=back?p-2:p+1;if(index<0||!/[0-9]/.test(input.value[index]||''))return;e.preventDefault();const caret=back?index:p;input.value=input.value.slice(0,index)+input.value.slice(index+1);input.setSelectionRange(caret,caret);update();input.dispatchEvent(new Event('input',{bubbles:true}));});
  input.addEventListener('input',update);input.value=format(input.value);
 }
 return {business,phone,mount,position};
});
