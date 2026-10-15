import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('qa/reports/rfq-test.xlsx'));
const s=wb.worksheets.getItem('견적요청서');
wb.recalculate();
const checks={before:s.getRange('H15:I15').values,totals:s.getRange('I31:I33').values};
s.getRange('H15').values=[[0]];wb.recalculate();checks.zero=s.getRange('I15').values;
s.getRange('H15').values=[[7000]];wb.recalculate();checks.amount=s.getRange('I15').values;checks.calculatedTotals=s.getRange('I31:I33').values;
const img=await wb.render({sheetName:'견적요청서',range:'A1:J43',scale:1,format:'png'});await fs.writeFile('qa/reports/rfq-workbook.png',new Uint8Array(await img.arrayBuffer()));await fs.writeFile('qa/reports/rfq-workbook-checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
