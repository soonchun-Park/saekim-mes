'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sources=[...fs.readdirSync(__dirname).filter(n=>n.endsWith('.js')),...fs.readdirSync(path.join(__dirname,'apps-script')).filter(n=>n.endsWith('.gs')||n==='build.js').map(n=>'apps-script/'+n)];
for(const name of sources)new vm.Script(fs.readFileSync(path.join(__dirname,name),'utf8'),{filename:name});
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)throw Error('duplicate HTML id');
for(const name of [...html.matchAll(/(?:src|href)="\/(ui.js|styles.css)"/g)].map(m=>m[1]))if(!fs.existsSync(path.join(__dirname,name)))throw Error('missing asset '+name);
const script=fs.readFileSync(path.join(__dirname,'ui.js'),'utf8');for(const m of script.matchAll(/\$\('([^']+)'\)/g))if(!ids.includes(m[1]))throw Error('missing HTML id '+m[1]);
for(const [htmlName,scriptName] of [['index-material.staged.html','ui-material.staged.js'],['index-drawing.staged.html','ui-drawing.staged.js']]){const h=fs.readFileSync(path.join(__dirname,htmlName),'utf8'),keys=[...h.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(keys).size!==keys.length)throw Error('duplicate id '+htmlName);for(const m of h.matchAll(/(?:src|href)="\/([^"?#]+)"/g))if(!fs.existsSync(path.join(__dirname,m[1])))throw Error('missing asset '+m[1]);for(const m of fs.readFileSync(path.join(__dirname,scriptName),'utf8').matchAll(/\$\('([^']+)'\)/g))if(!keys.includes(m[1]))throw Error('missing HTML id '+m[1]);}
console.log('Static lint passed: '+sources.length+' JavaScript/Apps Script syntax files; three UI HTML IDs, local assets and element references. No third-party ESLint dependency.');
