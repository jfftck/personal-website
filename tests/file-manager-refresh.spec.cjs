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
  holdInitialPostsRequest = [
    'refresh revalidates after the initial folder request settles',
    'refresh updates home folder totals while initial counts are loading',
  ].includes(testInfo.title);
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
  await page.locator('#app-list .app-launcher[data-type="file-manager"]').click();
});

test.afterEach(() => expect(errors).toEqual([]));

function rootFolderTile(page, label) {
  return page.locator('.fm-scroll .fm-tile').filter({ hasText: new RegExp(`\\b${label}\\b`) });
}

function fileTileName(fileManager, name) {
  return fileManager.locator('.fm-tile-name').filter({ hasText: name });
}

test('selected view has a focus-color border while other toolbar actions stay borderless', async ({ page }) => {
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  const tileView = fileManager.getByRole('button', { name: 'Tile view' });
  const listView = fileManager.getByRole('button', { name: 'List view' });
  const refresh = fileManager.getByRole('button', { name: 'Refresh current folder' });

  for (const button of [tileView, listView, refresh]) {
    await expect(button).toHaveClass(/util-action/);
    await expect(button).toHaveAttribute('data-app-button-variant', 'quiet');
  }

  const focusColor = await tileView.evaluate(element => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--focus-color)';
    element.parentElement.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  const borderColor = button => button.evaluate(element => getComputedStyle(element).borderTopColor);

  await expect(tileView).toHaveAttribute('aria-pressed', 'true');
  await expect(listView).toHaveAttribute('aria-pressed', 'false');
  expect(await borderColor(tileView)).toBe(focusColor);
  expect(await borderColor(listView)).toBe('rgba(0, 0, 0, 0)');
  expect(await borderColor(refresh)).toBe('rgba(0, 0, 0, 0)');

  await listView.click();
  await expect(tileView).toHaveAttribute('aria-pressed', 'false');
  await expect(listView).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => borderColor(tileView)).toBe('rgba(0, 0, 0, 0)');
  expect(await borderColor(listView)).toBe(focusColor);
  expect(await borderColor(refresh)).toBe('rgba(0, 0, 0, 0)');
  const activeBackground = await listView.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(activeBackground).not.toBe('rgba(0, 0, 0, 0)');

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 360, height: 780 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(listView).toHaveAttribute('aria-pressed', 'true');
    expect(await borderColor(listView)).toBe(focusColor);
    expect(await borderColor(refresh)).toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Tab');
    await refresh.focus();
    const focusStyle = await refresh.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        visible: element.matches(':focus-visible'),
        color: style.outlineColor,
        style: style.outlineStyle,
      };
    });
    expect(focusStyle.visible).toBe(true);
    expect(focusStyle.color).toBe(focusColor);
    expect(focusStyle.style).toBe('solid');
  }
});

test('File Manager sidebar selection matches the Settings sidebar across themes and widths', async ({ page }) => {
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="settings"]').click();
  const settings = page.locator('.app-window[data-type="settings"]').last();
  const fileManagerSelection = fileManager.locator('.fm-sidebar-btn.active');
  const settingsSelection = settings.locator('.settings-nav-item.is-active');
  await settings.getByRole('button', { name: 'Appearance' }).click();
  await expect(settingsSelection).toBeVisible();
  await expect(settingsSelection).toHaveAttribute('aria-current', 'page');

  for (const theme of ['light', 'dark']) {
    await page.evaluate(themeName => {
      document.documentElement.dataset.theme = themeName;
    }, theme);
    await expect.poll(async () => page.evaluate(() => {
      const fileItem = document.querySelector('.app-window[data-type="file-manager"] .fm-sidebar-btn.active');
      const settingsItem = document.querySelector('.app-window[data-type="settings"] .settings-nav-item.is-active');
      const read = element => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderTopColor,
          borderRadius: style.borderTopLeftRadius,
          borderWidth: style.borderTopWidth,
          padding: style.padding,
        };
      };
      return JSON.stringify(read(fileItem)) === JSON.stringify(read(settingsItem));
    })).toBe(true);
  }

  await page.setViewportSize({ width: 360, height: 780 });
  await expect(fileManagerSelection).toBeVisible();
  const compactSidebar = await fileManagerSelection.evaluate(element => {
    const sidebar = element.closest('.fm-sidebar');
    const style = getComputedStyle(sidebar);
    return { width: sidebar.getBoundingClientRect().width, borderColor: getComputedStyle(element).borderTopColor, outlineOffset: getComputedStyle(element).outlineOffset, padding: style.paddingInline };
  });
  expect(compactSidebar.width).toBeLessThanOrEqual(48);
  expect(compactSidebar.borderColor).not.toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Tab');
  await fileManagerSelection.focus();
  const focusStyle = await fileManagerSelection.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      matchesFocusVisible: element.matches(':focus-visible'),
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      outlineStyle: style.outlineStyle,
    };
  });
  expect(focusStyle.matchesFocusVisible).toBe(true);
  expect(focusStyle.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(focusStyle.outlineOffset).toBe('2px');
  expect(focusStyle.outlineStyle).toBe('solid');
});

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

test('refresh updates home folder totals while initial counts are loading', async ({ page }) => {
  const fileManager = page.locator('.app-window[data-type="file-manager"]');
  const refresh = fileManager.getByRole('button', { name: 'Refresh current folder' });
  const status = fileManager.locator('.fm-refresh-status');

  await initialPostsRequestStarted;
  manifests.posts = [
    { filename: '20261002_Keep_Post.md' },
    { filename: '20261007_Latest_Post.md' },
    { filename: '20261008_Another_Post.md' },
  ];
  manifests.documents.push({ filename: '20261009_New_Document.pdf' });

  try {
    await refresh.click();
  } finally {
    releaseInitialPostsRequest();
  }

  await expect(status).toHaveText('Folder refreshed.');
  await expect(rootFolderTile(page, 'Posts').locator('.fm-tile-date')).toHaveText('3');
  await expect(rootFolderTile(page, 'Documents').locator('.fm-tile-date')).toHaveText('2');
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

test('refreshing one window updates root folder totals in another window', async ({ page }) => {
  const firstWindow = page.locator('.app-window[data-type="file-manager"]').first();
  await expect(rootFolderTile(firstWindow, 'Posts').locator('.fm-tile-date')).toHaveText('2');

  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="file-manager"]').click();
  const windows = page.locator('.app-window[data-type="file-manager"]');
  await expect(windows).toHaveCount(2);
  const secondWindow = windows.nth(1);
  await expect(rootFolderTile(secondWindow, 'Posts').locator('.fm-tile-date')).toHaveText('2');

  manifests.posts.push({ filename: '20261007_Latest_Post.md' });
  await firstWindow.locator('.fm-sidebar-btn[data-path="posts"]').click();
  const refreshStatus = firstWindow.locator('.fm-refresh-status');
  await firstWindow.getByRole('button', { name: 'Refresh current folder' }).click();

  await expect(refreshStatus).toHaveText('Folder refreshed.');
  await expect(rootFolderTile(secondWindow, 'Posts').locator('.fm-tile-date')).toHaveText('3');
  await expect(rootFolderTile(secondWindow, 'Posts')).toBeVisible();
  await expect(secondWindow.locator('.fm-sidebar-btn[data-path="/"]')).toHaveClass(/active/);

  await secondWindow.locator('.fm-sidebar-btn[data-path="documents"]').click();
  await expect(fileTileName(secondWindow, 'Existing Document')).toBeVisible();
  manifests.pictures.push({ filename: '20261010_New_Photo.jpg' });
  await firstWindow.locator('.fm-sidebar-btn[data-path="pictures"]').click();
  await firstWindow.getByRole('button', { name: 'Refresh current folder' }).click();
  await expect(firstWindow.locator('.fm-refresh-status')).toHaveText('Folder refreshed.');
  await expect(fileTileName(secondWindow, 'Existing Document')).toBeVisible();
  await expect(secondWindow.locator('.fm-sidebar-btn[data-path="documents"]')).toHaveClass(/active/);
});

test('shared refresh waits for an in-progress load and preserves the other window view', async ({ page }) => {
  const firstWindow = page.locator('.app-window[data-type="file-manager"]').first();
  await expect(rootFolderTile(firstWindow, 'Posts').locator('.fm-tile-date')).toHaveText('2');

  await page.evaluate(() => {
    const nativeNow = Date.now;
    Date.now = () => nativeNow() + 6000;
  });
  holdInitialPostsRequest = true;
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="file-manager"]').click();
  const windows = page.locator('.app-window[data-type="file-manager"]');
  await expect(windows).toHaveCount(2);
  const secondWindow = windows.nth(1);
  try {
    await initialPostsRequestStarted;
    await secondWindow.locator('.fm-sidebar-btn[data-path="posts"]').click();

    const loadingMessage = secondWindow.locator('.fm-scroll .fm-empty-msg');
    await expect(loadingMessage).toHaveText('Loading…');
    manifests.posts = [
      { filename: '20261002_Keep_Post.md' },
      { filename: '20261007_Latest_Post.md' },
    ];
    await firstWindow.locator('.fm-sidebar-btn[data-path="posts"]').click();

    await firstWindow.getByRole('button', { name: 'Refresh current folder' }).click();
    await expect(firstWindow.locator('.fm-refresh-status')).toHaveText('Folder refreshed.');
    await expect(loadingMessage).toHaveText('Loading…');
    await expect(secondWindow.locator('.fm-sidebar-btn[data-path="posts"]')).toHaveClass(/active/);
  } finally {
    releaseInitialPostsRequest();
  }

  await expect(fileTileName(secondWindow, 'Latest Post')).toBeVisible();
  await expect(fileTileName(secondWindow, 'Old Post')).toHaveCount(0);
  await expect(secondWindow.locator('.fm-sidebar-btn[data-path="posts"]')).toHaveClass(/active/);
});
