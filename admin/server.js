'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = 3001;
const ROOT = process.cwd();
const ALLOWED_DIRS = new Set(['videos', 'pictures', 'documents', 'posts']);

// ── MIME types for static serving ─────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.md':   'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
};

// ── Helpers ───────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, code, data) {
  setCORS(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function err(res, code, msg) { json(res, code, { error: msg }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function formatSize(bytes) {
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function safeDir(dir) {
  return ALLOWED_DIRS.has(dir) ? path.join(ROOT, dir) : null;
}

function safePath(dir, filename) {
  const dirPath = safeDir(dir);
  if (!dirPath) return null;
  const abs = path.resolve(dirPath, filename);
  if (!abs.startsWith(dirPath + path.sep) && abs !== dirPath) return null;
  return abs;
}

// ── Manifest helpers ──────────────────────────────────────────
function manifestPath(dir) { return path.join(ROOT, dir, 'manifest.json'); }

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8'));
  } catch { return []; }
}

function writeManifest(dir, data) {
  fs.writeFileSync(manifestPath(dir), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ── Multipart parser ──────────────────────────────────────────
function parseMultipart(body, boundary) {
  const parts  = [];
  const start  = Buffer.from('--' + boundary + '\r\n');
  const sep    = Buffer.from('\r\n--' + boundary);
  const CRLFCRLF = Buffer.from('\r\n\r\n');

  let pos = body.indexOf(start);
  if (pos === -1) return parts;
  pos += start.length;

  while (pos < body.length) {
    const next = body.indexOf(sep, pos);
    if (next === -1) break;

    const part      = body.slice(pos, next);
    const headerEnd = part.indexOf(CRLFCRLF);
    if (headerEnd === -1) break;

    const headers  = part.slice(0, headerEnd).toString('utf8');
    const partBody = part.slice(headerEnd + 4);

    const dispMatch = headers.match(/Content-Disposition:\s*form-data;([^\r\n]*)/i);
    if (dispMatch) {
      const nameMatch     = dispMatch[1].match(/\bname="([^"]*)"/);
      const filenameMatch = dispMatch[1].match(/\bfilename="([^"]*)"/);
      parts.push({
        name:     nameMatch     ? nameMatch[1]     : null,
        filename: filenameMatch ? filenameMatch[1] : null,
        body:     partBody,
        headers,
      });
    }

    pos = next + sep.length;
    const after = body.slice(pos, pos + 2).toString();
    if (after === '--') break;
    pos += 2;
  }
  return parts;
}

// ── Request handler ───────────────────────────────────────────
async function handle(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed  = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── API routes ─────────────────────────────────────────────
  const mManifest = pathname.match(/^\/api\/manifest\/([^/]+)$/);
  if (mManifest) {
    const dir = mManifest[1];
    if (!ALLOWED_DIRS.has(dir)) { err(res, 403, 'Forbidden'); return; }

    if (req.method === 'GET') {
      json(res, 200, readManifest(dir)); return;
    }
    if (req.method === 'PUT') {
      try {
        const body = await readBody(req);
        const data = JSON.parse(body.toString('utf8'));
        if (!Array.isArray(data)) { err(res, 400, 'Expected JSON array'); return; }
        writeManifest(dir, data);
        json(res, 200, { ok: true }); return;
      } catch (e) { err(res, 400, e.message); return; }
    }
    err(res, 405, 'Method not allowed'); return;
  }

  const mFile = pathname.match(/^\/api\/file\/([^/]+)\/([^/]+)$/);
  if (mFile) {
    const [, dir, filename] = mFile;
    const abs = safePath(dir, filename);
    if (!abs) { err(res, 403, 'Forbidden'); return; }

    if (req.method === 'GET') {
      try {
        const text = fs.readFileSync(abs, 'utf8');
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(text); return;
      } catch { err(res, 404, 'Not found'); return; }
    }

    if (req.method === 'PUT') {
      try {
        const body = await readBody(req);
        const text = body.toString('utf8');
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, text, 'utf8');
        const size = Buffer.byteLength(text, 'utf8');
        json(res, 200, { ok: true, size: formatSize(size) }); return;
      } catch (e) { err(res, 500, e.message); return; }
    }

    if (req.method === 'DELETE') {
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
        const manifest  = readManifest(dir);
        const updated   = manifest.filter(e => e.filename !== filename);
        writeManifest(dir, updated);
        json(res, 200, { ok: true }); return;
      } catch (e) { err(res, 500, e.message); return; }
    }

    err(res, 405, 'Method not allowed'); return;
  }

  const mUpload = pathname.match(/^\/api\/upload\/([^/]+)$/);
  if (mUpload && req.method === 'POST') {
    const dir    = mUpload[1];
    const dirAbs = safeDir(dir);
    if (!dirAbs) { err(res, 403, 'Forbidden'); return; }

    try {
      const ct = req.headers['content-type'] || '';
      const bmatch = ct.match(/boundary=([^\s;]+)/);
      if (!bmatch) { err(res, 400, 'No boundary in Content-Type'); return; }
      const boundary = bmatch[1].replace(/^"(.*)"$/, '$1');

      const body  = await readBody(req);
      const parts = parseMultipart(body, boundary);

      const saved = [];
      for (const part of parts) {
        if (!part.filename || part.name !== 'file') continue;
        const safeName = path.basename(part.filename);
        if (!safeName) continue;

        const dest = path.join(dirAbs, safeName);
        fs.mkdirSync(dirAbs, { recursive: true });
        fs.writeFileSync(dest, part.body);

        const size = part.body.length;

        const manifest = readManifest(dir);
        const existing = manifest.findIndex(e => e.filename === safeName);
        const entry    = { filename: safeName, size: formatSize(size) };

        if (existing !== -1) {
          manifest[existing] = { ...manifest[existing], ...entry };
        } else {
          manifest.unshift(entry);
        }
        writeManifest(dir, manifest);

        saved.push({ filename: safeName, size: formatSize(size) });
      }

      json(res, 200, { ok: true, saved }); return;
    } catch (e) { err(res, 500, e.message); return; }
  }

  // ── Static file serving ────────────────────────────────────
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    err(res, 405, 'Method not allowed'); return;
  }

  let filePath = pathname === '/' ? '/admin/admin.html' : pathname;

  const abs = path.resolve(ROOT, '.' + filePath);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    err(res, 403, 'Forbidden'); return;
  }

  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const idx = path.join(abs, 'index.html');
      if (fs.existsSync(idx)) {
        const content = fs.readFileSync(idx);
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content); return;
      }
      err(res, 404, 'Not found'); return;
    }
    const ext  = path.extname(abs).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const content = fs.readFileSync(abs);
    setCORS(res);
    res.writeHead(200, { 'Content-Type': mime });
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(content);
  } catch {
    err(res, 404, 'Not found');
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    console.error('[server error]', e);
    try { err(res, 500, 'Internal server error'); } catch { /* already sent */ }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`JMT Admin server running on http://0.0.0.0:${PORT}`);
  console.log(`Open the port ${PORT} preview or navigate to /admin/admin.html`);
});
