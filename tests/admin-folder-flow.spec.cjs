const { test, expect } = require('@playwright/test');
const { generateKeyPairSync, randomUUID, sign } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { createServer } = require('node:http');
const { resolve } = require('node:path');

const rootDir = resolve(__dirname, '..');
const apiDir = resolve(rootDir, 'artifacts/api-server');
const adminDir = resolve(rootDir, 'artifacts/admin-console');

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve an available test port.');
  }
  await new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
  });
  return address.port;
}

async function waitForHttp(child, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false;
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
  }
  return false;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolveExit => child.once('exit', resolveExit));
}

function createAdminToken(privateKey, suffix) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    sub: `user_test_${suffix}`,
    sid: `sess_test_${suffix}`,
    iss: 'https://test.clerk.accounts.dev',
    iat: now,
    nbf: now,
    exp: now + 300,
  })).toString('base64url');
  const unsigned = `${header}.${claims}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey)
    .toString('base64url')}`;
}

async function readManifest(url, etag) {
  const response = await fetch(url, {
    headers: etag ? { 'If-None-Match': etag } : {},
  });
  return {
    response,
    manifest: response.status === 200 ? await response.json() : undefined,
  };
}

test('signed-in admin folder changes refresh the tree and public manifest', async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, 'requires the content database');

  const build = spawnSync('pnpm', ['--filter', '@workspace/api-server', 'run', 'build'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  assertBuildSucceeded(build);

  const suffix = randomUUID();
  const createdPath = `admin-folder-created-${suffix}`;
  const renamedPath = `admin-folder-renamed-${suffix}`;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwtKey = publicKey.export({ type: 'spki', format: 'pem' });
  const token = createAdminToken(privateKey, suffix);
  const apiPort = await availablePort();
  const secondApiPort = await availablePort();
  const adminPort = await availablePort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const secondApiBaseUrl = `http://127.0.0.1:${secondApiPort}`;
  const adminBaseUrl = `http://127.0.0.1:${adminPort}`;
  const apiEnv = { ...process.env, CLERK_JWT_KEY: jwtKey, PORT: String(apiPort) };
  const secondApiEnv = { ...apiEnv, PORT: String(secondApiPort) };
  const adminEnv = { ...process.env, BASE_PATH: '/', PORT: String(adminPort) };
  delete adminEnv.REPL_ID;

  const api = spawn(process.execPath, ['dist/index.mjs'], {
    cwd: apiDir,
    env: apiEnv,
    stdio: 'ignore',
  });
  const secondApi = spawn(process.execPath, ['dist/index.mjs'], {
    cwd: apiDir,
    env: secondApiEnv,
    stdio: 'ignore',
  });
  const admin = spawn('pnpm', ['--filter', '@workspace/admin-console', 'run', 'dev'], {
    cwd: rootDir,
    env: adminEnv,
    stdio: 'ignore',
  });

  let folderId;
  try {
    expect(await waitForHttp(api, `${apiBaseUrl}/api/healthz`)).toBe(true);
    expect(await waitForHttp(secondApi, `${secondApiBaseUrl}/api/healthz`)).toBe(true);
    expect(await waitForHttp(admin, adminBaseUrl)).toBe(true);

    await page.route('**/api/clerk-config', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ publishableKey: 'pk_test_admin-folder-flow' }),
    }));
    await page.route('**/clerk-js/clerk.browser.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `window.Clerk = {
        user: { id: 'user_test_${suffix}' },
        session: { getToken: async () => '${token}' },
        load: async () => {},
        addListener: () => () => {},
        mountSignIn: () => {},
        unmountSignIn: () => {},
        signOut: async () => {},
      };`,
    }));
    await page.route('**/api/content/**', async route => {
      const request = route.request();
      const target = `${apiBaseUrl}${new URL(request.url()).pathname}`;
      const upstream = await route.fetch({
        url: target,
        method: request.method(),
        headers: request.headers(),
        ...(request.postDataBuffer()
          ? { postData: request.postDataBuffer() }
          : {}),
      });
      await route.fulfill({ response: upstream });
    });

    await page.goto(adminBaseUrl);
    await expect(page.getByTestId('create-folder')).toBeVisible();
    await expect(page.getByTestId('status-loading-files')).toHaveCount(0);

    const previousManifest = await readManifest(`${apiBaseUrl}/files/manifest.json`);
    expect(previousManifest.response.status).toBe(200);
    const createResponse = page.waitForResponse(response =>
      response.url().includes('/api/content/folders') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('create-folder').click();
    await page.getByTestId('input-folder-name').fill(createdPath);
    await page.getByTestId('save-folder').click();
    const createdResponse = await createResponse;
    expect(createdResponse.status()).toBe(201);
    const createdFolder = await createdResponse.json();
    folderId = createdFolder.id;
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveText(createdPath);

    let publicRoot = await readManifest(
      `${secondApiBaseUrl}/files/manifest.json`,
      previousManifest.response.headers.get('etag'),
    );
    expect(publicRoot.response.status).toBe(200);
    expect(publicRoot.manifest.folders.some(folder => folder.path === createdPath)).toBe(true);
    expect((await readManifest(
      `${secondApiBaseUrl}/files/manifest.json`,
      publicRoot.response.headers.get('etag'),
    )).response.status).toBe(304);

    const beforeRename = await readManifest(`${apiBaseUrl}/files/manifest.json`);
    const renameResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/content/folders/${folderId}`) &&
      response.request().method() === 'PATCH',
    );
    await page.getByTestId(`rename-folder-${folderId}`).click();
    await page.getByTestId('input-folder-name').fill(renamedPath);
    await page.getByTestId('save-folder').click();
    expect((await renameResponsePromise).status()).toBe(200);
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveText(renamedPath);
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveCount(1);

    publicRoot = await readManifest(
      `${secondApiBaseUrl}/files/manifest.json`,
      beforeRename.response.headers.get('etag'),
    );
    expect(publicRoot.response.status).toBe(200);
    expect(publicRoot.manifest.folders.some(folder => folder.path === createdPath)).toBe(false);
    expect(publicRoot.manifest.folders.some(folder => folder.path === renamedPath)).toBe(true);
    expect((await readManifest(
      `${secondApiBaseUrl}/files/manifest.json`,
      publicRoot.response.headers.get('etag'),
    )).response.status).toBe(304);
    expect((await readManifest(
      `${secondApiBaseUrl}/files/${encodeURIComponent(createdPath)}/manifest.json`,
    )).response.status).toBe(404);
    expect((await readManifest(
      `${secondApiBaseUrl}/files/${encodeURIComponent(renamedPath)}/manifest.json`,
    )).response.status).toBe(200);

    const beforeDelete = await readManifest(`${apiBaseUrl}/files/manifest.json`);
    page.once('dialog', dialog => dialog.accept());
    const deleteResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/content/folders/${folderId}`) &&
      response.request().method() === 'DELETE',
    );
    await page.getByTestId(`delete-folder-${folderId}`).click();
    expect((await deleteResponsePromise).status()).toBe(204);
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveCount(0);

    publicRoot = await readManifest(
      `${secondApiBaseUrl}/files/manifest.json`,
      beforeDelete.response.headers.get('etag'),
    );
    expect(publicRoot.response.status).toBe(200);
    expect(publicRoot.manifest.folders.some(folder => folder.path === renamedPath)).toBe(false);
    expect((await readManifest(
      `${secondApiBaseUrl}/files/manifest.json`,
      publicRoot.response.headers.get('etag'),
    )).response.status).toBe(304);
    expect((await readManifest(
      `${secondApiBaseUrl}/files/${encodeURIComponent(renamedPath)}/manifest.json`,
    )).response.status).toBe(404);
  } finally {
    if (folderId) {
      await fetch(`${apiBaseUrl}/api/content/folders/${folderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    await Promise.all([stop(admin), stop(api), stop(secondApi)]);
  }
});

function assertBuildSucceeded(result) {
  if (result.status !== 0) {
    throw new Error(
      `Could not build the API server for the browser test:\n${result.stderr || result.stdout}`,
    );
  }
}
