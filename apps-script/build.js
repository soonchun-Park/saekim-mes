'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const core=fs.readFileSync(path.join(root,'core.js'),'utf8').replace(/if\(typeof module[^\n]+/g,'');
const material=fs.readFileSync(path.join(root,'material-model.js'),'utf8');
// Isolate module lexical declarations (clone/COMMANDS/etc.) from Core.gs.
const production='(function(){\n'+fs.readFileSync(path.join(root,'production-workflow.js'),'utf8')+'\n})();\n';
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace(/<link[^>]+href="([^"?]+\.css)"[^>]*>/g,(_,file)=>'<style>'+fs.readFileSync(path.join(root,file),'utf8')+'</style>');
html=html.replace(/<script src="([^"?]+\.js)"><\/script>/g,(_,file)=>'<script>'+fs.readFileSync(path.join(root,file),'utf8')+'</script>');
fs.writeFileSync(path.join(__dirname,'Core.gs'),core);
fs.writeFileSync(path.join(__dirname,'MaterialModel.gs'),material);
fs.writeFileSync(path.join(__dirname,'ProductionWorkflow.gs'),production);
fs.writeFileSync(path.join(__dirname,'Index.html'),html);
if(!fs.existsSync(path.join(__dirname,'RowStore.gs')))throw Error('RowStore.gs missing');
console.log('Core.gs / MaterialModel.gs / ProductionWorkflow.gs / Index.html generated locally; no authentication or deployment performed. Production assignments remain local-only.');
