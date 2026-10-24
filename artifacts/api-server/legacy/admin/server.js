'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = Number(process.env.PORT) || 80;
const WORKSPACE_ROOT = process.cwd();
const ROOT = path.resolve(WORKSPACE_ROOT, 'artifacts/personal-website/public');
const ADMIN_ROOT = path.resolve(WORKSPACE_ROOT, 'artifacts/api-server/legacy/admin');
const ALLOWED_DIRS = new Set(['videos', 'pictures', 'documents', 'posts']);
const PUBLIC_ROOT_FILES = new Set([
  'index.html',
  'desktop.html',
  'desktop.css',
  'desktop.js',
  'desktop-state.js',
  'favicon.png',
  'jmt.svg',
]);
const PUBLIC_STATIC_DIRS = new Set([
  'apps',
  'shared',
  'pictures',
  'documents',
  'videos',
  'posts',
  'welcome',
]);
const PUBLIC_ADMIN_FILES = new Set(['admin/admin.html', 'admin/admin.css', 'admin/admin.js']);
const CLERK_DIST = path.join(path.dirname(require.resolve('@clerk/clerk-js/package.json')), 'dist');
// ── Clerk auth ────────────────────────────────────────────────
let _clerkVerifyToken = null;

async function getClerkVerifier() {
  if (_clerkVerifyToken) return _clerkVerifyToken;
  try {
    const clerk = await import('@clerk/backend');
    _clerkVerifyToken = clerk.verifyToken;
    return _clerkVerifyToken;
  } catch (e) {
    console.error('[clerk] Failed to load @clerk/backend:', e.message);
    return null;
  }
}

async function requireAuth(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    err(res, 401, 'Authentication required');
    return false;
  }
  const verifyToken = await getClerkVerifier();
  if (!verifyToken) {
    err(res, 500, 'Auth service unavailable');
    return false;
  }
  try {
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return true;
  } catch {
    err(res, 401, 'Invalid or expired session');
    return false;
  }
}

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
function isTrustedOrigin(origin) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[\w-]+\.[\w.-]*replit\.dev$/.test(origin)) return true;
  if (/^https:\/\/[\w-]+\.[\w.-]*repl\.co$/.test(origin)) return true;
  return false;
}

function setCORS(res, req) {
  const origin = req && req.headers && req.headers.origin;
  if (origin) {
    if (isTrustedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    // Untrusted origins: no CORS headers → browser blocks the request
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function err(res, code, msg) { json(res, code, { error: msg }); }

function readBody(req, maxBytes = Infinity) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const declaredSize = Number(req.headers['content-length']);
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      req.resume();
      reject(error);
      return;
    }
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        const error = new Error('Request body too large');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!settled) resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readBody(req, 16 * 1024);
  return JSON.parse(body.toString('utf8') || '{}');
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

function publicStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (!decoded || decoded.split('/').some(segment => !segment || segment.startsWith('.'))) return null;
  const parts = decoded.split('/');
  const allowed = (parts.length === 1 && PUBLIC_ROOT_FILES.has(decoded))
    || PUBLIC_ADMIN_FILES.has(decoded)
    || PUBLIC_STATIC_DIRS.has(parts[0]);
  if (!allowed) return null;

  if (PUBLIC_ADMIN_FILES.has(decoded)) {
    return path.join(ADMIN_ROOT, path.basename(decoded));
  }

  const absolute = path.resolve(ROOT, decoded);
  if (!absolute.startsWith(ROOT + path.sep)) return null;
  try {
    const real = fs.realpathSync(absolute);
    if (!real.startsWith(ROOT + path.sep)) return null;
    return real;
  } catch {
    return absolute;
  }
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
  setCORS(res, req);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed  = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── Public: Clerk config bootstrap ────────────────────────
  if (pathname === '/api/clerk-config' && req.method === 'GET') {
    const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
    json(res, 200, { publishableKey: pk });
    return;
  }

  // ── Public: Clerk API proxy ────────────────────────────────
  // Forwards /clerk-proxy/* → https://clerk.<fapi-domain>/*
  // This lets the browser reach Clerk's backend even when the Replit
  // preview sandbox blocks direct outbound connections.
  if (pathname.startsWith('/clerk-proxy/')) {
    const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
    let fapiHost = null;
    if (pk) {
      try {
        const decoded = Buffer.from(pk.split('_')[2], 'base64url').toString('utf8').replace(/\$+$/, '');
        fapiHost = `clerk.${decoded}`;
      } catch { /* ignore */ }
    }
    if (!fapiHost) { err(res, 500, 'Cannot determine Clerk FAPI host'); return; }

    // Strip /clerk-proxy prefix; keep everything after (path + query)
    const upstreamPath = req.url.slice('/clerk-proxy'.length);
    const upstreamUrl  = `https://${fapiHost}${upstreamPath}`;

    const https = require('https');
    const body  = await readBody(req);

    const upstreamReq = https.request(upstreamUrl, {
      method:  req.method,
      headers: {
        ...req.headers,
        host:   fapiHost,
        origin: `https://${fapiHost}`,
      },
    }, (upstreamRes) => {
      // Copy upstream response headers, rewriting CORS to allow the browser
      const forwardHeaders = {};
      for (const [k, v] of Object.entries(upstreamRes.headers)) {
        if (/^(access-control-|content-type|content-length|set-cookie|location|retry-after)/i.test(k)) {
          forwardHeaders[k] = v;
        }
      }
      forwardHeaders['access-control-allow-origin']  = req.headers.origin || '*';
      forwardHeaders['access-control-allow-credentials'] = 'true';
      forwardHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, Cookie';
      forwardHeaders['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
      res.writeHead(upstreamRes.statusCode, forwardHeaders);
      upstreamRes.pipe(res);
    });

    upstreamReq.on('error', (e) => {
      console.error('[clerk-proxy] upstream error:', e.message);
      if (!res.headersSent) err(res, 502, 'Clerk API proxy error');
    });

    if (body.length) upstreamReq.write(body);
    upstreamReq.end();
    return;
  }

  // ── Public: Clerk JS bundle (served locally from node_modules) ──
  if (pathname.startsWith('/clerk-js/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const clerkFile = path.resolve(CLERK_DIST, pathname.slice('/clerk-js/'.length));
    if (!clerkFile.startsWith(CLERK_DIST + path.sep) && clerkFile !== CLERK_DIST) {
      err(res, 403, 'Forbidden'); return;
    }
    try {
      let content = fs.readFileSync(clerkFile);
      const ext  = path.extname(clerkFile).toLowerCase();
      const mime = MIME[ext] || 'application/javascript';
      // For the main clerk.browser.js, patch in the public path so
      // webpack chunk loading works regardless of iframe currentScript state.
      if (pathname === '/clerk-js/clerk.browser.js') {
        const str   = content.toString('utf8');
        // The bundle auto-detects public path via currentScript.src. If that
        // fails it throws. Patch i.p before the auto-detect code runs.
        const patched = str.replace(
          /if\(!e\)throw Error\("Automatic publicPath[^"]*"\)/,
          'if(!e)e="/clerk-js/"',
        );
        content = Buffer.from(patched, 'utf8');
      }
      res.writeHead(200, { 'Content-Type': mime });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(content); return;
    } catch { err(res, 404, 'Not found'); return; }
  }

  // ── API routes (all require auth) ──────────────────────────

  // Welcome message — read/write welcome/welcome.md
  if (pathname === '/api/welcome') {
    if (!await requireAuth(req, res)) return;
    const welcomePath = path.join(ROOT, 'welcome', 'welcome.md');

    if (req.method === 'GET') {
      try {
        const text = fs.readFileSync(welcomePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(text); return;
      } catch { err(res, 404, 'welcome.md not found'); return; }
    }

    if (req.method === 'PUT') {
      try {
        const body = await readBody(req);
        const text = body.toString('utf8');
        fs.mkdirSync(path.dirname(welcomePath), { recursive: true });
        fs.writeFileSync(welcomePath, text, 'utf8');
        json(res, 200, { ok: true }); return;
      } catch (e) { err(res, 500, e.message); return; }
    }

    err(res, 405, 'Method not allowed'); return;
  }

  const mManifest = pathname.match(/^\/api\/manifest\/([^/]+)$/);
  if (mManifest) {
    if (!await requireAuth(req, res)) return;
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
    if (!await requireAuth(req, res)) return;
    const [, dir, filename] = mFile;
    const abs = safePath(dir, filename);
    if (!abs) { err(res, 403, 'Forbidden'); return; }

    if (req.method === 'GET') {
      try {
        const text = fs.readFileSync(abs, 'utf8');
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

    if (req.method === 'PATCH') {
      try {
        const body = await readBody(req);
        const { newFilename } = JSON.parse(body.toString('utf8'));
        if (!newFilename || typeof newFilename !== 'string') {
          err(res, 400, 'newFilename required'); return;
        }
        const newAbs = safePath(dir, newFilename);
        if (!newAbs) { err(res, 400, 'Invalid new filename'); return; }
        if (!fs.existsSync(abs)) { err(res, 404, 'Source file not found'); return; }
        if (fs.existsSync(newAbs)) { err(res, 409, `A file named "${newFilename}" already exists`); return; }
        fs.renameSync(abs, newAbs);
        const manifest = readManifest(dir);
        const idx = manifest.findIndex(e => e.filename === filename);
        if (idx !== -1) {
          manifest[idx] = { ...manifest[idx], filename: newFilename };
          writeManifest(dir, manifest);
        }
        json(res, 200, { ok: true, filename: newFilename }); return;
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
    if (!await requireAuth(req, res)) return;
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

  let filePath = pathname === '/' ? '/index.html' : pathname;

  const abs = publicStaticPath(filePath);
  if (!abs) {
    err(res, 403, 'Forbidden'); return;
  }

  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const idx = path.join(abs, 'index.html');
      if (fs.existsSync(idx)) {
        const content = fs.readFileSync(idx);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content); return;
      }
      err(res, 404, 'Not found'); return;
    }
    const ext  = path.extname(abs).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const content = fs.readFileSync(abs);
    const headers = { 'Content-Type': mime };
    if (['.html', '.css', '.js'].includes(ext)) {
      headers['Cache-Control'] = 'no-cache, must-revalidate';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(content);
  } catch {
    err(res, 404, 'Not found');
  }
}

module.exports = handle;

if (require.main === module) {
const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    console.error('[server error]', e);
    try { err(res, 500, 'Internal server error'); } catch { /* already sent */ }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`JMT desktop server running on http://0.0.0.0:${PORT}`);
  console.log('Admin is available at /admin/admin.html');
});

// Keep the existing admin-port preview available while the public desktop and
// desktop share port 80. Both listeners use this one process.
if (PORT === 80) {
  http.createServer((req, res) => {
    handle(req, res).catch(e => {
      console.error('[admin server error]', e);
      try { err(res, 500, 'Internal server error'); } catch { /* already sent */ }
    });
  }).listen(3001, '0.0.0.0', () => {
    console.log('JMT admin port running on http://0.0.0.0:3001');
  });
}
}

