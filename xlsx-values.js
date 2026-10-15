'use strict';
// Restricted, value-only OOXML reader/writer. No spreadsheet calculation engine,
// network requests, shell commands or Excel automation. Unsupported active
// content is rejected, including formulas even when they have cached values.
const zlib=require('node:zlib'),path=require('node:path');
const MAX_FILE=5*1024*1024,MAX_XML=12*1024*1024,MAX_EXPANDED=24*1024*1024;
const crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(b){let crc=0xffffffff;for(const n of b)crc=crcTable[(crc^n)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const fail=text=>{throw Error('XLSX: '+text);};
function unzip(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>MAX_FILE)fail('파일은 5 MiB 이하의 XLSX여야 합니다');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0)fail('ZIP 종료 정보 없음');const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==count||count<1||count>128||offset+size!==end)fail('분할/ZIP64/과다 항목 또는 손상된 ZIP은 지원하지 않습니다');
 const files=new Map(),regions=[];let cursor=offset,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)fail('ZIP 디렉터리 오류');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),packed=bytes.readUInt32LE(cursor+20),unpacked=bytes.readUInt32LE(cursor+24),nlen=bytes.readUInt16LE(cursor+28),elen=bytes.readUInt16LE(cursor+30),clen=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42);
  if(flags&~0x080e||flags&1||![0,8].includes(method)||cursor+46+nlen+elen+clen>end||unpacked>MAX_XML||packed>MAX_FILE||local+30>offset)fail('암호화·압축 형식·크기 오류');
  const name=bytes.subarray(cursor+46,cursor+46+nlen).toString('utf8');cursor+=46+nlen+elen+clen;
  if(!/^[A-Za-z0-9_./\[\]-]+$/.test(name)||name.startsWith('/')||name.includes('..')||files.has(name.toLowerCase()))fail('중복/잘못된 내부 경로');
  if(/vba|macro|externallink|oleobject|embeddings|connections|querytable|activex/i.test(name))fail('매크로·외부 연결·포함 개체는 허용하지 않습니다');
  if(bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)fail('ZIP 헤더 불일치');
  const localNameLen=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),start=local+30+localNameLen+localExtra,stop=start+packed;
  if(stop>offset||bytes.subarray(local+30,local+30+localNameLen).toString('utf8')!==name||regions.some(r=>local<r[1]&&stop>r[0]))fail('ZIP 영역/이름 오류');regions.push([local,stop]);
  if(!(flags&8)&&(bytes.readUInt32LE(local+14)!==crc||bytes.readUInt32LE(local+18)!==packed||bytes.readUInt32LE(local+22)!==unpacked))fail('ZIP 크기 불일치');
  total+=unpacked;if(total>MAX_EXPANDED)fail('압축 해제 한도 24 MiB 초과');
  let data;try{data=method===0?bytes.subarray(start,stop):zlib.inflateRawSync(bytes.subarray(start,stop),{maxOutputLength:Math.min(MAX_XML,unpacked+1)});}catch{fail('압축 해제 실패 또는 압축 폭탄');}
  if(data.length!==unpacked||crc32(data)!==crc)fail('ZIP 길이/CRC 검사 실패');files.set(name.toLowerCase(),{name,data});
 }
 if(cursor!==end)fail('ZIP 디렉터리 길이 오류');return files;
}
function unescapeXML(text){
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))fail('XML 제어 문자');
 return text.replace(/&([^;\s<&]+);/g,(_,e)=>{const basic={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(basic,e))return basic[e];if(!/^#(?:\d+|x[0-9a-fA-F]+)$/.test(e))fail('XML 외부/사용자 엔터티 금지');const n=e[1]==='x'?parseInt(e.slice(2),16):Number(e.slice(1));if(n===0||n>0x10ffff||n>=0xd800&&n<=0xdfff||n<32&&![9,10,13].includes(n))fail('XML 문자 코드 오류');return String.fromCodePoint(n);}).replace(/&(?!(?:[a-zA-Z#]|$))/g,'&');
}
function xml(bytes){
 let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('UTF-8 XML 필요');}
 if(source.length>MAX_XML||/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(source))fail('DTD·외부 엔터티·CDATA는 지원하지 않습니다');
 source=source.replace(/^\ufeff/,'').replace(/^\s*<\?xml\s[^?]*\?>/,'');
 const document={tag:'#document',attrs:{},children:[],text:''},stack=[document];let cursor=0,nodes=0;
 while(cursor<source.length){
  if(source.startsWith('<!--',cursor)){const end=source.indexOf('-->',cursor+4);if(end<0)fail('XML 주석 오류');cursor=end+3;continue;}
  if(source[cursor]!=='<'){let end=source.indexOf('<',cursor);if(end<0)end=source.length;const raw=source.slice(cursor,end);if(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(raw))fail('잘못된 XML 엔터티');const t=unescapeXML(raw);stack.at(-1).text+=t;if(stack.length===1&&t.trim())fail('XML 바깥 텍스트');cursor=end;continue;}
  const match=/^<(\/)?([A-Za-z_][\w:.-]*)([^<>]*?)(\/?)>/.exec(source.slice(cursor));if(!match)fail('지원하지 않거나 손상된 XML');cursor+=match[0].length;
  const [,closing,name,attributes,self]=match;
  if(closing){if(attributes.trim()||self||stack.length===1||stack.at(-1).name!==name)fail('XML 닫는 태그 오류');stack.pop();continue;}
  const attrs={};let a=0;while(a<attributes.length){if(!attributes.slice(a).trim())break;const m=/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/.exec(attributes.slice(a));if(!m||Object.hasOwn(attrs,m[1]))fail('XML 속성 오류');const raw=m[2]??m[3];if(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(raw))fail('XML 속성 엔터티 오류');attrs[m[1]]=unescapeXML(raw);a+=m[0].length;}
  if(++nodes>180000||stack.length>32)fail('XML 복잡도 한도 초과');const node={name,tag:name.split(':').at(-1),attrs,children:[],text:''};stack.at(-1).children.push(node);if(!self)stack.push(node);
 }
 if(stack.length!==1||document.children.length!==1)fail('XML 문서 구조 오류');return document.children[0];
}
const descendants=(node,tag)=>{const found=[];function visit(n){if(n.tag===tag)found.push(n);n.children.forEach(visit);}visit(node);return found;};
const child=(node,tag)=>node.children.find(n=>n.tag===tag);
const textContent=node=>node.text+node.children.map(textContent).join('');
function read(bytes){
 const files=unzip(bytes),parsed=new Map();
 for(const [name,entry]of files)if(name.endsWith('.xml')||name.endsWith('.rels')){
  const tree=xml(entry.data);parsed.set(name,tree);
  if(descendants(tree,'f').length||descendants(tree,'definedName').some(n=>!(name==='xl/workbook.xml'&&n.attrs.name==='_xlnm._FilterDatabase'&&/^\d+$/.test(n.attrs.localSheetId||'')&&n.attrs.hidden==='1'&&/^'?입력'?!\$[A-Z]{1,2}\$1:\$[A-Z]{1,2}\$[1-9]\d{0,3}$/.test(n.text))))fail('수식·정의된 이름을 제거하고 값만 붙여넣어 주세요');
  for(const r of descendants(tree,'Relationship'))if(r.attrs.TargetMode==='External'||/^[a-z][a-z\d+.-]*:/i.test(r.attrs.Target||'')||/externalLink|vbaProject|oleObject|activeX|connections/i.test(r.attrs.Type||''))fail('외부 링크·매크로 연결 금지');
  if(name==='[content_types].xml'&&descendants(tree,'Override').some(n=>/macroEnabled|vbaProject|externalLink/i.test(n.attrs.ContentType||'')))fail('매크로 형식 금지');
 }
 const workbook=parsed.get('xl/workbook.xml'),relations=parsed.get('xl/_rels/workbook.xml.rels');if(!workbook||!relations||!parsed.has('[content_types].xml'))fail('Excel 통합문서 구성 누락');
 const sheets=descendants(workbook,'sheet'),input=sheets.filter(s=>s.attrs.name==='입력');if(input.length!==1)fail('양식의 「입력」 시트가 정확히 하나 필요합니다');
 const ids=new Set();for(const r of descendants(relations,'Relationship')){if(ids.has(r.attrs.Id))fail('중복 관계 ID');ids.add(r.attrs.Id);}
 const relation=descendants(relations,'Relationship').find(r=>r.attrs.Id===input[0].attrs['r:id']);if(!relation||!relation.attrs.Type?.endsWith('/worksheet'))fail('입력 시트 연결 오류');
 const target=path.posix.normalize(relation.attrs.Target?.startsWith('/')?relation.attrs.Target.slice(1):'xl/'+relation.attrs.Target).toLowerCase();if(!target.startsWith('xl/worksheets/')||!parsed.has(target))fail('입력 시트 경로 오류');
 const sheet=parsed.get(target);if(descendants(sheet,'mergeCell').length)fail('입력 시트의 병합 셀을 해제하세요');
 const shared=(parsed.get('xl/sharedstrings.xml')?descendants(parsed.get('xl/sharedstrings.xml'),'si'):[]).map(si=>descendants(si,'t').map(textContent).join(''));if(shared.some(s=>s.length>2000)||shared.length>50000)fail('공유 문자열 한도 초과');
 const rows=[],seen=new Set();
 for(const row of descendants(sheet,'row')){
  const rn=Number(row.attrs.r);if(!Number.isInteger(rn)||rn<1||rn>10000||seen.has(rn))fail('시트 행 번호 오류');seen.add(rn);const cells=[];
  for(const c of row.children.filter(x=>x.tag==='c')){
   const m=/^([A-Z]{1,3})([1-9]\d*)$/.exec(c.attrs.r||'');if(!m||Number(m[2])!==rn)fail('셀 주소 오류');let col=0;for(const ch of m[1])col=col*26+ch.charCodeAt(0)-64;if(col>64||cells[col-1]!==undefined)fail('열 한도 또는 중복 셀');
   const type=c.attrs.t||'n',v=child(c,'v');let value=null;
   if(type==='inlineStr'){const inline=child(c,'is');value=inline?descendants(inline,'t').map(textContent).join(''):'';}
   else if(type==='s'){const index=Number(v?.text);if(!v||!/^\d+$/.test(v.text)||index>=shared.length)fail('공유 문자열 인덱스 오류');value=shared[index];}
   else if(type==='n'){if(v?.text){if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(v.text)||!Number.isFinite(Number(v.text)))fail('숫자 셀 오류');value=Number(v.text);}}
   else if(type==='d'||type==='str'){value=v?.text||'';}
   else if(type==='b'){if(!['0','1'].includes(v?.text))fail('논리 셀 오류');value=v.text==='1';}
   else if(type==='e')value={cellError:v?.text||'Excel 오류'};
   else fail('지원하지 않는 셀 형식: '+type);
   if(typeof value==='string'&&value.length>2000)fail('셀 문자열은 2000자 이내');cells[col-1]={value,type};
  }
  if(cells.some(c=>c?.value!==null&&c?.value!==''))rows.push({row:rn,cells});
 }
 rows.sort((a,b)=>a.row-b.row);if(rows.length>1001)fail('입력은 최대 1000행입니다');return {rows,sheets:sheets.map(x=>x.attrs.name)};
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function column(n){let text='';for(n++;n;n=Math.floor((n-1)/26))text=String.fromCharCode(65+(n-1)%26)+text;return text;}
function zip(entries){let offset=0;const local=[],central=[];for(const [name,text]of entries){const data=Buffer.isBuffer(text)?text:Buffer.from(text,'utf8'),packed=zlib.deflateRawSync(data),nb=Buffer.from(name),crc=crc32(data),lh=Buffer.alloc(30),ch=Buffer.alloc(46);lh.writeUInt32LE(0x04034b50);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x800,6);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(packed.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(nb.length,26);ch.writeUInt32LE(0x02014b50);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x800,8);ch.writeUInt16LE(8,10);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(packed.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(nb.length,28);ch.writeUInt32LE(offset,42);local.push(lh,nb,packed);central.push(ch,nb);offset+=lh.length+nb.length+packed.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);}
function write(sheets){
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const entries=[['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets>'+sheets.map((s,i)=>'<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="styles" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>'],['xl/styles.xml','<styleSheet xmlns="'+ns+'"><fonts count="1"><font><sz val="11"/><name val="Malgun Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']];
 sheets.forEach((s,i)=>entries.push(['xl/worksheets/sheet'+(i+1)+'.xml','<worksheet xmlns="'+ns+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="64" width="22" customWidth="1" style="0"/></cols><sheetData>'+s.rows.map((row,r)=>'<row r="'+(r+1)+'">'+row.map((v,c)=>v===undefined||v===null?'':typeof v==='number'?'<c r="'+column(c)+(r+1)+'" t="n" s="1"><v>'+v+'</v></c>':'<c r="'+column(c)+(r+1)+'" t="inlineStr" s="0"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>']));return zip(entries);
}
module.exports={MAX_FILE,MAX_XML,MAX_EXPANDED,read,write,zip,unzip,xml,crc32};
