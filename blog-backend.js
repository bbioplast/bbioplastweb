const {randomBytes}=require('node:crypto');
module.exports=function createBlog({db,auth,body,send,fail,audit}){
 db.exec(`CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,excerpt TEXT NOT NULL DEFAULT '',content TEXT NOT NULL,cover TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_at TEXT); CREATE INDEX IF NOT EXISTS posts_public ON posts(status,published_at);`);
 const list=()=>db.prepare('SELECT * FROM posts ORDER BY updated_at DESC').all();
 const clean=(v,max)=>{if(typeof v!=='string'||v.length>max)fail('ข้อมูลบทความไม่ถูกต้องหรือยาวเกินกำหนด');return v.trim();};
 return async(req,res,url)=>{
  const p=url.pathname,m=req.method;
  if(p==='/api/blog'&&m==='GET'){send(res,200,{posts:db.prepare("SELECT id,slug,title,excerpt,cover,category,published_at,updated_at FROM posts WHERE status='published' ORDER BY published_at DESC,id").all()});return true;}
  if(p.startsWith('/api/blog/')&&m==='GET'){let slug;try{slug=decodeURIComponent(p.slice(10));}catch{fail('ไม่พบบทความ',404);}const post=db.prepare("SELECT slug,title,excerpt,content,cover,category,published_at,updated_at FROM posts WHERE slug=? AND status='published'").get(slug);if(!post)fail('ไม่พบบทความ',404);send(res,200,post);return true;}
  if(p!=='/api/admin/posts'&&!p.startsWith('/api/admin/posts/'))return false;
  const session=auth(req);
  if(p==='/api/admin/posts'&&m==='GET'){send(res,200,{posts:list()});return true;}
  const match=p.match(/^\/api\/admin\/posts(?:\/([a-f0-9]{16}))?$/);
  if(!match||!(m==='POST'&&!match[1]||m==='PUT'&&match[1]))fail('ไม่พบรายการ',404);
  const b=await body(req),id=match[1]||randomBytes(8).toString('hex'),current=match[1]?db.prepare('SELECT * FROM posts WHERE id=?').get(id):null;
  if(match[1]&&!current)fail('ไม่พบบทความ',404);
  if(current&&b.version!==current.version)fail('บทความถูกแก้ไขจากที่อื่น กรุณาโหลดใหม่ก่อนบันทึก',409);
  const title=clean(b.title,180),content=clean(b.content,60000),excerpt=clean(b.excerpt||'',400),cover=clean(b.cover||'',1500),category=clean(b.category||'',80),slug=clean(b.slug||current?.slug||'article-'+id,120);
  if(!title||!content)fail('กรุณาระบุหัวข้อและเนื้อหาบทความ');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail('ลิงก์บทความใช้ a–z, 0–9 และขีดกลางเท่านั้น');
  if(cover){try{if(new URL(cover).protocol!=='https:')throw Error();}catch{fail('ลิงก์รูปปกต้องเป็น HTTPS');}}
  if(!['draft','published','archived'].includes(b.status))fail('สถานะบทความไม่ถูกต้อง');
  if(db.prepare('SELECT id FROM posts WHERE slug=? AND id<>?').get(slug,id))fail('ลิงก์บทความนี้ถูกใช้แล้ว',409);
  const now=new Date().toISOString(),published=current?.published_at||(b.status==='published'?now:null);
  db.exec('BEGIN IMMEDIATE');try{
   if(current){const saved=db.prepare('UPDATE posts SET slug=?,title=?,excerpt=?,content=?,cover=?,category=?,status=?,published_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?').run(slug,title,excerpt,content,cover,category,b.status,published,now,id,b.version);if(!saved.changes)fail('บทความถูกแก้ไขแล้ว กรุณาโหลดใหม่',409);}
   else db.prepare('INSERT INTO posts(id,slug,title,excerpt,content,cover,category,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,slug,title,excerpt,content,cover,category,b.status,now,now,published);
   audit(session.email,'post.'+b.status,id);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  send(res,current?200:201,db.prepare('SELECT * FROM posts WHERE id=?').get(id));return true;
 };
};
