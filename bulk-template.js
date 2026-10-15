'use strict';
// Styled, value-only templates are built offline; current reference IDs are added
// at download time. No spreadsheet engine runs in the application server.
const fs=require('node:fs'),path=require('node:path'),XLSX=require('./xlsx-values');
const referenceHeader=['종류','ID (복사해서 사용)','이름 / 연결','역할 / 형상','비중 / 단위','기준단가 / 단가','적용일'];
function referenceRows(catalog){return [referenceHeader,
 ...catalog.materials.map(m=>['소재',m.id,m.name,'',m.density??'',m.kgRate??'','']),
 ...catalog.suppliers.map(p=>['거래처',p.id,p.name,({customer:'매출처',supplier:'매입처',both:'매출·매입'})[p.role],p.active===false?'중지':'사용','','']),
 ...catalog.supplierPrices.map(p=>['단가',p.id,p.materialId+' / '+p.supplierId,p.shape,p.unit,p.rate,p.effectiveDate])];}
function template(kind,catalog){
 if(!['quote','party','material','price'].includes(kind))throw Error('업로드 대상 오류');
 const entries=XLSX.unzip(fs.readFileSync(path.join(__dirname,'templates',kind+'.xlsx')));
 const reference=XLSX.unzip(XLSX.write([{name:'참조ID',rows:referenceRows(catalog)}])).get('xl/worksheets/sheet1.xml').data.toString();
 // Remove writer-specific style IDs; inline strings retain IDs and leading zeroes.
 const data=reference.match(/<sheetData>[\s\S]*?<\/sheetData>/)[0].replace(/ s="\d+"/g,'');
 const sheet=entries.get('xl/worksheets/sheet4.xml');
 const header=sheet.data.toString().match(/<row\b[^>]*r="1"[^>]*>[\s\S]*?<\/row>/)?.[0];
 const bodyStyle=sheet.data.toString().match(/<c r="A2"[^>]*s="(\d+)"/)?.[1]||'0';
 const body=data.replace(/<c r=/g,'<c s="'+bodyStyle+'" r=').replace(/<row r="(\d+)">/g,'<row r="$1" ht="42" customHeight="1">');
 const styled=header?body.replace(/<row r="1"[^>]*>[\s\S]*?<\/row>/,header):body;
 sheet.data=Buffer.from(sheet.data.toString().replace(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/,styled).replace(/<dimension\b[^>]*\/>/,''));
 return XLSX.zip([...entries.values()].map(e=>[e.name,e.data.toString()]));
}
module.exports={template,referenceHeader,referenceRows};
