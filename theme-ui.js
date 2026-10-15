/* Only a browser display preference is stored; no business data is changed. */
(()=>{'use strict';
 const key='saekim.mes.theme',root=document.documentElement;
 let chosen='light';try{if(localStorage.getItem(key)==='dark')chosen='dark';}catch{}
 root.dataset.theme=chosen;
 const ready=()=>{
  const button=document.getElementById('themeToggle'),logo=document.querySelector('header .brand img'),icon=document.querySelector('link[rel=icon]');let prior=null;
  const apply=theme=>{root.dataset.theme=theme;const dark=theme==='dark';button.textContent=dark?'밝게':'어둡게';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'화면을 밝게 전환':'화면을 어둡게 전환');button.title=(dark?'라이트 모드로 전환':'다크 모드로 전환')+' (Alt+Shift+D)';if(logo?.dataset[theme])logo.src=logo.dataset[theme];if(icon?.dataset[theme])icon.href=icon.dataset[theme];};
  const toggle=()=>{const theme=root.dataset.theme==='dark'?'light':'dark';apply(theme);try{localStorage.setItem(key,theme);}catch{}};
  button.addEventListener('pointerdown',()=>{const el=document.activeElement;prior=el?.matches('input,textarea')?{el,start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection}:null;});
  button.addEventListener('click',()=>{toggle();if(prior?.el.isConnected){prior.el.focus({preventScroll:true});if(prior.start!==null)prior.el.setSelectionRange(prior.start,prior.end,prior.direction);}prior=null;});
  button.addEventListener('keydown',()=>{prior=null;});
  document.addEventListener('keydown',e=>{if(e.altKey&&e.shiftKey&&e.code==='KeyD'){e.preventDefault();toggle();}});
  apply(chosen);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
