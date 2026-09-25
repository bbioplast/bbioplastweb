const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'public');
const {createBackend}=require('./backend');
const backend=createBackend();
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  let pathname; try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','SAMEORIGIN');
  if(pathname==='/health'){try{backend.db.prepare('SELECT 1').get();res.writeHead(200);return res.end('ok');}catch{res.writeHead(503);return res.end('unavailable');}}
  if(await backend.handle(req,res,new URL(req.url,'http://localhost')))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  if(['/admin','/shop','/quote','/products'].includes(pathname)){pathname=pathname+'.html';res.setHeader('Cache-Control','no-store');}
  const file = path.resolve(root, '.' + (pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);});
}).listen(process.env.PORT||3000,'0.0.0.0');
process.on('SIGTERM',()=>server.close(()=>{backend.close();process.exit(0);}));
