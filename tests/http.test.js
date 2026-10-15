const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');

async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-http-test-'));
  const app = createServer({ dataDir: dir, production: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const request = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: app.server.address().port, path: url, headers, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
  try { await fn({ app, dir, request }); }
  finally { await new Promise(resolve => app.server.close(resolve)); app.backend.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

test('HTML compression preserves content and private responses stay uncached in browsers', () => fixture(async ({ request }) => {
  const plain = await request('/');
  for (const encoding of ['br', 'gzip']) {
    const result = await request('/', { 'Accept-Encoding': encoding });
    assert.equal(result.headers['content-encoding'], encoding);
    assert.equal(result.headers.vary, 'Accept-Encoding');
    assert.equal(result.headers['cache-control'], 'no-store');
    const decoded = encoding === 'br' ? zlib.brotliDecompressSync(result.body) : zlib.gunzipSync(result.body);
    assert.deepEqual(decoded, plain.body);
    assert.ok(result.body.length < plain.body.length * 0.5);
    const head = await request('/', { 'Accept-Encoding': encoding }, 'HEAD');
    assert.equal(head.body.length, 0);
    assert.equal(+head.headers['content-length'], result.body.length);
  }
  assert.equal((await request('/', { 'Accept-Encoding': 'gzip;q=0, br;q=0' })).headers['content-encoding'], undefined);
  assert.equal((await request('/', { 'Accept-Encoding': 'gzip;q=0, br;q=0, identity;q=0' })).status, 406);
  assert.equal((await request('/api/admin/catalog')).headers['cache-control'], 'no-store');
}));

test('static responses revalidate per encoding, respect validators, and stream large assets', () => fixture(async ({ request }) => {
  const css = await request('/style.css', { 'Accept-Encoding': 'gzip' });
  const repeat = await request('/style.css', { 'Accept-Encoding': 'gzip', 'If-None-Match': 'W/' + css.headers.etag });
  assert.equal(repeat.status, 304); assert.equal(repeat.body.length, 0);
  const plain = await request('/style.css', { 'If-None-Match': css.headers.etag });
  assert.equal(plain.status, 200); assert.notEqual(plain.headers.etag, css.headers.etag);
  assert.equal((await request('/style.css', { 'If-Modified-Since': css.headers['last-modified'] })).status, 304);
  assert.equal((await request('/style.css', { 'If-None-Match': '"different"', 'If-Modified-Since': css.headers['last-modified'] })).status, 200);
  const asset = await request('/assets/reference.png');
  assert.equal(asset.status, 200); assert.equal(asset.body.length, +asset.headers['content-length']);
  assert.ok(asset.body.length > 512 * 1024);
  assert.equal((await request('/assets/reference.png', { 'If-None-Match': asset.headers.etag })).status, 304);
  const head = await request('/assets/reference.png', {}, 'HEAD');
  assert.equal(head.body.length, 0); assert.equal(+head.headers['content-length'], asset.body.length);
}));

test('page cache invalidates for local and external CMS writes without publishing drafts', () => fixture(async ({ app, dir, request }) => {
  let reads = 0;
  const original = app.backend.cms.readDoc;
  app.backend.cms.readDoc = (...args) => { reads++; return original(...args); };
  const before = await request('/');
  const firstReads = reads;
  assert.ok(firstReads > 0);
  assert.deepEqual((await request('/')).body, before.body); assert.equal(reads, firstReads);
  const site = original('site');
  const published = { ...site.published, company: 'บริษัท ทดสอบแคช เว็บไซต์' };
  app.backend.db.prepare('UPDATE cms_documents SET published=? WHERE key=?').run(JSON.stringify(published), 'site');
  assert.match((await request('/')).body.toString(), /บริษัท ทดสอบแคช เว็บไซต์/);
  const external = new DatabaseSync(path.join(dir, 'commerce.sqlite'));
  try {
    const changed = { ...published, company: 'บริษัท เผยแพร่จากการเชื่อมต่ออื่น' };
    external.prepare('UPDATE cms_documents SET published=? WHERE key=?').run(JSON.stringify(changed), 'site');
    assert.match((await request('/')).body.toString(), /บริษัท เผยแพร่จากการเชื่อมต่ออื่น/);
    external.prepare('UPDATE cms_documents SET draft=? WHERE key=?').run(JSON.stringify({ ...changed, company: 'ข้อความที่ยังไม่เผยแพร่' }), 'site');
    const draft = (await request('/')).body.toString();
    assert.ok(!draft.includes('ข้อความที่ยังไม่เผยแพร่'));
    assert.ok(draft.includes('บริษัท เผยแพร่จากการเชื่อมต่ออื่น'));
  } finally { external.close(); }
}));

test('cached detail pages still enforce withdrawal and slug redirects', () => fixture(async ({ app, request }) => {
  const work = app.backend.cms.portfolio()[0];
  const url = '/works/' + work.slug;
  assert.equal((await request(url)).status, 200);
  const row = app.backend.db.prepare('SELECT data FROM cms_portfolio WHERE id=?').get(work.id);
  const data = { ...JSON.parse(row.data), status: 'draft' };
  app.backend.db.prepare('UPDATE cms_portfolio SET data=? WHERE id=?').run(JSON.stringify(data), work.id);
  assert.equal((await request(url)).status, 404);
  app.backend.db.prepare('INSERT INTO cms_redirects VALUES(?,?,?,?)').run(url, '/works/new-slug', 'portfolio', work.id);
  const redirected = await request(url);
  assert.equal(redirected.status, 301); assert.equal(redirected.headers.location, '/works/new-slug');
}));
