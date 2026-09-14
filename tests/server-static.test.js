'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const test = require('node:test');

const PORT = 8098;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not start');
}

test.before(async () => {
  server = spawn(process.execPath, ['admin/server.js'], {
    env: { ...process.env, PORT: String(PORT), SESSION_SECRET: 'test-session-secret' },
    stdio: 'ignore',
  });
  await waitForServer();
});

test.after(() => {
  server?.kill('SIGTERM');
});

test('serves desktop assets', async () => {
  for (const pathname of ['/', '/desktop.js', '/apps/doc-viewer.js']) {
    const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
    assert.equal(response.status, 200, pathname);
  }
});

test('does not expose hidden, server, dependency, or memory files', async () => {
  for (const pathname of [
    '/.git/config',
    '/.agents/memory/MEMORY.md',
    '/admin/server.js',
    '/package.json',
  ]) {
    const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
    assert.equal(response.status, 403, pathname);
  }
});
