const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createBackend,hash,passwordHash}=require('../backend');

async function fixture(t){
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-backend-audit-'));
 const backend=createBackend({dataDir,production:false,adminEmail:'audit@example.test',bootstrapHash:hash('audit-setup'),bootstrapExpires:Date.now()+60000});
 let afterBody=null,cookie='',csrf='';
 const server=http.createServer((req,res)=>{const pending=afterBody;afterBody=null;if(pending)req.once('end',()=>setImmediate(pending));backend.handle(req,res,new URL(req.url,'http://localhost'));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));backend.close();fs.rmSync(dataDir,{recursive:true,force:true});});
 async function call(url,method='GET',data,headers={}){
  const response=await fetch(origin+url,{method,headers:{Origin:origin,'X-Requested-With':'BBWeb','Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,...headers},body:data===undefined?undefined:JSON.stringify(data)});
  const issuedCookie=response.headers.get('set-cookie');if(issuedCookie)cookie=issuedCookie.split(';')[0];
  return {status:response.status,data:await response.json(),issuedCookie};
 }
 await call('/api/auth/setup','POST',{email:'audit@example.test',password:'initial-audit-password',token:'audit-setup'});
 csrf=(await call('/api/auth/login','POST',{email:'audit@example.test',password:'initial-audit-password'})).data.csrf;
 return {backend,call,afterBody:fn=>{afterBody=fn;}};
}

test('API rejects JSON primitives, arrays and misleading content types without internal errors',async t=>{
 const {call}=await fixture(t);
 for(const value of [null,[],true,42,'invalid'])assert.equal((await call('/api/quotes','POST',value)).status,400);
 assert.equal((await call('/api/admin/categories','POST',null)).status,400);
 assert.equal((await call('/api/admin/categories','POST',{name:'invalid media type'},{'Content-Type':'application/jsonp'})).status,415);
 assert.equal((await call('/api/admin/categories','POST',{name:'valid JSON parameters'},{'Content-Type':'Application/JSON; charset=utf-8'})).status,201);
});

test('manual product saves cannot introduce case-insensitive SKU collisions and retain legacy products',async t=>{
 const {backend,call}=await fixture(t),original=(await call('/api/admin/catalog')).data.products[0];
 const product={name:'ทดสอบรหัสสินค้า',category_id:original.category_id,stock:null,price:null,active:true};
 assert.equal((await call('/api/admin/products','POST',{...product,sku:original.sku.toLowerCase()})).status,409);
 assert.equal((await call('/api/admin/products/'+original.id,'PUT',{...original,sku:original.sku.toLowerCase()})).status,200);
 assert.equal((await call('/api/admin/products','POST',{...product,sku:'Ü-01'})).status,200);
 assert.equal((await call('/api/admin/products','POST',{...product,sku:'ü-01'})).status,409);
 const renamed=(await call('/api/admin/catalog')).data.products.find(p=>p.id===original.id);
 assert.equal((await call('/api/admin/products/'+original.id,'PUT',{...renamed,sku:'ü-01'})).status,409);
 // Pre-existing case variants remain editable; the audit must not delete or merge existing records.
 backend.db.prepare('INSERT INTO products(id,sku,name,category_id,updated_at) VALUES(?,?,?,?,?)').run('legacy-case',original.sku,'Legacy item',original.category_id,new Date().toISOString());
 const legacy=(await call('/api/admin/catalog')).data.products.find(p=>p.id==='legacy-case');
 assert.equal((await call('/api/admin/products/'+legacy.id,'PUT',{...legacy,name:'Legacy item updated'})).status,200);
 assert.equal(backend.db.prepare('SELECT COUNT(*) n FROM products').get().n,3);
});

test('import commit detects a Unicode case variant inserted after preview',async t=>{
 const {backend,call}=await fixture(t),original=(await call('/api/admin/catalog')).data.products[0];
 const preview=await call('/api/admin/products/import/preview','POST',{filename:'audit.csv',mode:'create',content:Buffer.from('sku,name,category\nÄ-IMPORT,รายการนำเข้า,'+original.category_id+'\n').toString('base64')});
 assert.equal(preview.status,200);assert.equal(preview.data.summary.invalid,0);
 assert.equal((await call('/api/admin/products','POST',{sku:'ä-import',name:'Added concurrently',category_id:original.category_id,active:true})).status,200);
 assert.equal((await call('/api/admin/products/import/commit','POST',{token:preview.data.token})).status,409);
 assert.equal(backend.db.prepare('SELECT COUNT(*) n FROM products').get().n,2);
});

test('import headers reject inherited object property names',async t=>{
 const {backend,call}=await fixture(t);
 for(const header of ['constructor','__proto__']){
  const result=await call('/api/admin/products/import/preview','POST',{filename:'headers.csv',mode:'create',content:Buffer.from('sku,name,category,'+header+'\nHEADER-A,ทดสอบ,suction-pad,ignored\n').toString('base64')});
  assert.equal(result.status,400);assert.match(result.data.error,/หัวคอลัมน์/);
 }
 assert.equal(backend.db.prepare('SELECT COUNT(*) n FROM products').get().n,1);
});

test('password revocation blocks an in-flight login from creating a new session',async t=>{
 const {backend,call,afterBody}=await fixture(t),replacement=await passwordHash('replacement-audit-password');let revoked=false;
 afterBody(()=>{backend.db.prepare('UPDATE admins SET password_hash=? WHERE email=?').run(replacement,'audit@example.test');backend.db.prepare('DELETE FROM sessions').run();revoked=true;});
 const login=await call('/api/auth/login','POST',{email:'audit@example.test',password:'initial-audit-password'});
 assert.equal(revoked,true);assert.equal(login.status,401);assert.equal(login.issuedCookie,null);
 assert.equal(backend.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
 assert.equal((await call('/api/admin/catalog')).status,401);
 assert.equal((await call('/api/auth/login','POST',{email:'audit@example.test',password:'replacement-audit-password'})).status,200);
});

test('a concurrent password change cannot overwrite a newer password',async t=>{
 const {backend,call,afterBody}=await fixture(t),replacement=await passwordHash('newer-audit-password');let changed=false;
 afterBody(()=>{backend.db.prepare('UPDATE admins SET password_hash=? WHERE email=?').run(replacement,'audit@example.test');backend.db.prepare('DELETE FROM sessions').run();changed=true;});
 const result=await call('/api/auth/password','POST',{current:'initial-audit-password',password:'stale-audit-password'});
 assert.equal(changed,true);assert.equal(result.status,403);
 assert.equal(backend.db.prepare('SELECT password_hash FROM admins WHERE email=?').get('audit@example.test').password_hash,replacement);
 assert.equal((await call('/api/auth/login','POST',{email:'audit@example.test',password:'newer-audit-password'})).status,200);
});
