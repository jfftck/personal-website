const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
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
  const correctedPath = `admin-folder-corrected-${suffix}`;
  const renamedPath = `admin-folder-renamed-${suffix}`;
  const ownerUsername = process.env.REPL_OWNER || `owner-${suffix}`;
  const sessionId = randomUUID();
  const requireFromDatabasePackage = createRequire(resolve(rootDir, 'lib/db/src/index.ts'));
  const { Pool } = requireFromDatabasePackage('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const apiPort = await availablePort();
  const secondApiPort = await availablePort();
  const adminPort = await availablePort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const secondApiBaseUrl = `http://127.0.0.1:${secondApiPort}`;
  const adminBaseUrl = `http://127.0.0.1:${adminPort}`;
  const apiEnv = { ...process.env, REPL_OWNER: ownerUsername, PORT: String(apiPort) };
  const secondApiEnv = { ...apiEnv, PORT: String(secondApiPort) };
  const adminEnv = { ...process.env, BASE_PATH: '/', PORT: String(adminPort) };
  delete adminEnv.REPL_ID;
  const now = Math.floor(Date.now() / 1000);
  const expire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2::jsonb, $3)`,
    [
      sessionId,
      JSON.stringify({
        user: {
          id: `admin-folder-flow-${suffix}`,
          username: ownerUsername,
          email: `${ownerUsername}@example.test`,
          firstName: 'Test',
          lastName: null,
          profileImageUrl: null,
        },
        access_token: 'test-session',
        expires_at: now + 3600,
      }),
      expire,
    ],
  );

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
  let childFolderId;
  let correctedFolderId;
  try {
    expect(await waitForHttp(api, `${apiBaseUrl}/api/healthz`)).toBe(true);
    expect(await waitForHttp(secondApi, `${secondApiBaseUrl}/api/healthz`)).toBe(true);
    expect(await waitForHttp(admin, adminBaseUrl)).toBe(true);

    const proxyApiRequest = async route => {
      const request = route.request();
      const target = `${apiBaseUrl}${new URL(request.url()).pathname}`;
      const upstream = await route.fetch({
        url: target,
        method: request.method(),
        headers: { ...request.headers(), Cookie: `sid=${sessionId}` },
        ...(request.postDataBuffer()
          ? { postData: request.postDataBuffer() }
          : {}),
      });
      await route.fulfill({ response: upstream });
    };
    await page.route('**/api/auth/user', proxyApiRequest);
    await page.route('**/api/content/**', proxyApiRequest);

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

    const duplicateCreateResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/content/folders') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('create-folder').click();
    await page.getByTestId('input-folder-name').fill(createdPath);
    await page.getByTestId('save-folder').click();
    const duplicateCreateResponse = await duplicateCreateResponsePromise;
    expect(duplicateCreateResponse.status()).toBe(409);
    expect((await duplicateCreateResponse.json()).error).toBe(
      'A folder with that name already exists in this location.',
    );
    await expect(page.getByRole('heading', { name: 'Create folder' })).toBeVisible();
    await expect(page.getByTestId('input-folder-name')).toHaveValue(createdPath);
    await expect(page.getByTestId('error-folder-name')).toHaveText(
      'A folder with that name already exists in this location.',
    );
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveText(createdPath);
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveCount(1);

    const correctedCreateResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/content/folders') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('input-folder-name').fill(correctedPath);
    await expect(page.getByTestId('error-folder-name')).toHaveCount(0);
    await page.getByTestId('save-folder').click();
    const correctedCreateResponse = await correctedCreateResponsePromise;
    expect(correctedCreateResponse.status()).toBe(201);
    correctedFolderId = (await correctedCreateResponse.json()).id;
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveText(createdPath);
    await expect(page.getByTestId(`select-folder-${correctedFolderId}`)).toHaveText(correctedPath);

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

    const childPath = `child-${suffix}`;
    const childCreateResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/content/folders') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId(`add-subfolder-${folderId}`).click();
    await page.getByTestId('input-folder-name').fill(childPath);
    await page.getByTestId('save-folder').click();
    const childCreateResponse = await childCreateResponsePromise;
    expect(childCreateResponse.status()).toBe(201);
    childFolderId = (await childCreateResponse.json()).id;
    await expect(page.getByTestId(`select-folder-${childFolderId}`)).toHaveText(childPath);

    const beforeDelete = await readManifest(`${apiBaseUrl}/files/manifest.json`);
    page.once('dialog', dialog => dialog.accept());
    const deleteResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/content/folders/${folderId}`) &&
      response.request().method() === 'DELETE',
    );
    await page.getByTestId(`delete-folder-${folderId}`).click();
    const rejectedDeleteResponse = await deleteResponsePromise;
    expect(rejectedDeleteResponse.status()).toBe(409);
    expect((await rejectedDeleteResponse.json()).error).toBe('Move or remove this folder’s contents first.');
    await expect(page.getByTestId(`select-folder-${folderId}`)).toHaveText(renamedPath);
    await expect(page.getByTestId(`select-folder-${childFolderId}`)).toHaveText(childPath);
    await expect(page.getByTestId('status-toast')).toHaveText(
      'Move or remove this folder’s contents first.',
    );

    page.once('dialog', dialog => dialog.accept());
    const deleteChildResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/content/folders/${childFolderId}`) &&
      response.request().method() === 'DELETE',
    );
    await page.getByTestId(`delete-folder-${childFolderId}`).click();
    expect((await deleteChildResponsePromise).status()).toBe(204);
    await expect(page.getByTestId(`select-folder-${childFolderId}`)).toHaveCount(0);

    page.once('dialog', dialog => dialog.accept());
    const deleteParentResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/content/folders/${folderId}`) &&
      response.request().method() === 'DELETE',
    );
    await page.getByTestId(`delete-folder-${folderId}`).click();
    expect((await deleteParentResponsePromise).status()).toBe(204);
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
    if (childFolderId) {
      await fetch(`${apiBaseUrl}/api/content/folders/${childFolderId}`, {
        method: 'DELETE',
        headers: { Cookie: `sid=${sessionId}` },
      }).catch(() => {});
    }
    if (correctedFolderId) {
      await fetch(`${apiBaseUrl}/api/content/folders/${correctedFolderId}`, {
        method: 'DELETE',
        headers: { Cookie: `sid=${sessionId}` },
      }).catch(() => {});
    }
    if (folderId) {
      await fetch(`${apiBaseUrl}/api/content/folders/${folderId}`, {
        method: 'DELETE',
        headers: { Cookie: `sid=${sessionId}` },
      }).catch(() => {});
    }
    await Promise.all([stop(admin), stop(api), stop(secondApi)]);
    await pool.query('DELETE FROM sessions WHERE sid = $1', [sessionId]).catch(() => {});
    await pool.end();
  }
});

function assertBuildSucceeded(result) {
  if (result.status !== 0) {
    throw new Error(
      `Could not build the API server for the browser test:\n${result.stderr || result.stdout}`,
    );
  }
}
