const { test, expect } = require('@playwright/test');

const FOLDERS = ['posts', 'documents', 'pictures', 'videos'];
const manifests = {
  posts: [{ filename: '20261101_Recent_Post.md', title: 'Recent Post', url: '/files/posts/20261101_Recent_Post.md' }],
  documents: [{ filename: '20261102_Notes.md', title: 'Notes', url: '/files/documents/20261102_Notes.md' }],
  pictures: [{ filename: '20261103_Landscape.jpg', title: 'Landscape', url: '/files/pictures/20261103_Landscape.jpg' }],
  videos: [{ filename: '20261104_Clip.mp4', title: 'Clip', url: '/files/videos/20261104_Clip.mp4' }],
};

function createRequestState() {
  return { counts: Object.fromEntries(FOLDERS.map(folder => [folder, 0])), active: 0, maxActive: 0 };
}

function installManifestRoutes(page, state, responder = null) {
  return page.route('**/files/*/manifest.json', async route => {
    const folder = new URL(route.request().url()).pathname.split('/')[2];
    if (!FOLDERS.includes(folder)) {
      await route.continue();
      return;
    }
    state.counts[folder] += 1;
    state.active += 1;
    state.maxActive = Math.max(state.maxActive, state.active);
    try {
      if (responder) {
        await responder(route, folder, state.counts[folder]);
      } else {
        await new Promise(resolve => setTimeout(resolve, 30));
        await route.fulfill({
          json: manifests[folder],
          headers: { ETag: `"${folder}-v1"` },
        });
      }
    } finally {
      state.active -= 1;
    }
  });
}

async function waitForPrefetch(state, count = 1) {
  await expect.poll(() => FOLDERS.every(folder => state.counts[folder] >= count), {
    timeout: 8000,
  }).toBe(true);
  await expect.poll(() => state.active).toBe(0);
}

async function dismissWelcome(page) {
  await page.locator('#welcome-win-close').click();
}

test('warms all file lists with bounded concurrency before opening the menu and shares the cache', async ({ page }) => {
  const state = createRequestState();
  await installManifestRoutes(page, state);
  await page.goto('/');
  await waitForPrefetch(state);

  expect(state.maxActive).toBeLessThanOrEqual(2);
  expect(state.counts).toEqual({ posts: 1, documents: 1, pictures: 1, videos: 1 });

  await dismissWelcome(page);
  await page.locator('#app-menu-btn').click();
  await expect(page.locator('#app-files-section')).toBeVisible();
  await expect(page.locator('#doc-files-list')).toContainText('Recent Post');
  await expect(page.locator('#pic-files-list')).toContainText('Landscape');

  await page.locator('#app-menu-btn').click();
  await page.locator('#desktop-search-input').focus();
  await expect(page.locator('#desktop-search-results')).toContainText('Recent Post');
  await page.keyboard.press('Escape');

  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="file-manager"]').click();
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  await expect(fileManager.locator('.fm-sidebar-count[data-folder="posts"]')).toHaveText('1');
  expect(state.counts).toEqual({ posts: 1, documents: 1, pictures: 1, videos: 1 });
});

test('menu, desktop search, and File Manager share requests already in flight', async ({ page }) => {
  const state = createRequestState();
  let firstRequestStarted;
  let releaseRequests;
  const started = new Promise(resolve => { firstRequestStarted = resolve; });
  const gate = new Promise(resolve => { releaseRequests = resolve; });
  await installManifestRoutes(page, state, async route => {
    firstRequestStarted();
    await gate;
    const folder = new URL(route.request().url()).pathname.split('/')[2];
    await route.fulfill({
      json: manifests[folder],
      headers: { ETag: `"${folder}-v1"` },
    });
  });
  await page.goto('/');
  try {
    await started;
    await dismissWelcome(page);
    await page.locator('#app-menu-btn').click();
    await expect(page.locator('#app-files-section')).toBeVisible();
    await expect(page.locator('#launcher-file-load-status')).toContainText('Loading');
    await page.locator('#app-menu-btn').click();

    await page.locator('#desktop-search-input').focus();
    await expect(page.locator('#desktop-search-status')).toContainText('Loading');
    await page.keyboard.press('Escape');

    await page.locator('#app-menu-btn').click();
    await page.locator('#app-list .app-launcher[data-type="file-manager"]').click();
    await expect(page.locator('.app-window[data-type="file-manager"] .fm-sidebar')).toBeVisible();
    await expect.poll(() => FOLDERS.every(folder => state.counts[folder] === 1)).toBe(true);
  } finally {
    releaseRequests();
  }

  await waitForPrefetch(state);
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  await expect(fileManager.locator('.fm-sidebar-count[data-folder="posts"]')).toHaveText('1');
  await page.locator('#desktop-search-input').focus();
  await expect(page.locator('#desktop-search-results')).toContainText('Recent Post');
  expect(state.counts).toEqual({ posts: 1, documents: 1, pictures: 1, videos: 1 });
});

test('menu renders stale cached files while ETag revalidation continues in the background', async ({ page }) => {
  const state = createRequestState();
  let revalidationStarted;
  let releaseRevalidation;
  const started = new Promise(resolve => { revalidationStarted = resolve; });
  const gate = new Promise(resolve => { releaseRevalidation = resolve; });
  const conditionalHeaders = {};
  await installManifestRoutes(page, state, async (route, folder, count) => {
    if (count === 1) {
      await route.fulfill({
        json: manifests[folder],
        headers: { ETag: `"${folder}-v1"` },
      });
      return;
    }
    conditionalHeaders[folder] = route.request().headers()['if-none-match'];
    if (folder === 'posts') {
      revalidationStarted();
      await gate;
    }
    await route.fulfill({ status: 304, headers: { ETag: `"${folder}-v1"` } });
  });
  await page.goto('/');
  await waitForPrefetch(state);
  await page.evaluate(() => {
    const nativeNow = Date.now;
    let offset = 0;
    Date.now = () => nativeNow() + offset;
    window.advanceDesktopTestClock = milliseconds => { offset += milliseconds; };
    window.advanceDesktopTestClock(6000);
  });

  await dismissWelcome(page);
  await page.locator('#app-menu-btn').click();
  const cachedPost = page.locator('#doc-files-list .app-file-btn').filter({ hasText: 'Recent Post' });
  try {
    await started;
    await expect(cachedPost).toBeVisible();
    await expect.poll(() => state.counts.posts).toBe(2);
    expect(conditionalHeaders.posts).toBe('"posts-v1"');
    releaseRevalidation();
    await waitForPrefetch(state, 2);
  } finally {
    releaseRevalidation();
  }

  await page.locator('#app-menu-btn').click();
  await page.locator('#app-menu-btn').click();
  await expect(cachedPost).toBeVisible();
  expect(state.counts).toEqual({ posts: 2, documents: 2, pictures: 2, videos: 2 });
});

test('a valid empty library stays distinct from failed manifests and retry recovers', async ({ page }) => {
  const state = createRequestState();
  await installManifestRoutes(page, state, async (route, folder, count) => {
    if (folder === 'posts' && count === 1) {
      await route.fulfill({ status: 503, body: 'Temporary failure' });
      return;
    }
    await route.fulfill({
      json: folder === 'posts' ? [manifests.posts[0]] : [],
      headers: { ETag: `"${folder}-v1"` },
    });
  });
  await page.goto('/');
  await waitForPrefetch(state);
  await dismissWelcome(page);
  await page.locator('#app-menu-btn').click();

  await expect(page.locator('#app-files-section')).toBeVisible();
  await expect(page.locator('#launcher-file-load-error')).toBeVisible();
  await expect(page.locator('#launcher-file-load-error-text')).toContainText('posts');
  await page.locator('#launcher-file-retry').click();
  await expect(page.locator('#launcher-file-load-error')).toBeHidden();
  await expect(page.locator('#doc-files-list')).toContainText('Recent Post');
  expect(state.counts.posts).toBe(2);
  expect(state.counts.documents).toBe(1);
  expect(state.counts.pictures).toBe(1);
  expect(state.counts.videos).toBe(1);

  const emptyState = createRequestState();
  await page.unroute('**/files/*/manifest.json');
  await page.route('**/files/*/manifest.json', async route => {
    const folder = new URL(route.request().url()).pathname.split('/')[2];
    if (FOLDERS.includes(folder)) {
      emptyState.counts[folder] += 1;
      await route.fulfill({ json: [], headers: { ETag: `"empty-${folder}"` } });
      return;
    }
    await route.continue();
  });
  await page.reload();
  await waitForPrefetch(emptyState);
  await dismissWelcome(page);
  await page.locator('#app-menu-btn').click();
  await expect(page.locator('#app-files-section')).toBeHidden();
  await expect(page.locator('#launcher-file-load-error')).toBeHidden();
});

for (const { label, connection } of [
  { label: 'Save Data', connection: { saveData: true, effectiveType: '4g', downlink: 10, rtt: 30 } },
  { label: '2G connections', connection: { saveData: false, effectiveType: '2g', downlink: 10, rtt: 30 } },
]) {
  test(`does not prefetch manifests on ${label}, but loads them when requested`, async ({ page }) => {
    const state = createRequestState();
    await page.addInitScript(value => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value });
    }, connection);
    await installManifestRoutes(page, state);
    await page.goto('/');
    await page.waitForTimeout(2200);
    expect(state.counts).toEqual({ posts: 0, documents: 0, pictures: 0, videos: 0 });

    await dismissWelcome(page);
    await page.locator('#app-menu-btn').click();
    await waitForPrefetch(state);
    expect(state.counts).toEqual({ posts: 1, documents: 1, pictures: 1, videos: 1 });
  });
}
