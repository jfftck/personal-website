const { test, expect } = require('@playwright/test');

let manifests;
let manifestRequests;
let failedFolders;
let errors;
let initialPostsRequestStarted;
let signalInitialPostsRequest;
let releaseInitialPostsRequest;
let holdInitialPostsRequest;
let initialPostsRequestHeld;

test.beforeEach(async ({ page }, testInfo) => {
  manifests = {
    posts: [
      { filename: '20261001_Old_Post.md' },
      { filename: '20261002_Keep_Post.md' },
    ],
    documents: [{ filename: '20261003_Existing_Document.pdf' }],
    pictures: [],
    videos: [],
  };
  manifestRequests = { posts: 0, documents: 0, pictures: 0, videos: 0 };
  failedFolders = new Set();
  errors = [];
  holdInitialPostsRequest = false;
  initialPostsRequestHeld = false;
  initialPostsRequestStarted = new Promise(resolve => {
    signalInitialPostsRequest = resolve;
  });
  let releasePostsRequest;
  const initialPostsRequestGate = new Promise(resolve => {
    releasePostsRequest = resolve;
  });
  releaseInitialPostsRequest = releasePostsRequest;

  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/files/*/manifest.json', async route => {
    const folder = new URL(route.request().url()).pathname.split('/')[2];
    manifestRequests[folder]++;
    const responseManifest = structuredClone(manifests[folder]);
    if (holdInitialPostsRequest && !initialPostsRequestHeld && folder === 'posts') {
      initialPostsRequestHeld = true;
      signalInitialPostsRequest();
      await initialPostsRequestGate;
    }
    if (failedFolders.has(folder)) {
      await route.fulfill({ status: 503, body: 'Manifest unavailable' });
      return;
    }
    await route.fulfill({ json: responseManifest });
  });

  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();
  holdInitialPostsRequest = testInfo.title === 'refresh revalidates after the initial folder request settles';
  await page.locator('#app-list .app-launcher[data-type="file-manager"]').click();
});

test.afterEach(() => expect(errors).toEqual([]));

function rootFolderTile(page, label) {
  return page.locator('.fm-scroll .fm-tile').filter({
    has: page.locator('.fm-tile-name', { hasText: new RegExp(`^${label}$`) }),
  });
}

function fileTileName(fileManager, name) {
  return fileManager.locator('.fm-tile-name').filter({ hasText: name });
}

test('refresh revalidates after the initial folder request settles', async ({ page }) => {
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  const refresh = fileManager.getByRole('button', { name: 'Refresh current folder' });
  const status = fileManager.locator('.fm-refresh-status');

  await initialPostsRequestStarted;
  await fileManager.locator('.fm-sidebar-btn[data-path="posts"]').click();
  manifests.posts = [
    { filename: '20261002_Keep_Post.md' },
    { filename: '20261007_Latest_Post.md' },
  ];

  try {
    await refresh.click();
  } finally {
    releaseInitialPostsRequest();
  }

  await expect(status).toHaveText('Folder refreshed.');
  await expect.poll(() => manifestRequests.posts).toBeGreaterThan(1);
  await expect(fileTileName(fileManager, 'Latest Post')).toBeVisible();
  await expect(fileTileName(fileManager, 'Old Post')).toHaveCount(0);
});

test('refresh replaces active folder files and updates root counts', async ({ page }) => {
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  const refresh = fileManager.getByRole('button', { name: 'Refresh current folder' });
  const status = fileManager.locator('.fm-refresh-status');

  await expect(rootFolderTile(page, 'Posts').locator('.fm-tile-date')).toHaveText('2');
  await expect(rootFolderTile(page, 'Documents').locator('.fm-tile-date')).toHaveText('1');
  await fileManager.locator('.fm-sidebar-btn[data-path="posts"]').click();
  await expect(fileTileName(fileManager, 'Old Post')).toBeVisible();
  await expect(fileTileName(fileManager, 'Keep Post')).toBeVisible();

  manifests.posts = [
    { filename: '20261002_Keep_Post.md' },
    { filename: '20261004_New_Post.md' },
  ];
  const postRequestsBeforeRefresh = manifestRequests.posts;
  await refresh.click();

  await expect(status).toHaveText('Folder refreshed.');
  await expect.poll(() => manifestRequests.posts).toBeGreaterThan(postRequestsBeforeRefresh);
  await expect(fileTileName(fileManager, 'Keep Post')).toBeVisible();
  await expect(fileTileName(fileManager, 'New Post')).toBeVisible();
  await expect(fileTileName(fileManager, 'Old Post')).toHaveCount(0);

  manifests.posts.push({ filename: '20261005_Another_Post.md' });
  manifests.documents.push({ filename: '20261006_New_Document.pdf' });
  await fileManager.locator('.fm-sidebar-btn[data-path="/"]').click();
  await refresh.click();

  await expect(status).toHaveText('Folder refreshed.');
  await expect(rootFolderTile(page, 'Posts').locator('.fm-tile-date')).toHaveText('3');
  await expect(rootFolderTile(page, 'Documents').locator('.fm-tile-date')).toHaveText('2');
});

test('refresh announces failure and keeps the last available files', async ({ page }) => {
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  await fileManager.locator('.fm-sidebar-btn[data-path="posts"]').click();
  await expect(fileTileName(fileManager, 'Old Post')).toBeVisible();

  failedFolders.add('posts');
  await fileManager.getByRole('button', { name: 'Refresh current folder' }).click();

  const status = fileManager.locator('.fm-refresh-status');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveText('Refresh failed. Showing the last available files.');
  await expect(fileTileName(fileManager, 'Old Post')).toBeVisible();
});
