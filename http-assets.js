const fs = require('node:fs');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

function representation(body, type) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const variants = new Map();
  function get(encoding) {
    if (!variants.has(encoding)) {
      const data = encoding === 'br'
        ? zlib.brotliCompressSync(bytes, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : encoding === 'gzip' ? zlib.gzipSync(bytes) : bytes;
      variants.set(encoding, { data, etag: '"' + crypto.createHash('sha256').update(data).digest('hex') + '"' });
    }
    return variants.get(encoding);
  }
  return { type, bytes: bytes.length, get, compressible: /^(text\/|application\/(javascript|json))/.test(type) && bytes.length >= 1024 };
}

function encodingFor(header, compressible) {
  const accepted = new Map();
  for (const item of (header || '').toLowerCase().split(',')) {
    const [name, ...params] = item.trim().split(';');
    if (!name) continue;
    const q = params.find(p => p.trim().startsWith('q='));
    const value = q ? Number(q.trim().slice(2)) : 1;
    accepted.set(name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0);
  }
  const quality = name => accepted.get(name) ?? accepted.get('*') ?? 0;
  const encodings = compressible ? ['br', 'gzip'].filter(name => quality(name) > 0) : [];
  encodings.sort((a, b) => quality(b) - quality(a));
  const identity = accepted.get('identity') ?? (accepted.get('*') === 0 ? 0 : 1);
  if (encodings.length && !(accepted.has('identity') && identity > quality(encodings[0]))) return encodings[0];
  return identity > 0 ? 'identity' : null;
}

function matchesTag(header, etag) {
  return (header || '').split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
}

function sendRepresentation(req, res, item, { cacheControl = 'no-store', revalidate = false, lastModified } = {}) {
  const encoding = encodingFor(req.headers['accept-encoding'], item.compressible);
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', cacheControl);
  if (!encoding) { res.writeHead(406); res.end(); return; }
  const { data, etag } = item.get(encoding);
  res.setHeader('Content-Type', item.type);
  if (encoding !== 'identity') res.setHeader('Content-Encoding', encoding);
  if (revalidate) {
    res.setHeader('ETag', etag);
    if (lastModified) res.setHeader('Last-Modified', lastModified.toUTCString());
    const fresh = req.headers['if-none-match'] !== undefined
      ? matchesTag(req.headers['if-none-match'], etag)
      : lastModified && Date.parse(req.headers['if-modified-since']) >= Math.floor(lastModified.getTime() / 1000) * 1000;
    if (fresh) { res.writeHead(304); res.end(); return; }
  }
  res.setHeader('Content-Length', data.length);
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : data);
}

function streamFile(req, res, file, stat, type, cacheControl) {
  const etag = 'W/"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  const fresh = req.headers['if-none-match'] !== undefined
    ? matchesTag(req.headers['if-none-match'], etag.replace(/^W\//, ''))
    : Date.parse(req.headers['if-modified-since']) >= Math.floor(stat.mtimeMs / 1000) * 1000;
  if (fresh) { res.writeHead(304); res.end(); return; }
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  const stream = fs.createReadStream(file);
  stream.on('error', error => {
    if (!res.headersSent) {
      res.removeHeader('Content-Length');
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end('Unable to read file');
    } else res.destroy(error);
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

module.exports = { representation, sendRepresentation, streamFile };
