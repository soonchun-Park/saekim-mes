'use strict';
// Separate optional preview. Never opens or resets the user's data/state.json.
const path=require('node:path'),{createServer}=require('./server');
const assets={'/':['index-material.staged.html','text/html'],'/styles-material.staged.css':['styles-material.staged.css','text/css'],'/ui-material.staged.js':['ui-material.staged.js','text/javascript'],'/material-fields.staged.js':['material-fields.staged.js','text/javascript'],'/material-model.js':['material-model.js','text/javascript']};
function preview(options={}){return createServer({dataDir:options.dataDir||path.join(__dirname,'data','material-preview'),assets});}
if(require.main===module)preview().listen(8788,'127.0.0.1',()=>console.log('별도 소재 기능 미리보기 http://127.0.0.1:8788 · 기존8787/데이터 변경 없음'));
module.exports={preview,assets};
