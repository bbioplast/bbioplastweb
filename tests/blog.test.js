const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createBackend,hash}=require('../backend');
test('blog drafts, publishing, authorization, conflicts and persistence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bb-blog-test-'));let backend=createBackend({dataDir:dir,production:false,adminEmail:'admin@example.test',bootstrapHash:hash('test-setup'),bootstrapExpires:Date.now()+60000});
 const server=http.createServer((req,res)=>backend.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const call=async(p,m='GET',data,headers={})=>{const r=await fetch(origin+p,{method:m,headers:{Origin:origin,'Content-Type':'application/json','X-Requested-With':'BBWeb',Cookie:cookie,'X-CSRF-Token':csrf,...headers},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
 try{
  assert.equal((await call('/api/admin/posts')).status,401);assert.deepEqual((await call('/api/blog')).data.posts,[]);
  await call('/api/auth/setup','POST',{email:'admin@example.test',password:'local-test-password-123',token:'test-setup'});csrf=(await call('/api/auth/login','POST',{email:'admin@example.test',password:'local-test-password-123'})).data.csrf;
  const draft={title:'เลือกอุปกรณ์',slug:'test-post',content:'# หัวข้อ\n\nเนื้อหา <script>alert(1)</script>',excerpt:'คำโปรย',category:'เทคนิค',cover:'',status:'draft'};
  assert.equal((await call('/api/admin/posts','POST',draft,{'X-CSRF-Token':''})).status,403);
  assert.equal((await call('/api/admin/posts','POST',draft,{Origin:'https://other.test'})).status,403);
  let saved=(await call('/api/admin/posts','POST',draft)).data;assert.ok(saved.id);
  assert.equal((await call('/api/blog/test-post')).status,404);assert.equal((await call('/api/blog')).data.posts.length,0);
  assert.equal((await call('/api/admin/posts','POST',draft)).status,409);
  assert.equal((await call('/api/admin/posts/'+saved.id,'PUT',{...saved,cover:'javascript:alert(1)'})).status,400);
  const published=await call('/api/admin/posts/'+saved.id,'PUT',{...saved,status:'published'});assert.equal(published.status,200);
  assert.equal((await call('/api/admin/posts/'+saved.id,'PUT',saved)).status,409);saved=published.data;
  assert.equal((await call('/api/blog')).data.posts.length,1);assert.equal((await call('/api/blog/test-post')).data.content,draft.content);
  backend.close();backend=createBackend({dataDir:dir,production:false});assert.equal((await call('/api/blog/test-post')).status,200);
  saved=(await call('/api/admin/posts/'+saved.id,'PUT',{...saved,status:'archived'})).data;
  assert.equal((await call('/api/blog/test-post')).status,404);assert.equal((await call('/api/blog')).data.posts.length,0);
  assert.equal((await call('/api/admin/posts')).data.posts[0].status,'archived');
 }finally{await new Promise(r=>server.close(r));backend.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('article renderer escapes HTML and formats headings and lists',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/blog-content.js'),'utf8'),context);const html=context.window.BlogContent.render('# Title\n\n<script>alert(1)</script>\n\n- one\n- two');assert.ok(html.includes('<h2>Title</h2>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
});
