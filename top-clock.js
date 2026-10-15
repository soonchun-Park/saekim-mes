(function(root){'use strict';
const zone='Asia/Seoul',formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}),weekday=new Intl.DateTimeFormat('ko-KR',{timeZone:zone,weekday:'long'});
function parts(now=new Date()){const p=Object.fromEntries(formatter.formatToParts(now).map(x=>[x.type,x.value]));return {...p,date:p.year+'.'+p.month+'.'+p.day,weekday:weekday.format(now),iso:p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'+09:00'};}
let timer=null,host=null;
function update(now=new Date()){if(!host?.isConnected)return;const p=parts(now);for(const name of ['day','hour','minute','second']){const e=host.querySelector('[data-clock="'+name+'"]');if(e.textContent!==p[name])e.textContent=p[name];}const date=p.date+' '+p.weekday;if(host.querySelector('.top-clock-date').textContent!==date)host.querySelector('.top-clock-date').textContent=date;host.dateTime=p.iso;host.setAttribute('aria-label',date+' '+p.hour+'시 '+p.minute+'분 '+p.second+'초 · 한국 시간');}
function stop(){if(timer!==null)clearTimeout(timer);timer=null;}
function start(){stop();update();if(!root.document.hidden)timer=setTimeout(start,1000-Date.now()%1000+10);}
function mount(){host=root.document.getElementById('topClock');if(!host)return;start();}
if(root.document){root.document.addEventListener('visibilitychange',()=>root.document.hidden?stop():start());root.addEventListener('pagehide',stop);root.addEventListener('pageshow',mount);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
const api={parts,mount,update,stop};if(typeof module==='object'&&module.exports)module.exports=api;else root.TopClock=api;
})(globalThis);
