const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {TextDecoder}=require('node:util');
const MAX_ROWS=5000,MAX_FILE=5*1024*1024;
const error=message=>{throw Error(message);};
function csv(buffer){
 let input;try{input=new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}catch{error('กรุณาบันทึก CSV เป็น UTF-8');}
 if(input.includes('\0'))error('กรุณาบันทึก CSV เป็น UTF-8');
 const first=input.split(/\r?\n/)[0];let quoted=false,counts={',':0,';':0,'\t':0};
 for(let i=0;i<first.length;i++){if(first[i]==='"'){if(quoted&&first[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted&&first[i] in counts)counts[first[i]]++;}
 const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
 const rows=[];let cells=[],cell='',state='start',line=1,rowLine=1;
 const pushCell=()=>{cells.push(cell);cell='';state='start';if(cells.length>20)error('รองรับไม่เกิน 20 คอลัมน์');};
 const pushRow=()=>{pushCell();if(cells.some(v=>v.trim()))rows.push({line:rowLine,cells});cells=[];rowLine=line+1;if(rows.length>MAX_ROWS+1)error('นำเข้าได้สูงสุด 5,000 รายการต่อไฟล์');};
 for(let i=0;i<input.length;i++){
  const c=input[i];if(state==='quoted'){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++;}else state='after';}else{cell+=c;if(c==='\n')line++;}}
  else if(c===delimiter)pushCell();else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;pushRow();line++;}
  else if(c==='"'){if(state!=='start')error('เครื่องหมายคำพูดใน CSV ไม่ถูกต้อง แถว '+line);state='quoted';}
  else if(state==='after'){if(!/\s/.test(c))error('ข้อมูลหลังเครื่องหมายคำพูดไม่ถูกต้อง แถว '+line);}
  else{cell+=c;state='plain';}
  if(cell.length>6000)error('ข้อความในเซลล์ยาวเกินไป แถว '+line);
 }
 if(state==='quoted')error('CSV มีเครื่องหมายคำพูดเปิดค้างไว้');if(cell||cells.length)pushRow();return {rows,sheet:null};
}
function inspectZip(buffer){
 let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)error('ไฟล์ Excel ไม่ถูกต้อง');const count=buffer.readUInt16LE(end+10),size=buffer.readUInt32LE(end+12),offset=buffer.readUInt32LE(end+16);
 if(count>1000||count===65535||offset+size>end)error('ไฟล์ Excel ใหญ่หรือซับซ้อนเกินไป');let pos=offset,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>buffer.length||buffer.readUInt32LE(pos)!==0x02014b50)error('โครงสร้างไฟล์ Excel ไม่ถูกต้อง');
  const flags=buffer.readUInt16LE(pos+8),compressed=buffer.readUInt32LE(pos+20),uncompressed=buffer.readUInt32LE(pos+24),nameLength=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32);total+=uncompressed;
  if(flags&1)error('ไม่รองรับไฟล์ Excel ที่เข้ารหัส');if(uncompressed>20*1024*1024||total>40*1024*1024||uncompressed>Math.max(1024*1024,compressed*200))error('ไฟล์ Excel มีข้อมูลขนาดใหญ่เกินไป');pos+=46+nameLength+extra+comment;
 }
}
async function xlsx(buffer){
 inspectZip(buffer);const Excel=require('exceljs'),book=new Excel.Workbook();
 try{await book.xlsx.load(buffer);}catch{error('อ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจไฟล์ .xlsx');}
 const sheets=book.worksheets.filter(s=>s.state==='visible'&&s.actualRowCount>0);if(sheets.length!==1)error('ไฟล์ Excel ต้องมีชีตข้อมูลที่มองเห็นได้ 1 ชีต');
 const sheet=sheets[0];if(sheet.rowCount>MAX_ROWS+1||sheet.columnCount>20)error('Excel รองรับสูงสุด 5,000 รายการและ 20 คอลัมน์');const rows=[];
 sheet.eachRow((row,line)=>{const cells=[],errors=[];for(let i=1;i<=sheet.columnCount;i++){const v=row.getCell(i).value;if(v==null)cells.push('');else if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')cells.push(String(v));else if(v.formula||v.sharedFormula){cells.push('');errors.push('คอลัมน์ '+i+': ไม่รองรับสูตร Excel กรุณาใช้ค่าแทนสูตร');}else if(v.richText)cells.push(v.richText.map(p=>p.text).join(''));else if(v.hyperlink)cells.push(v.text||v.hyperlink);else{cells.push('');errors.push('คอลัมน์ '+i+': รูปแบบข้อมูลไม่รองรับ');}}if(cells.some(v=>v.trim())||errors.length)rows.push({line,cells,errors});});
 return {rows,sheet:sheet.name};
}
async function parse(file){const buffer=Buffer.from(file.content,'base64');if(!buffer.length||buffer.length>MAX_FILE)error('ไฟล์ต้องมีข้อมูลและขนาดไม่เกิน 5 MB');return file.name.toLowerCase().endsWith('.xlsx')?xlsx(buffer):csv(buffer);}
if(!isMainThread){parse(workerData).then(result=>parentPort.postMessage({result})).catch(e=>parentPort.postMessage({error:e.message}));}
let running=0;
module.exports={MAX_ROWS,MAX_FILE,parseFile(file){
 if(typeof file.name!=='string'||!/^.{1,200}\.(csv|xlsx)$/i.test(file.name))return Promise.reject(Error('รองรับเฉพาะไฟล์ .csv และ .xlsx'));
 if(typeof file.content!=='string'||file.content.length>Math.ceil(MAX_FILE/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content))return Promise.reject(Error('ไฟล์ไม่ถูกต้องหรือใหญ่เกิน 5 MB'));
 if(running>=2)return Promise.reject(Object.assign(Error('กำลังอ่านไฟล์อื่น กรุณาลองอีกครั้ง'),{status:429}));running++;
 return new Promise((resolve,reject)=>{const worker=new Worker(__filename,{workerData:file,resourceLimits:{maxOldGenerationSizeMb:160}});let done=false;const finish=(err,result)=>{if(done)return;done=true;running--;clearTimeout(timer);worker.terminate();err?reject(err):resolve(result);};const timer=setTimeout(()=>finish(Error('อ่านไฟล์นานเกินไป กรุณาลดขนาดไฟล์')),15000);worker.once('message',m=>finish(m.error?Error(m.error):null,m.result));worker.once('error',()=>finish(Error('อ่านไฟล์ไม่สำเร็จ กรุณาลดขนาดหรือบันทึกไฟล์ใหม่')));worker.once('exit',code=>{if(!done)finish(Error('อ่านไฟล์ไม่สำเร็จ ('+code+')'));});});
}};
