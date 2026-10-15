'use strict';
const X=require('../xlsx-values'),M=require('../bulk-import-model');
function edit(bytes,rows,kind){const entries=X.unzip(bytes),columns=M.CONFIG[kind].columns,source=X.unzip(X.write([{name:'입력',rows:[columns.map(c=>c.label+(c.required?' *':'')),...rows.map(r=>columns.map(c=>r[c.key]??''))]}])).get('xl/worksheets/sheet1.xml').data.toString(),data=source.match(/<sheetData>[\s\S]*?<\/sheetData>/)[0],sheet=entries.get('xl/worksheets/sheet1.xml');sheet.data=Buffer.from(sheet.data.toString().replace(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/,data));return X.zip([...entries.values()].map(e=>[e.name,e.data.toString()]));}
function change(bytes,fn){return X.zip([...X.unzip(bytes).values()].map(e=>[e.name,fn(e.name,e.data.toString())]));}
module.exports={edit,change};
