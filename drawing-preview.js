'use strict';
// Staged local preview: no Google access, no automatic data migration.
const path=require('node:path'),{createServer}=require('./server');
const assets={'/':['index-drawing.staged.html','text/html'],'/styles-drawing.staged.css':['styles-drawing.staged.css','text/css'],'/ui-drawing.staged.js':['ui-drawing.staged.js','text/javascript'],'/material-fields.staged.js':['material-fields.staged.js','text/javascript'],'/material-model.js':['material-model.js','text/javascript']};
function preview(options={}){return createServer({dataDir:options.dataDir||path.join(__dirname,'data','material-preview'),assets});}
if(require.main===module)preview().listen(8788,'127.0.0.1',()=>console.log('도면 포함 독립 시험 미리보기 http://127.0.0.1:8788'));
module.exports={preview,assets};
