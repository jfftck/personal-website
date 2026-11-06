const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');

const rootDir = require('node:path').resolve(__dirname, '..');
let adminProcess;
let adminUrl;

const folders = [
  {
    id: 'folder-photos',
    name: 'Photos',
    path: 'photos',
    parentPath: '',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'folder-events',
    name: 'Events',
    path: 'photos/events',
    parentPath: 'photos',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

const files = [
  {
    id: 'file-root',
    name: '20260101_notes.md',
    originalFileName: 'notes.md',
    title: 'Root notes',
    description: '',
    folderPath: '',
    date: '2026-01-01',
    contentType: 'text/markdown',
    sizeBytes: 128,
    isWallpaper: false,
    isPublished: false,
    stylesheetId: null,
    url: 'https://example.test/files/20260101_notes.md',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'file-photo',
    name: '20260202_mountain.jpg',
    originalFileName: 'mountain.jpg',
    title: 'Mountain photo',
    description: 'A test image.',
    folderPath: 'photos',
    date: '2026-02-02',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    isWallpaper: true,
    isPublished: true,
    stylesheetId: null,
    url: 'https://example.test/files/20260202_mountain.jpg',
    updatedAt: '2026-02-02T00:00:00.000Z',
  },
  {
    id: 'file-doc',
    name: '20260303_Styled_document.md',
    originalFileName: 'styled-document.md',
    title: 'Styled document',
    description: '',
    folderPath: 'documents',
    date: '2026-03-03',
    contentType: 'text/markdown',
    sizeBytes: 24,
    isWallpaper: false,
    isPublished: true,
    stylesheetId: 'file-style',
    url: 'https://example.test/files/documents/20260303_Styled_document.md',
    updatedAt: '2026-03-03T00:00:00.000Z',
  },
  {
    id: 'file-doc-two',
    name: '20260304_Another_document.md',
    originalFileName: 'another-document.md',
    title: 'Another document',
    description: '',
    folderPath: 'documents',
    date: '2026-03-04',
    contentType: 'text/markdown',
    sizeBytes: 24,
    isWallpaper: false,
    isPublished: true,
    stylesheetId: 'file-style',
    url: 'https://example.test/files/documents/20260304_Another_document.md',
    updatedAt: '2026-03-04T00:00:00.000Z',
  },
  {
    id: 'file-style',
    name: '20260301_Ocean.css',
    originalFileName: 'Ocean.css',
    title: 'Ocean',
    description: '',
    folderPath: 'stylesheets',
    date: '2026-03-01',
    contentType: 'text/css',
    sizeBytes: 32,
    isWallpaper: false,
    isPublished: true,
    stylesheetId: null,
    url: 'https://example.test/files/stylesheets/20260301_Ocean.css',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
];

const tree = { folders, files };

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve an admin test port.');
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

test.beforeAll(async () => {
  const port = await availablePort();
  const env = { ...process.env, BASE_PATH: '/', PORT: String(port) };
  delete env.REPL_ID;
  adminProcess = spawn('pnpm', ['--filter', '@workspace/admin-console', 'run', 'dev'], {
    cwd: rootDir,
    env,
    stdio: 'ignore',
  });
  adminUrl = `http://127.0.0.1:${port}`;
  if (!await waitForHttp(adminProcess, adminUrl)) {
    await stop(adminProcess);
    throw new Error('The admin console did not start for its panel tests.');
  }
});

test.afterAll(async () => {
  await stop(adminProcess);
});

async function mockConsoleApi(page, treeHandler) {
  const requests = [];
  const currentTree = {
    folders: folders.map(folder => ({ ...folder })),
    files: files.map(file => ({ ...file })),
  };
  const respondTree = treeHandler ?? (route => fulfillJson(route, currentTree));
  await page.route('**/api/auth/user', route => fulfillJson(route, {
    user: {
      id: 'test-owner',
      username: 'test-owner',
      email: 'owner@example.test',
      firstName: 'Test',
      lastName: null,
      profileImageUrl: null,
    },
    isOwner: true,
  }));
  await page.route('**/api/content/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/content/files/file-doc/content' || path === '/api/content/files/file-style/content') {
      return route.fulfill({
        contentType: 'text/plain',
        body: path.endsWith('/file-style/content') ? 'p { color: navy; }' : '# Styled document',
      });
    }
    if (path === '/api/content/tree') {
      requests.push({ method, path });
      return respondTree(route);
    }
    if (path === '/api/content/trash') return fulfillJson(route, []);
    if (/^\/api\/content\/files\/[^/]+\/versions$/.test(path)) return fulfillJson(route, []);
    if (path === '/api/content/uploads' && method === 'POST') {
      requests.push({ method, path, body: route.request().postDataJSON() });
      return fulfillJson(route, { uploadUrl: `${adminUrl}/test-upload`, objectPath: 'private/test-object' });
    }
    if (path === '/api/content/files' && method === 'POST') {
      const body = route.request().postDataJSON();
      requests.push({ method, path, body });
      return fulfillJson(route, {
        id: 'file-style-new',
        ...body,
        posterUrl: null,
        stylesheetId: null,
        isPublished: true,
        url: 'https://example.test/files/stylesheets/new.css',
        updatedAt: '2026-03-05T00:00:00.000Z',
      });
    }
    if (/^\/api\/content\/files\/[^/]+$/.test(path) && method === 'PATCH') {
      const fileId = path.split('/').at(-1);
      const body = route.request().postDataJSON();
      requests.push({ method, path, body });
      const fileIndex = currentTree.files.findIndex(file => file.id === fileId);
      const existing = currentTree.files[fileIndex] || {};
      const updated = {
        ...existing,
        ...body,
        updatedAt: '2026-03-05T00:00:00.000Z',
        url: existing.url || 'https://example.test/files/updated.md',
      };
      if (fileIndex >= 0) currentTree.files[fileIndex] = updated;
      return fulfillJson(route, updated);
    }
    if (/^\/api\/content\/files\/[^/]+$/.test(path) && method === 'DELETE') {
      requests.push({ method, path });
      return route.fulfill({ status: 204 });
    }
    return fulfillJson(route, { error: 'Unexpected test request.' }, 404);
  });
  await page.route('**/test-upload', route => route.fulfill({ status: 200, body: '' }));
  return { requests };
}

async function mockUploadRevisionApi(page) {
  const requests = [];
  const currentTree = {
    folders: folders.map(folder => ({ ...folder })),
    files: files.map(file => ({ ...file })),
  };
  const versions = [];
  let currentBytes = Buffer.alloc(0);
  let rejectNextUpload = false;
  let rejectNextMetadataSave = false;
  let rejectNextRestore = false;
  let timestampCounter = 0;

  const nextTimestamp = () => `2026-11-06T12:${String(++timestampCounter).padStart(2, '0')}:00.000Z`;
  const makeVersion = (file, action, bytes) => {
    const versionNumber = Math.max(0, ...versions.map(version => version.versionNumber)) + 1;
    const gitCommitSha = String(versionNumber).padStart(40, '0');
    const version = {
      id: `revision-${versionNumber}`,
      versionNumber,
      action,
      name: file.name,
      originalFileName: file.originalFileName,
      title: file.title,
      description: file.description,
      folderPath: file.folderPath,
      date: file.date,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      isWallpaper: file.isWallpaper ?? false,
      stylesheetId: file.stylesheetId ?? null,
      isDeleted: false,
      createdAt: nextTimestamp(),
      gitCommitSha,
      gitUrl: `https://github.com/jfftck/personal-files/commit/${gitCommitSha}`,
      savedFile: { ...file },
      savedBytes: Buffer.from(bytes),
    };
    versions.unshift(version);
    return version;
  };
  const versionResponse = () => versions.map(({ savedFile, savedBytes, ...version }) => version);

  await page.route('**/api/auth/user', route => fulfillJson(route, {
    user: {
      id: 'test-owner',
      username: 'test-owner',
      email: 'owner@example.test',
      firstName: 'Test',
      lastName: null,
      profileImageUrl: null,
    },
    isOwner: true,
  }));
  await page.route('**/api/content/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/content/tree' && method === 'GET') {
      requests.push({ method, path });
      return fulfillJson(route, {
        folders: currentTree.folders.map(folder => ({ ...folder })),
        files: currentTree.files.map(file => ({ ...file })),
      });
    }
    if (path === '/api/content/trash' && method === 'GET') return fulfillJson(route, []);
    if (path === '/api/content/uploads' && method === 'POST') {
      requests.push({ method, path, body: route.request().postDataJSON() });
      return fulfillJson(route, {
        uploadUrl: `${adminUrl}/test-upload`,
        objectPath: '/objects/uploads/test-upload-object',
      });
    }
    if (path === '/api/content/files' && method === 'POST') {
      const body = route.request().postDataJSON();
      const file = {
        id: 'file-upload-test',
        ...body,
        posterUrl: null,
        isPublished: true,
        stylesheetId: null,
        url: `https://example.test/files/${body.folderPath ? `${body.folderPath}/` : ''}${body.name}`,
        updatedAt: nextTimestamp(),
      };
      currentTree.files = [...currentTree.files.filter(item => item.id !== file.id), file];
      makeVersion(file, 'created', currentBytes);
      requests.push({ method, path, body });
      return fulfillJson(route, file, 201);
    }
    if (path === '/api/content/files/file-upload-test/content' && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: currentBytes });
    }
    if (path === '/api/content/files/file-upload-test/versions' && method === 'GET') {
      return fulfillJson(route, versionResponse());
    }
    if (path === '/api/content/files/file-upload-test' && method === 'PATCH') {
      const body = route.request().postDataJSON();
      requests.push({ method, path, body });
      if (rejectNextMetadataSave) {
        rejectNextMetadataSave = false;
        return fulfillJson(route, { error: 'Temporary metadata save failure.' }, 503);
      }
      const current = currentTree.files.find(file => file.id === 'file-upload-test');
      const updated = {
        ...current,
        ...body,
        updatedAt: nextTimestamp(),
        url: current.url,
      };
      currentTree.files = currentTree.files.map(file => file.id === updated.id ? updated : file);
      makeVersion(updated, 'updated', currentBytes);
      return fulfillJson(route, updated);
    }
    const restoreMatch = path.match(/^\/api\/content\/files\/file-upload-test\/versions\/(revision-\d+)\/restore$/);
    if (restoreMatch && method === 'POST') {
      if (rejectNextRestore) {
        rejectNextRestore = false;
        requests.push({ method, path, failed: true });
        return fulfillJson(route, { error: 'Temporary revision restore failure.' }, 503);
      }
      const revision = versions.find(version => version.id === restoreMatch[1]);
      if (!revision) return fulfillJson(route, { error: 'The requested revision is missing.' }, 404);
      currentBytes = Buffer.from(revision.savedBytes);
      const restored = { ...revision.savedFile, updatedAt: nextTimestamp() };
      currentTree.files = currentTree.files.map(file => file.id === restored.id ? restored : file);
      makeVersion(restored, 'restored', currentBytes);
      requests.push({ method, path });
      return fulfillJson(route, restored);
    }
    return fulfillJson(route, { error: 'Unexpected test request.' }, 404);
  });
  await page.route('**/test-upload', async route => {
    if (rejectNextUpload) {
      rejectNextUpload = false;
      return route.fulfill({ status: 503, body: 'Temporary upload failure.' });
    }
    currentBytes = Buffer.from(route.request().postDataBuffer() ?? Buffer.alloc(0));
    return route.fulfill({ status: 200, body: '' });
  });

  return {
    requests,
    getCurrentFile: () => currentTree.files.find(file => file.id === 'file-upload-test'),
    getCurrentBytes: () => Buffer.from(currentBytes),
    rejectNextUpload: () => { rejectNextUpload = true; },
    rejectNextMetadataSave: () => { rejectNextMetadataSave = true; },
    rejectNextRestore: () => { rejectNextRestore = true; },
  };
}

function fulfillJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test('Markdown documents can select a saved stylesheet or reset to the default', async ({ page }) => {
  const { requests } = await mockConsoleApi(page);
  await page.goto(adminUrl);
  await page.getByTestId('edit-text-file-doc').click();
  await expect(page.getByTestId('select-document-stylesheet')).toContainText('Ocean');

  await page.getByTestId('select-document-stylesheet').click();
  await page.getByRole('option', { name: 'Default' }).click();
  await page.getByTestId('save-text-file').click();

  await expect.poll(() => requests.find(request => request.method === 'PATCH' && request.path.endsWith('/file-doc'))?.body.stylesheetId).toBeNull();
});

test('document editor can create a CSS stylesheet and assign it to the document', async ({ page }) => {
  const { requests } = await mockConsoleApi(page);
  await page.goto(adminUrl);
  await page.getByTestId('edit-text-file-doc').click();
  await page.getByTestId('select-document-stylesheet').click();
  await page.getByRole('option', { name: 'Create New…' }).click();

  await expect(page.getByRole('dialog', { name: 'Create CSS stylesheet' })).toBeVisible();
  await page.getByTestId('input-stylesheet-title').fill('Paper');
  await page.getByTestId('textarea-stylesheet-content').fill('h1 { color: #123456; }');
  await page.getByTestId('save-stylesheet').click();

  await expect(page.getByTestId('select-document-stylesheet')).toContainText('Paper');
  const createRequest = requests.find(request => request.method === 'POST' && request.path === '/api/content/files');
  expect(createRequest.body.folderPath).toBe('stylesheets');
  expect(createRequest.body.contentType).toBe('text/css');
  expect(createRequest.body.name).toMatch(/\.css$/);

  await page.getByTestId('save-text-file').click();
  await expect.poll(() => requests.find(request => request.method === 'PATCH' && request.path.endsWith('/file-doc'))?.body.stylesheetId).toBe('file-style-new');
});

test('deleting a stylesheet confirms affected documents and resets them to default', async ({ page }) => {
  await mockConsoleApi(page);
  await page.goto(adminUrl);
  await page.getByTestId('edit-text-file-style').click();
  await expect(page.getByTestId('textarea-stylesheet-content')).toBeVisible();

  const confirm = page.waitForEvent('dialog');
  const click = page.getByTestId('delete-stylesheet').click();
  const dialog = await confirm;
  expect(dialog.message()).toContain('2 documents');
  expect(dialog.message()).toContain('reset to Default');
  await dialog.accept();
  await click;

  await expect(page.getByTestId('file-row-file-style')).toHaveCount(0);
  await page.getByTestId('edit-text-file-doc').click();
  await expect(page.getByTestId('select-document-stylesheet')).toContainText('Default');
});

test('folder navigation filters the file list and clears the prior selection', async ({ page }) => {
  await mockConsoleApi(page);
  await page.goto(adminUrl);

  const rootFile = page.getByTestId('file-row-file-root');
  await expect(rootFile).toBeVisible();
  await expect(page.getByTestId('file-row-file-photo')).toBeVisible();

  await rootFile.focus();
  await rootFile.press('Enter');
  await expect(rootFile).toHaveClass(/selected/);
  await expect(page.getByTestId('input-file-title')).toHaveValue('Root notes');

  const photosFolder = page.getByTestId('select-folder-folder-photos');
  await photosFolder.click();
  await expect(photosFolder).toHaveClass(/active/);
  await expect(page.getByTestId('file-row-file-root')).toHaveCount(0);
  await expect(page.getByTestId('file-row-file-photo')).toBeVisible();
  await expect(page.getByText('Select a file to edit its title, content date, or text.')).toBeVisible();
});

test('selecting a file opens and closes the mobile details panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockConsoleApi(page);
  await page.goto(adminUrl);

  const details = page.locator('.detail-panel');
  await expect(page.getByTestId('file-row-file-photo')).toBeVisible();
  await expect(details).toBeHidden();

  await page.getByTestId('file-row-file-photo').click();
  await expect(details).toBeVisible();
  await expect(details).toHaveClass(/mobile-visible/);
  await expect(details.getByRole('heading', { name: 'File details' })).toBeVisible();
  await expect(details.getByTestId('input-file-title')).toHaveValue('Mountain photo');

  await details.getByTestId('close-file-details').click();
  await expect(details).toBeHidden();
});

test('desktop file details stay beside the list and preserve previews and revision history', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockConsoleApi(page);
  await page.goto(adminUrl);

  const details = page.locator('.detail-panel');
  const emptyMessage = 'Select a file to edit its title, content date, or text.';
  await expect(details).toBeVisible();
  await expect(details.getByText(emptyMessage)).toBeVisible();

  await page.getByTestId('file-row-file-photo').click();
  await expect(details.getByTestId('input-file-title')).toHaveValue('Mountain photo');
  await expect(details.locator('.detail-media')).toHaveAttribute(
    'src',
    'https://example.test/files/20260202_mountain.jpg',
  );
  await expect(details.getByTestId('revision-history')).toBeVisible();
  await expect(details.getByTestId('publication-status-file-photo')).toHaveText('Published');

  await details.getByTestId('close-file-details').click();
  await expect(details.getByText(emptyMessage)).toBeVisible();
});

test('publishing a file updates its details, list state, and refreshed tree', async ({ page }) => {
  const { requests } = await mockConsoleApi(page);
  await page.goto(adminUrl);

  const fileRow = page.getByTestId('file-row-file-root');
  await fileRow.click();
  const details = page.locator('.detail-panel');
  await expect(details.getByTestId('publication-status-file-root')).toHaveText('Unpublished');
  await expect(details.getByTestId('toggle-publication-file-root')).toHaveText('Publish');
  const initialTreeRequests = requests.filter(request => request.method === 'GET' && request.path === '/api/content/tree').length;

  await details.getByTestId('toggle-publication-file-root').click();
  await expect(details.getByTestId('publication-status-file-root')).toHaveText('Published');
  await expect(fileRow.getByTestId('file-publication-state-file-root')).toHaveText('Published');
  await expect(details.getByTestId('toggle-publication-file-root')).toHaveText('Unpublish');
  await expect.poll(() => requests.some(request =>
    request.method === 'PATCH' &&
    request.path.endsWith('/file-root') &&
    request.body.isPublished === true,
  )).toBe(true);
  await expect.poll(() =>
    requests.filter(request => request.method === 'GET' && request.path === '/api/content/tree').length,
  ).toBeGreaterThan(initialTreeRequests);

  await details.getByTestId('toggle-publication-file-root').click();
  await expect(details.getByTestId('publication-status-file-root')).toHaveText('Unpublished');
  await expect(fileRow.getByTestId('file-publication-state-file-root')).toHaveText('Unpublished');
});

test('signed-in upload, metadata edits, and revision restore keep file bytes paired with metadata', async ({ page }) => {
  const api = await mockUploadRevisionApi(page);
  const originalBytes = Buffer.from('Original uploaded document bytes.\n');
  const originalMetadata = {
    title: 'Original Upload',
    description: 'Original description.',
    date: '2026-10-30',
  };
  const editedMetadata = {
    title: 'Revised Upload',
    description: 'Revised description.',
    date: '2026-11-02',
  };

  await page.goto(adminUrl);
  await page.getByTestId('open-upload').click();
  await page.getByTestId('input-upload-file').setInputFiles({
    name: 'source-notes.txt',
    mimeType: 'text/plain',
    buffer: originalBytes,
  });
  await page.getByTestId('input-upload-title').fill(originalMetadata.title);
  await page.getByTestId('input-upload-description').fill(originalMetadata.description);
  await page.getByTestId('input-upload-date').fill(originalMetadata.date);

  api.rejectNextUpload();
  await page.getByTestId('submit-upload').click();
  await expect(page.getByTestId('status-toast')).toHaveText('File upload failed (503).');
  await expect(page.getByTestId('input-upload-title')).toHaveValue(originalMetadata.title);
  await expect(page.getByTestId('input-upload-description')).toHaveValue(originalMetadata.description);
  await expect(page.getByTestId('input-upload-date')).toHaveValue(originalMetadata.date);
  await expect(page.getByTestId('input-upload-original-name')).toHaveValue('source-notes.txt');

  const uploadResponse = page.waitForResponse(response =>
    response.url().includes('/api/content/files') &&
    response.request().method() === 'POST',
  );
  await page.getByTestId('submit-upload').click();
  const uploaded = await (await uploadResponse).json();
  expect(uploaded.id).toBe('file-upload-test');
  await expect(page.getByTestId('input-file-title')).toHaveValue(originalMetadata.title);
  await expect(page.getByTestId('input-file-description')).toHaveValue(originalMetadata.description);
  await expect(page.getByTestId('input-file-date')).toHaveValue(originalMetadata.date);
  await expect(page.getByTestId('revision-1')).toBeVisible();
  expect(api.getCurrentBytes().equals(originalBytes)).toBe(true);

  await page.getByTestId('input-file-title').fill(editedMetadata.title);
  await page.getByTestId('input-file-description').fill(editedMetadata.description);
  await page.getByTestId('input-file-date').fill(editedMetadata.date);
  api.rejectNextMetadataSave();
  await page.getByTestId('save-file-details').click();
  await expect(page.getByTestId('status-toast')).toHaveText('Temporary metadata save failure.');
  await expect(page.getByTestId('input-file-title')).toHaveValue(editedMetadata.title);
  await expect(page.getByTestId('input-file-description')).toHaveValue(editedMetadata.description);
  await expect(page.getByTestId('input-file-date')).toHaveValue(editedMetadata.date);
  await expect(page.locator('.detail-file h3')).toHaveText(originalMetadata.title);
  expect(api.getCurrentFile().title).toBe(originalMetadata.title);
  expect(api.getCurrentBytes().equals(originalBytes)).toBe(true);

  await page.getByTestId('save-file-details').click();
  await expect(page.getByTestId('input-file-title')).toHaveValue(editedMetadata.title);
  await expect(page.getByTestId('input-file-description')).toHaveValue(editedMetadata.description);
  await expect(page.getByTestId('input-file-date')).toHaveValue(editedMetadata.date);
  await expect(page.getByTestId('revision-2')).toBeVisible();

  await page.reload();
  await page.getByTestId('file-row-file-upload-test').click();
  await expect(page.getByTestId('input-file-title')).toHaveValue(editedMetadata.title);
  await expect(page.getByTestId('input-file-description')).toHaveValue(editedMetadata.description);
  await expect(page.getByTestId('input-file-date')).toHaveValue(editedMetadata.date);
  const readStoredBytes = () => page.evaluate(async fileId => {
    const response = await fetch(`/api/content/files/${fileId}/content`);
    if (!response.ok) throw new Error(`Could not read stored file bytes (${response.status}).`);
    return response.text();
  }, uploaded.id);
  expect(await readStoredBytes()).toBe(originalBytes.toString());

  api.rejectNextRestore();
  const failedRestoreDialog = page.waitForEvent('dialog');
  const failedRestoreClick = page.getByTestId('restore-revision-1').click();
  const failedRestoreConfirmation = await failedRestoreDialog;
  await failedRestoreConfirmation.accept();
  await failedRestoreClick;
  await expect(page.getByTestId('status-toast')).toHaveText('Temporary revision restore failure.');
  await expect(page.getByTestId('input-file-title')).toHaveValue(editedMetadata.title);
  await expect(page.getByTestId('input-file-description')).toHaveValue(editedMetadata.description);
  await expect(page.getByTestId('input-file-date')).toHaveValue(editedMetadata.date);
  expect(api.getCurrentFile().title).toBe(editedMetadata.title);
  expect(api.getCurrentBytes().equals(originalBytes)).toBe(true);

  const confirmRestore = page.waitForEvent('dialog');
  const restoreClick = page.getByTestId('restore-revision-1').click();
  const dialog = await confirmRestore;
  expect(dialog.message()).toContain('Restore version 1');
  await dialog.accept();
  await restoreClick;
  await expect(page.getByTestId('input-file-title')).toHaveValue(originalMetadata.title);
  await expect(page.getByTestId('input-file-description')).toHaveValue(originalMetadata.description);
  await expect(page.getByTestId('input-file-date')).toHaveValue(originalMetadata.date);
  expect(await readStoredBytes()).toBe(originalBytes.toString());

  await page.reload();
  await page.getByTestId('file-row-file-upload-test').click();
  await expect(page.getByTestId('input-file-title')).toHaveValue(originalMetadata.title);
  await expect(page.getByTestId('input-file-description')).toHaveValue(originalMetadata.description);
  await expect(page.getByTestId('input-file-date')).toHaveValue(originalMetadata.date);
  expect(await readStoredBytes()).toBe(originalBytes.toString());
  expect(api.getCurrentFile().title).toBe(originalMetadata.title);
  expect(api.getCurrentBytes().equals(originalBytes)).toBe(true);
});

test('file list shows its loading placeholder until folder and file data arrives', async ({ page }) => {
  let releaseTree;
  const treeResponse = new Promise(resolve => { releaseTree = resolve; });
  await mockConsoleApi(page, async route => {
    await treeResponse;
    return fulfillJson(route, tree);
  });
  await page.goto(adminUrl);

  await expect(page.getByTestId('status-loading-files')).toBeVisible();
  releaseTree();
  await expect(page.getByTestId('file-row-file-root')).toBeVisible();
  await expect(page.getByTestId('status-loading-files')).toHaveCount(0);
});

test('file list error can be retried without losing the navigation or selection state', async ({ page }) => {
  let failTree = true;
  await mockConsoleApi(page, route => failTree
    ? fulfillJson(route, { error: 'Temporary test outage.' }, 503)
    : fulfillJson(route, tree));
  await page.goto(adminUrl);

  await expect(page.getByTestId('status-load-error')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Couldn’t load the library' })).toBeVisible();

  failTree = false;
  await page.getByTestId('retry-load').click();
  await expect(page.getByTestId('file-row-file-root')).toBeVisible();
  await expect(page.getByTestId('select-folder-folder-photos')).toBeVisible();
});
