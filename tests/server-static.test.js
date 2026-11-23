'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const websiteDir = path.join(rootDir, 'artifacts/personal-website');
const apiDir = path.join(rootDir, 'artifacts/api-server');
let website;
let api;
let websiteUrl;
let apiUrl;

async function availablePorts(count) {
  const servers = Array.from({ length: count }, () => createServer());
  const ports = await Promise.all(servers.map(server => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      resolve(address.port);
    });
  })));
  await Promise.all(servers.map(server => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
  return ports;
}

async function waitForServer(child, url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Test server did not start at ${url}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test.before(async () => {
  const [websitePort, apiPort] = await availablePorts(2);
  websiteUrl = `http://127.0.0.1:${websitePort}`;
  apiUrl = `http://127.0.0.1:${apiPort}`;

  website = spawn(process.execPath, [
    path.join(websiteDir, 'node_modules/vite/bin/vite.js'),
    '--config',
    'vite.config.ts',
    '--host',
    '127.0.0.1',
  ], {
    cwd: websiteDir,
    env: { ...process.env, PORT: String(websitePort), BASE_PATH: '/' },
    stdio: 'ignore',
  });
  api = spawn(process.execPath, [path.join(apiDir, 'dist/index.mjs')], {
    cwd: apiDir,
    env: {
      ...process.env,
      PORT: String(apiPort),
      SESSION_SECRET: 'test-session-secret',
    },
    stdio: 'ignore',
  });

  try {
    await Promise.all([
      waitForServer(website, `${websiteUrl}/`),
      waitForServer(api, `${apiUrl}/api/healthz`),
    ]);
  } catch (error) {
    await Promise.all([stopServer(website), stopServer(api)]);
    throw error;
  }
});

test.after(async () => {
  await Promise.all([stopServer(website), stopServer(api)]);
});

test('serves desktop assets', async () => {
  for (const pathname of ['/', '/desktop.js', '/apps/doc-viewer.js']) {
    const response = await fetch(`${websiteUrl}${pathname}`);
    assert.equal(response.status, 200, pathname);
  }
});

test('admin entry redirects to the same-origin console', async () => {
  const response = await fetch(`${apiUrl}/admin/admin.html`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin-console/');
});

test('does not expose hidden, server, dependency, or memory files', async () => {
  for (const pathname of [
    '/.git/config',
    '/.agents/memory/MEMORY.md',
    '/admin/server.js',
    '/package.json',
  ]) {
    const response = await fetch(`${apiUrl}${pathname}`);
    assert.equal(response.status, 404, pathname);
  }
});
