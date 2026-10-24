const { test, expect } = require('@playwright/test');

const KEY = 'desktop-session-v2';
const docs = [
  { filename: '20261001_First.md', url: '/documents/session-first.md' },
  { filename: '20261002_Second.md', url: '/documents/session-second.md' },
  { filename: '20261003_Third.pdf', url: '/documents/session-third.pdf' },
];
const pictures = [
  { filename: '20261001_One.svg', url: '/pictures/session-one.svg' },
  { filename: '20261002_Two.svg', url: '/pictures/session-two.svg' },
  { filename: '20261003_Three.svg', url: '/pictures/session-three.svg' },
];
let errors;

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/documents/manifest.json', route => route.fulfill({ json: docs }));
  await page.route('**/posts/manifest.json', route => route.fulfill({ json: [] }));
  await page.route('**/pictures/manifest.json', route => route.fulfill({ json: pictures }));
  await page.route('**/documents/session-*.md', route => route.fulfill({
    contentType: 'text/markdown', body: `# ${route.request().url().includes('second') ? 'Second' : 'First'} document`,
  }));
  await page.route('**/documents/session-third.pdf', route => route.fulfill({
    contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF',
  }));
  await page.route('**/pictures/session-*.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>',
  }));
  await page.goto('/');
});
test.afterEach(() => expect(errors).toEqual([]));

async function seed(page, apps, key = KEY) {
  await page.evaluate(({ apps, key }) => {
    localStorage.removeItem('desktop-session-v2');
    localStorage.removeItem('desktop-session-v1');
    localStorage.setItem(key, JSON.stringify(key.endsWith('v1') ? apps : {
      v: 2, columns: [{ widthPreset: 'half', apps }],
    }));
  }, { apps, key });
  await page.reload();
  await page.locator('#welcome-win-close').click();
}

async function savedApps(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)).columns.flatMap(col => col.apps), KEY);
}

test('browsing documents and photos saves the new selection and reloads both', async ({ page }) => {
  await seed(page, [{ type: 'doc-viewer' }, { type: 'img-viewer' }]);
  const doc = page.locator('[data-type="doc-viewer"].app-window');
  const image = page.locator('[data-type="img-viewer"].app-window');
  await expect(doc.locator('.doc-body')).toContainText('First document');
  await doc.locator('[data-action="open"]').click();
  await doc.locator('.doc-sidebar-item').filter({ hasText: 'Second' }).click();
  await expect(doc.locator('.doc-body')).toContainText('Second document');
  await image.locator('[data-action="next"]').click();
  await expect(image.locator('.img-counter')).toHaveText('2 / 3');
  await expect.poll(() => savedApps(page)).toEqual([
    { type: 'doc-viewer', state: { url: docs[1].url } },
    { type: 'img-viewer', state: { url: pictures[1].url, galleryIdx: 1 } },
  ]);
  await page.reload();
  await expect(doc.locator('.doc-body')).toContainText('Second document');
  await expect(image.locator('.img-viewport img')).toHaveAttribute('src', pictures[1].url);
  await expect(image.locator('.img-counter')).toHaveText('2 / 3');
  await expect(page.locator('.app-col')).toHaveAttribute('data-width', 'half');
});

test('each document window restores independently, including PDFs', async ({ page }) => {
  await seed(page, [
    { type: 'doc-viewer', state: { url: docs[1].url } },
    { type: 'doc-viewer', state: { url: docs[2].url } },
  ]);
  const viewers = page.locator('[data-type="doc-viewer"].app-window');
  await expect(viewers.nth(0).locator('.doc-body')).toContainText('Second document');
  await expect(viewers.nth(1).locator('iframe')).toHaveAttribute('src', docs[2].url);
});

test('removed files fall back to the first available document and photo', async ({ page }) => {
  await seed(page, [
    { type: 'doc-viewer', state: { url: '/documents/removed.md' } },
    { type: 'img-viewer', state: { url: '/pictures/removed.svg', galleryIdx: 1 } },
  ]);
  await expect(page.locator('.app-window .doc-body')).toContainText('First document');
  await expect(page.locator('.img-viewport img')).toHaveAttribute('src', pictures[0].url);
  await expect.poll(() => savedApps(page)).toEqual([
    { type: 'doc-viewer', state: { url: docs[0].url } },
    { type: 'img-viewer', state: { url: pictures[0].url, galleryIdx: 0 } },
  ]);
});

test('reordered gallery restores the photo by URL and updates its index', async ({ page }) => {
  await page.route('**/pictures/manifest.json', route => route.fulfill({ json: [...pictures].reverse() }));
  await seed(page, [{ type: 'img-viewer', state: { url: pictures[2].url, galleryIdx: 2 } }]);
  await expect(page.locator('.img-viewport img')).toHaveAttribute('src', pictures[2].url);
  await expect(page.locator('.img-counter')).toHaveText('1 / 3');
});

test('valid index-only state restores, while invalid state falls back safely', async ({ page }) => {
  await seed(page, [
    { type: 'img-viewer', state: { galleryIdx: 2 } },
    { type: 'img-viewer', state: { galleryIdx: 100 } },
    { type: 'doc-viewer', state: { url: 123 } },
  ]);
  const viewers = page.locator('.app-window[data-type="img-viewer"]');
  await expect(viewers.nth(0).locator('.img-viewport img')).toHaveAttribute('src', pictures[2].url);
  await expect(viewers.nth(1).locator('.img-viewport img')).toHaveAttribute('src', pictures[0].url);
  await expect(page.locator('.app-window .doc-body')).toContainText('First document');
});

test('saved selection survives other session saves while manifests are delayed', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/documents/manifest.json', async route => {
    await gate;
    await route.fulfill({ json: docs });
  });
  await page.route('**/pictures/manifest.json', async route => {
    await gate;
    await route.fulfill({ json: pictures });
  });
  const apps = [
    { type: 'doc-viewer', state: { url: docs[1].url } },
    { type: 'img-viewer', state: { url: pictures[2].url, galleryIdx: 2 } },
  ];
  try {
    await seed(page, apps);
    await expect.poll(() => savedApps(page)).toEqual(apps);
  } finally {
    release();
  }
  await expect(page.locator('.app-window .doc-body')).toContainText('Second document');
  await expect(page.locator('.img-counter')).toHaveText('3 / 3');
});

test('empty manifests clear stale selections without errors', async ({ page }) => {
  await page.route('**/documents/manifest.json', route => route.fulfill({ json: [] }));
  await page.route('**/pictures/manifest.json', route => route.fulfill({ json: [] }));
  await seed(page, [
    { type: 'doc-viewer', state: { url: docs[1].url } },
    { type: 'img-viewer', state: { url: pictures[1].url, galleryIdx: 1 } },
  ]);
  await expect(page.locator('.app-window .doc-body')).toContainText('No documents found');
  await expect(page.locator('.img-counter')).toBeEmpty();
  await expect.poll(() => savedApps(page)).toEqual([{ type: 'doc-viewer' }, { type: 'img-viewer' }]);
});

test('legacy v1 sessions still restore the default files and migrate to v2', async ({ page }) => {
  await seed(page, [{ type: 'doc-viewer' }, { type: 'img-viewer' }], 'desktop-session-v1');
  await expect(page.locator('.app-window .doc-body')).toContainText('First document');
  await expect(page.locator('.img-counter')).toHaveText('1 / 3');
  await expect.poll(async () => (await savedApps(page)).map(app => app.type))
    .toEqual(['doc-viewer', 'img-viewer']);
});

test('files opened from the launcher persist and photo navigation starts at the opened file', async ({ page }) => {
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();
  await page.locator('#doc-files-list .app-file-btn').filter({ hasText: 'Second' }).click();
  await expect(page.locator('.app-window .doc-body')).toContainText('Second document');
  await page.locator('#app-menu-btn').click();
  await page.locator('#pic-files-list .app-file-btn').filter({ hasText: 'Two' }).click();
  await expect(page.locator('.img-counter')).toHaveText('2 / 3');
  await expect.poll(() => savedApps(page)).toEqual([
    { type: 'doc-viewer', state: { url: docs[1].url } },
    { type: 'img-viewer', state: { url: pictures[1].url, galleryIdx: 1 } },
  ]);
  await page.reload();
  await expect(page.locator('.app-window .doc-body')).toContainText('Second document');
  await expect(page.locator('.img-counter')).toHaveText('2 / 3');
  await page.locator('#welcome-win-close').click();
  await page.locator('.app-window[data-type="img-viewer"] [data-action="next"]').click();
  await expect(page.locator('.img-viewport img')).toHaveAttribute('src', pictures[2].url);
});
