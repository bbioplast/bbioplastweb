const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { performance } = require('node:perf_hooks');
const { createServer } = require('../server');

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-http-benchmark-'));
  const app = createServer({ dataDir, production: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const request = (pathname, headers = {}) => new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname, headers }, res => {
      let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; });
      res.on('end', () => resolve({ status: res.statusCode, bytes, headers: res.headers }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
  try {
    const results = [];
    for (const pathname of ['/', '/products', '/works']) {
      for (let i = 0; i < 5; i++) await request(pathname);
      const started = performance.now();
      for (let i = 0; i < 50; i++) await request(pathname);
      const elapsed = performance.now() - started;
      const plain = await request(pathname);
      const compressed = await request(pathname, { 'Accept-Encoding': 'br, gzip' });
      results.push({ path: pathname, requests: 50, meanMs: +(elapsed / 50).toFixed(2), htmlBytes: plain.bytes, transferredBytes: compressed.bytes, encoding: compressed.headers['content-encoding'] || 'identity' });
    }
    const asset = await request('/style.css', { 'Accept-Encoding': 'br, gzip' });
    const repeated = await request('/style.css', { 'Accept-Encoding': 'br, gzip', 'If-None-Match': asset.headers.etag || 'missing' });
    console.log(JSON.stringify({ pages: results, css: { bytes: asset.bytes, encoding: asset.headers['content-encoding'] || 'identity', repeatStatus: repeated.status, repeatBytes: repeated.bytes } }, null, 2));
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.backend.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
