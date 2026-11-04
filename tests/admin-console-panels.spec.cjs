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
    url: 'https://example.test/files/20260202_mountain.jpg',
    updatedAt: '2026-02-02T00:00:00.000Z',
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

async function mockConsoleApi(page, treeHandler = route => fulfillJson(route, tree)) {
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
    if (path === '/api/content/tree') return treeHandler(route);
    if (path === '/api/content/trash') return fulfillJson(route, []);
    if (/^\/api\/content\/files\/[^/]+\/versions$/.test(path)) return fulfillJson(route, []);
    return fulfillJson(route, { error: 'Unexpected test request.' }, 404);
  });
}

function fulfillJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

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
