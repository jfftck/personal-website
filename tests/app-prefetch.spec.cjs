const { test, expect } = require('@playwright/test');

const APP_ENTRY_PATH = /^\/apps\/(?:doc-viewer|img-viewer|file-manager|media-player|calendar|world-clock|calculator|sticky-notes|weather|settings|game-center)\.js$/;

function isAppResource(path) {
  return APP_ENTRY_PATH.test(path)
    || (path.startsWith('/apps/') && path.endsWith('.css'))
    || path === '/shared/animation-picker.css'
    || /^\/apps\/games\/(?!(?:catalog|menu-loader)\.js$).+\.js$/.test(path);
}

function watchAppResources(page) {
  const paths = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (isAppResource(path)) paths.push(path);
  });
  return paths;
}

function countPath(paths, path) {
  return paths.filter(item => item === path).length;
}

test('startup stays cold and a focused app launcher warms only its own resources', async ({ page }) => {
  const appResources = watchAppResources(page);
  await page.goto('/');
  await page.waitForTimeout(2600);
  expect(appResources).toEqual([]);

  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();
  const calculator = page.locator('#app-list .app-launcher[data-type="calculator"]');
  const moduleRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/apps/calculator.js');
  await calculator.focus();
  await moduleRequest;
  expect(countPath(appResources, '/apps/calculator.css')).toBe(0);
  const styleRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/apps/calculator.css');
  await calculator.click();
  await styleRequest;
  await expect(page.locator('.app-window[data-type="calculator"] .calc')).toBeVisible();

  expect(countPath(appResources, '/apps/calculator.js')).toBe(1);
  expect(countPath(appResources, '/apps/calculator.css')).toBe(1);
  expect(appResources.filter(path => APP_ENTRY_PATH.test(path))).toEqual(['/apps/calculator.js']);
});

test('Game Center warms its shell only after a game is targeted and loads game code on launch', async ({ page }) => {
  const appResources = watchAppResources(page);
  await page.goto('/');
  await page.waitForTimeout(2000);
  expect(appResources).toEqual([]);

  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();
  await page.locator('#game-center-entry').click();

  const chess = page.locator('#game-list [data-game="chess"]');
  const gameCenterRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/apps/game-center.js');
  await chess.hover();
  await gameCenterRequest;
  expect(appResources.some(path => path === '/apps/games/games.css')).toBe(false);
  expect(appResources.some(path => path === '/apps/games/board-ui.js')).toBe(false);

  const gameStyleRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/apps/games/games.css');
  await chess.click();
  await gameStyleRequest;
  await expect(page.locator('.app-window[data-type="chess"] .chess-board')).toBeVisible();
  await expect.poll(() => countPath(appResources, '/apps/games/board-ui.js')).toBe(1);
  expect(countPath(appResources, '/apps/game-center.js')).toBe(1);
  expect(countPath(appResources, '/apps/games/games.css')).toBe(1);
  expect(countPath(appResources, '/apps/games/minesweeper-ui.js')).toBe(0);
  expect(countPath(appResources, '/apps/games/solitaire-ui.js')).toBe(0);
});

test('the app menu opens while its Game Center prefetch is still loading', async ({ page }) => {
  let releaseCatalog;
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
  await page.route('**/apps/games/catalog.js*', async route => {
    await catalogGate;
    await route.continue();
  });
  const catalogRequest = page.waitForRequest(request => (
    new URL(request.url()).pathname === '/apps/games/catalog.js'
  ));
  await page.goto('/');
  await catalogRequest;
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();

  await expect(page.locator('#app-menu')).toBeVisible();
  await expect(page.locator('#game-center-entry .app-launcher-name')).toHaveText('Game Center');

  releaseCatalog();
  await page.locator('#game-center-entry').click();
  await expect(page.locator('#game-list [data-game="chess"]')).toBeVisible();
});

test('Game Center retries a failed menu module request on Save Data', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, effectiveType: '4g', downlink: 10, rtt: 30 },
    });
  });
  let catalogRequests = 0;
  await page.route('**/apps/games/catalog.js*', async route => {
    catalogRequests += 1;
    if (catalogRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'text/javascript',
        body: 'export const temporarilyUnavailable = true;',
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();
  await page.locator('#game-center-entry').click();

  await expect(page.locator('#game-list [data-game="chess"]')).toBeVisible({ timeout: 8000 });
  expect(catalogRequests).toBeGreaterThan(1);
});

test('pinned desktop notes appear after their data module loads', async ({ page }) => {
  let releaseNotes;
  const notesGate = new Promise(resolve => { releaseNotes = resolve; });
  await page.addInitScript(() => {
    localStorage.setItem('personal-desktop-sticky-notes-v1', JSON.stringify([{
      id: 'pinned-note-test',
      title: 'Pinned Note',
      body: 'Deferred note contents',
      desktop: true,
      color: 'blue',
    }]));
  });
  await page.route('**/apps/sticky-notes-data.js*', async route => {
    await notesGate;
    await route.continue();
  });
  const notesRequest = page.waitForRequest(request => (
    new URL(request.url()).pathname === '/apps/sticky-notes-data.js'
  ));
  await page.goto('/');
  await notesRequest;
  await expect(page.locator('#welcome-win-close')).toBeVisible();
  releaseNotes();
  await expect(page.locator('.desktop-note-widget')).toContainText('Pinned Note');
  await expect(page.locator('.desktop-note-widget')).toContainText('Deferred note contents');
});

test('pinned desktop notes recover after a temporary module load failure', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('personal-desktop-sticky-notes-v1', JSON.stringify([{
      id: 'pinned-note-retry-test',
      title: 'Recovered Note',
      body: 'Loaded after retry',
      desktop: true,
      color: 'green',
    }]));
  });
  let requests = 0;
  await page.route('**/apps/sticky-notes-data.js*', async route => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'text/javascript',
        body: 'export const temporarilyUnavailable = true;',
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/');

  await expect(page.locator('.desktop-note-widget')).toContainText('Recovered Note', { timeout: 8000 });
  expect(requests).toBeGreaterThan(1);
});

for (const { name, connection } of [
  { name: 'Save Data', connection: { saveData: true, effectiveType: '4g', downlink: 10, rtt: 30 } },
  { name: 'slow networks', connection: { saveData: false, effectiveType: '2g', downlink: 10, rtt: 30 } },
]) {
  test(`speculative app loading respects ${name}`, async ({ page }) => {
    await page.addInitScript(value => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value });
    }, connection);
    const appResources = watchAppResources(page);
    await page.goto('/');
    await page.locator('#welcome-win-close').click();
    await page.locator('#app-menu-btn').click();
    const calculator = page.locator('#app-list .app-launcher[data-type="calculator"]');
    await calculator.hover();
    await page.waitForTimeout(350);
    expect(appResources).toEqual([]);

    await calculator.click();
    await expect(page.locator('.app-window[data-type="calculator"] .calc')).toBeVisible();
    expect(countPath(appResources, '/apps/calculator.js')).toBe(1);
    expect(countPath(appResources, '/apps/calculator.css')).toBe(1);
  });
}
