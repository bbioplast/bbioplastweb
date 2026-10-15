const {randomBytes}=require('node:crypto');
const {parseFile}=require('./product-import-parser');
const headers=['sku','name','category','description','image','price','stock','active','popular'];
const aliases={sku:'sku',name:'name',category:'category',category_id:'category',description:'description',image:'image',price:'price',stock:'stock',active:'active',popular:'popular','รหัสสินค้า':'sku','ชื่อสินค้า':'name','หมวดหมู่':'category','หมวดหมู่สินค้า':'category','รายละเอียด':'description','รูปภาพ':'image','ลิงก์รูปภาพ':'image','ราคา':'price','สต็อก':'stock','แสดงหน้าร้าน':'active','สินค้ายอดนิยม':'popular'};
const key=v=>String(v).trim().toLocaleLowerCase('en-US');
const blank=v=>v===undefined||v.trim()==='';
const yes=v=>{const k=key(v);if(['true','1','yes','แสดง','ใช่'].includes(k))return 1;if(['false','0','no','ซ่อน','ไม่'].includes(k))return 0;throw Error('ใช้ true/false หรือ 1/0');};
function amount(v,price){if(['ตามสั่ง','ขอราคา','null'].includes(key(v)))return null;if(!/^\d+(?:\.\d{1,2})?$/.test(v.trim())||(!price&&!/^\d+$/.test(v.trim())))throw Error(price?'ราคาต้องเป็นเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง':'สต็อกต้องเป็นจำนวนเต็มไม่ติดลบ');const [whole,decimal='']=v.trim().split('.'),n=price?Number(whole)*100+Number(decimal.padEnd(2,'0')):Number(whole);if(!Number.isSafeInteger(n)||n>(price?100000000:1000000))throw Error('จำนวนสูงเกินขอบเขตที่รองรับ');return n;}
const csvCell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
module.exports=function productImport({db,auth,body,send,fail,audit,transaction,validateProduct}){
 const previews=new Map();
 const clean=()=>{for(const [id,p]of previews)if(p.expires<Date.now())previews.delete(id);};
 async function preview(b,email){
  if(!['create','upsert'].includes(b.mode))fail('เลือกวิธีนำเข้าให้ถูกต้อง');let parsed;try{parsed=await parseFile({name:b.filename,content:b.content});}catch(e){fail(e.message,e.status||400);}
  const {rows,sheet}=parsed;if(rows.length<2)fail('ไฟล์ต้องมีหัวคอลัมน์และสินค้าอย่างน้อย 1 รายการ');const column=rows[0].cells.map(v=>Object.hasOwn(aliases,key(v))?aliases[key(v)]:undefined);if(rows[0].errors?.length)fail('หัวคอลัมน์ต้องเป็นข้อความธรรมดา');if(column.some(v=>!v))fail('หัวคอลัมน์ไม่ถูกต้อง ใช้ไฟล์ตัวอย่างหรือคอลัมน์: '+headers.join(', '));if(new Set(column).size!==column.length)fail('หัวคอลัมน์ซ้ำกัน');for(const h of ['sku','name','category'])if(!column.includes(h))fail('ขาดคอลัมน์ '+h);
  const categories=db.prepare('SELECT * FROM categories').all(),existing=db.prepare('SELECT * FROM products').all(),bySku=new Map();for(const p of existing){const k=key(p.sku);bySku.set(k,[...(bySku.get(k)||[]),p]);}const seen=new Map(),records=[];let created=0,updated=0,invalid=0;
  for(const row of rows.slice(1)){
   const errors=[...(row.errors||[])],raw={};column.forEach((h,i)=>{raw[h]=row.cells[i]??'';});if(row.cells.slice(column.length).some(v=>v.trim()))errors.push('มีข้อมูลเกินหัวคอลัมน์');const sku=raw.sku.trim(),matches=bySku.get(key(sku))||[],old=matches.length===1?matches[0]:null;
   if(!sku||sku.length>80)errors.push('SKU ต้องมี 1–80 ตัวอักษร');if(matches.length>1)errors.push('มี SKU ที่ต่างกันเฉพาะตัวพิมพ์ในระบบ กรุณาแก้ก่อน');if(old&&b.mode==='create')errors.push('SKU มีอยู่แล้ว เลือกอัปเดตตาม SKU หรือแก้รหัสสินค้า');
   const normalized={sku:old?.sku||sku,name:old?.name||'',category_id:old?.category_id||'',description:old?.description||'',image:old?.image||'',price:old?.price??null,stock:old?.stock??null,active:old?!!old.active:true,popular:old?!!old.popular:false};
   for(const [field,max]of [['name',160],['description',5000],['image',1500]])if(!blank(raw[field])){const v=raw[field].trim();if(v.length>max)errors.push(field+': ข้อความยาวเกิน '+max+' ตัวอักษร');else normalized[field]=v==='-'&&field!=='name'?'':v;}
   if(!blank(raw.category)){const value=raw.category.trim(),byId=categories.find(c=>c.id===value),matches=categories.filter(c=>key(c.name)===key(value));const category=byId||(matches.length===1?matches[0]:null);if(!category)errors.push('หมวดหมู่ไม่พบหรือชื่อซ้ำ: '+value);else normalized.category_id=category.id;}
   for(const field of ['price','stock'])if(!blank(raw[field]))try{normalized[field]=amount(raw[field],field==='price');}catch(e){errors.push(field+': '+e.message);}
   for(const field of ['active','popular'])if(!blank(raw[field]))try{normalized[field]=!!yes(raw[field]);}catch(e){errors.push(field+': '+e.message);}
   try{Object.assign(normalized,validateProduct(normalized));}catch(e){errors.push(e.message);}
   const record={line:row.line,sku:sku,name:normalized.name,category:categories.find(c=>c.id===normalized.category_id)?.name||raw.category,action:old?'update':'create',errors:[...new Set(errors)],product:normalized,id:old?.id||null,version:old?.version||null};
   if(seen.has(key(sku))){record.errors.push('SKU ซ้ำภายในไฟล์');const prior=records[seen.get(key(sku))];if(!prior.errors.includes('SKU ซ้ำภายในไฟล์'))prior.errors.push('SKU ซ้ำภายในไฟล์');}else seen.set(key(sku),records.length);records.push(record);
  }
  for(const r of records){if(r.errors.length)invalid++;else if(r.action==='create')created++;else updated++;}
  clean();for(const [id,p]of previews)if(p.email===email)previews.delete(id);if(previews.size>=10)fail('มีรายการรอนำเข้ามากเกินไป กรุณาลองใหม่',429);const id=randomBytes(24).toString('hex'),expires=Date.now()+10*60000;
  if(!invalid)previews.set(id,{email,expires,records,filename:b.filename,mode:b.mode});
  return {token:invalid?null:id,expires:invalid?null:expires,filename:b.filename,sheet,summary:{total:records.length,created,updated,invalid},rows:records.map(({product,id,version,...r})=>({...r,price:product.price,stock:product.stock,active:!!product.active,popular:!!product.popular}))};
 }
 function commit(b,email){clean();const p=previews.get(b.token);if(!p||p.email!==email)fail('รายการตรวจสอบหมดอายุ กรุณาเลือกและตรวจไฟล์อีกครั้ง',409);
  const result=transaction(()=>{
   // Match the preview's Unicode case folding, and load current versions once for the entire import.
   const currentBySku=new Map();for(const product of db.prepare('SELECT id,sku,version FROM products').all()){const normalized=key(product.sku);currentBySku.set(normalized,[...(currentBySku.get(normalized)||[]),product]);}
   for(const row of p.records){const matches=currentBySku.get(key(row.product.sku))||[];if(row.id){if(matches.length!==1||matches[0].id!==row.id||matches[0].version!==row.version)fail('สินค้า '+row.sku+' หรือสต็อกเปลี่ยนหลังตรวจไฟล์ กรุณาตรวจไฟล์ใหม่',409);}else if(matches.length)fail('SKU '+row.sku+' ถูกเพิ่มหลังตรวจไฟล์ กรุณาตรวจไฟล์ใหม่',409);validateProduct({...row.product,active:!!row.product.active,popular:!!row.product.popular});}
   let created=0,updated=0;const now=new Date().toISOString();for(const row of p.records){const v=row.product,id=row.id||'p-'+randomBytes(8).toString('hex');if(row.id){db.prepare('UPDATE products SET name=?,category_id=?,description=?,image=?,price=?,stock=?,active=?,popular=?,version=version+1,updated_at=? WHERE id=?').run(v.name,v.category_id,v.description,v.image,v.price,v.stock,v.active,v.popular,now,id);updated++;}else{db.prepare('INSERT INTO products(id,sku,name,category_id,description,image,price,stock,active,popular,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,v.sku,v.name,v.category_id,v.description,v.image,v.price,v.stock,v.active,v.popular,now);created++;}audit(email,'product.imported',id);}audit(email,'products.import.completed',JSON.stringify({created,updated}));return {created,updated,total:created+updated};
  });previews.delete(b.token);return result;
 }
 return async function handle(req,res,url){
  const p=url.pathname;if(!p.startsWith('/api/admin/products/import/'))return false;const session=auth(req);
  if(p==='/api/admin/products/import/template'&&req.method==='GET'){
   const format=url.searchParams.get('format')||'csv',categories=db.prepare('SELECT id,name FROM categories ORDER BY name').all();if(!['csv','xlsx'].includes(format))fail('รูปแบบไฟล์ไม่ถูกต้อง');const example=['DEMO-001','สินค้าตัวอย่าง',categories[0]?.id||'','','','125.50','10','true','false'];let buffer,type;
   if(format==='csv'){buffer=Buffer.from('\uFEFF'+[headers,example].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n');type='text/csv; charset=utf-8';}else{const Excel=require('exceljs'),book=new Excel.Workbook(),sheet=book.addWorksheet('Products');sheet.addRow(headers);sheet.addRow(example);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0869DC'}};sheet.views=[{state:'frozen',ySplit:1}];sheet.columns.forEach((c,i)=>{c.width=[22,32,28,40,40,16,16,16,16][i];c.numFmt='@';});buffer=Buffer.from(await book.xlsx.writeBuffer());type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';}
   res.writeHead(200,{'Content-Type':type,'Content-Disposition':'attachment; filename="bbioplast-products-template.'+format+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(buffer);return true;
  }
  if(p==='/api/admin/products/import/preview'&&req.method==='POST'){send(res,200,await preview(await body(req,8*1024*1024),session.email));return true;}
  if(p==='/api/admin/products/import/commit'&&req.method==='POST'){send(res,200,commit(await body(req),session.email));return true;}
  fail('ไม่พบข้อมูล',404);
 };
};
