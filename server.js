const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createBackend}=require('./backend');
function createServer(options={}){
 const root=path.join(__dirname,'public'),backend=createBackend(options),renderer=require('./cms-render')({db:backend.db,cms:backend.cms});
 const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
 const server=http.createServer(async(req,res)=>{
  let pathname,url;try{url=new URL(req.url,'http://localhost');pathname=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','SAMEORIGIN');
  if(pathname==='/health'){try{backend.db.prepare('SELECT 1').get();res.writeHead(200);return res.end('ok');}catch{res.writeHead(503);return res.end('unavailable');}}
  if(await backend.handle(req,res,url))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const media=pathname.match(/^\/media\/([a-f0-9]{64})\.(png|jpg|webp)$/);if(media){const file=path.join(backend.cms.mediaDir,media[1]+'.'+media[2]);if(!fs.existsSync(file)){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':types['.'+media[2]],'Cache-Control':'public,max-age=31536000,immutable','Content-Security-Policy':"default-src 'none'; sandbox"});if(req.method==='HEAD')return res.end();return fs.createReadStream(file).pipe(res);}
  if(['/admin','/shop','/quote','/products','/blog','/contact','/works'].includes(pathname))pathname+='.html';
  let post,work;const detail=pathname.match(/^\/(blog|works)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);if(detail){const redirect=backend.db.prepare('SELECT target FROM cms_redirects WHERE path=?').get(pathname);if(redirect){res.writeHead(301,{Location:redirect.target});return res.end();}if(detail[1]==='blog')post=backend.db.prepare("SELECT * FROM posts WHERE slug=? AND status='published' AND deleted_at IS NULL AND published_at<=?").get(detail[2],new Date().toISOString());else work=backend.cms.publicWork(detail[2]);if(!post&&!work){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});return res.end('<html lang="th"><meta charset="utf-8"><title>ไม่พบเนื้อหา</title><h1>ไม่พบเนื้อหานี้</h1><a href="/'+detail[1]+'">กลับไปหน้ารายการ</a></html>');}pathname='/'+detail[1]+'.html';}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}try{const html=path.extname(file)==='.html',output=html?renderer.page(file,{post,work}):data;res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',...(html?{'Cache-Control':'no-store'}:{})});if(req.method==='HEAD')return res.end();res.end(output);}catch(e){console.error('Page render:',e.message);if(!res.headersSent)res.writeHead(500);res.end('เกิดข้อผิดพลาดในการแสดงหน้าเว็บไซต์');}});
 });return {server,backend};
}
if(require.main===module){const {server,backend}=createServer();server.listen(process.env.PORT||3000,'0.0.0.0');process.on('SIGTERM',()=>server.close(()=>{backend.close();process.exit(0);}));}
module.exports={createServer};
