const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createBackend } = require('./backend');
const { representation, sendRepresentation, streamFile } = require('./http-assets');

function createServer(options = {}) {
  const root = path.join(__dirname, 'public');
  const backend = createBackend(options);
  const renderer = require('./cms-render')({ db: backend.db, cms: backend.cms });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
  const aliases = new Set(['/admin', '/shop', '/quote', '/products', '/blog', '/contact', '/works', '/quotation-cart']);
  const assets = new Map();
  const pages = new Map();
  const changeCount = backend.db.prepare('SELECT total_changes() AS value');
  const dataVersion = backend.db.prepare('PRAGMA data_version');
  let pageEpoch = '';
  let pageBytes = 0;

  async function handle(req, res) {
    let pathname, url;
    try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400); res.end(); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (pathname === '/health') {
      try { backend.db.prepare('SELECT 1').get(); res.writeHead(200); res.end('ok'); }
      catch { res.writeHead(503); res.end('unavailable'); }
      return;
    }
    if (await backend.handle(req, res, url)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const media = pathname.match(/^\/media\/([a-f0-9]{64})\.(png|jpg|webp)$/);
    if (media) {
      const file = path.join(backend.cms.mediaDir, media[1] + '.' + media[2]);
      let stat;
      try { stat = await fs.promises.stat(file); }
      catch { res.writeHead(404); res.end('Not found'); return; }
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      streamFile(req, res, file, stat, types['.' + media[2]], 'public,max-age=31536000,immutable');
      return;
    }
    if (aliases.has(pathname)) pathname += '.html';
    let post, work;
    const detail = pathname.match(/^\/(blog|works)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (detail) {
      const redirect = backend.db.prepare('SELECT target FROM cms_redirects WHERE path=?').get(pathname);
      if (redirect) { res.writeHead(301, { Location: redirect.target }); res.end(); return; }
      if (detail[1] === 'blog') post = backend.db.prepare("SELECT * FROM posts WHERE slug=? AND status='published' AND deleted_at IS NULL AND published_at<=?").get(detail[2], new Date().toISOString());
      else work = backend.cms.publicWork(detail[2]);
      if (!post && !work) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html lang="th"><meta charset="utf-8"><title>ไม่พบเนื้อหา</title><h1>ไม่พบเนื้อหานี้</h1><a href="/' + detail[1] + '">กลับไปหน้ารายการ</a></html>');
        return;
      }
      pathname = '/' + detail[1] + '.html';
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    let stat;
    try { stat = await fs.promises.stat(file); }
    catch { res.writeHead(404); res.end('Not found'); return; }
    if (!stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file), type = types[ext] || 'application/octet-stream';
    if (ext === '.html') {
      // Invalidate on writes through this connection and through other SQLite connections.
      // These templates contain no private API/session data.
      const epoch = changeCount.get().value + ':' + dataVersion.get().data_version;
      if (epoch !== pageEpoch) { pages.clear(); pageBytes = 0; pageEpoch = epoch; }
      const key = file + ':' + stat.mtimeMs + ':' + (post?.slug || work?.slug || '');
      let item = pages.get(key);
      if (!item) {
        const source = await fs.promises.readFile(file);
        item = representation(renderer.page(file, { post, work, source }), type);
        if (item.bytes <= 1024 * 1024) {
          if (pages.size >= 32 || pageBytes + item.bytes > 8 * 1024 * 1024) { pages.clear(); pageBytes = 0; }
          // A CMS write may complete while the source file is being read.
          // Never install that in-flight response under a newer database epoch.
          const currentEpoch = changeCount.get().value + ':' + dataVersion.get().data_version;
          if (epoch === currentEpoch && epoch === pageEpoch) { pages.set(key, item); pageBytes += item.bytes; }
        }
      }
      sendRepresentation(req, res, item);
      return;
    }
    if (stat.size > 512 * 1024) {
      streamFile(req, res, file, stat, type, 'public,max-age=0,must-revalidate');
      return;
    }
    let cached = assets.get(file);
    if (!cached || cached.mtime !== stat.mtimeMs || cached.size !== stat.size) {
      cached = { mtime: stat.mtimeMs, size: stat.size, item: representation(await fs.promises.readFile(file), type) };
      if (assets.size >= 64) assets.clear();
      assets.set(file, cached);
    }
    sendRepresentation(req, res, cached.item, { cacheControl: 'public,max-age=0,must-revalidate', revalidate: true, lastModified: stat.mtime });
  }
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
      console.error('Request failed:', error.message);
      if (res.headersSent) res.destroy();
      else { res.writeHead(500); res.end('เกิดข้อผิดพลาดในการแสดงหน้าเว็บไซต์'); }
    });
  });
  return { server, backend };
}

if (require.main === module) {
  const { server, backend } = createServer();
  server.listen(process.env.PORT || 3000, '0.0.0.0');
  process.on('SIGTERM', () => server.close(() => { backend.close(); process.exit(0); }));
}
module.exports = { createServer };
