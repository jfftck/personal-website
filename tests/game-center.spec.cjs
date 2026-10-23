const { test, expect } = require('@playwright/test');

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
});
test.afterEach(() => { expect(errors).toEqual([]); });

async function openGame(page, game) {
  await page.locator('#app-menu-btn').click();
  await page.locator('#game-center-entry').click();
  await page.locator(`[data-game="${game}"]`).click();
  return page.locator(`.app-window[data-type="${game}"]`).last();
}

function savedKlondike({ columns = [], foundations = {} } = {}) {
  const used = new Set();
  const makeCard = (rank, suit, up = true) => {
    const id = suit * 13 + rank - 1;
    used.add(id);
    return { id, rank, suit, up };
  };
  const columnPiles = Array.from({ length: 7 }, (_, index) =>
    (columns[index] || []).map(([rank, suit = 0]) => makeCard(rank, suit)));
  const foundationPiles = Array.from({ length: 4 }, (_, suit) =>
    (foundations[suit] || []).map(rank => makeCard(rank, suit)));
  const stock = Array.from({ length: 52 }, (_, id) => id)
    .filter(id => !used.has(id))
    .map(id => ({ id, rank: id % 13 + 1, suit: Math.floor(id / 13), up: false }));
  const state = {
    kind: 'klondike', suits: 1, drawCount: 1, columns: columnPiles, stock, waste: [],
    foundations: foundationPiles, cells: Array.from({ length: 4 }, () => []),
    completed: 0, moves: 0, won: false,
  };
  return {
    v: 2,
    columns: [{
      widthPreset: 'full',
      apps: [{
        type: 'klondike',
        state: { version: 1, kind: 'klondike', options: { suits: 1, drawCount: 1 }, state },
      }],
    }],
  };
}

function savedFreecell({ columnCards = [], foundations = {} } = {}) {
  const used = new Set();
  const makeCard = (rank, suit) => {
    const id = suit * 13 + rank - 1;
    used.add(id);
    return { id, rank, suit, up: true };
  };
  const columns = Array.from({ length: 8 }, (_, index) =>
    (columnCards[index] || []).map(([rank, suit = 0]) => makeCard(rank, suit)));
  const foundationPiles = Array.from({ length: 4 }, (_, suit) =>
    (foundations[suit] || []).map(rank => makeCard(rank, suit)));
  for (let id = 0; id < 52; id++) {
    if (used.has(id)) continue;
    const card = { id, rank: id % 13 + 1, suit: Math.floor(id / 13), up: true };
    used.add(id);
    columns[7].push(card);
  }
  const state = {
    kind: 'freecell', suits: 1, drawCount: 1, columns, stock: [], waste: [],
    foundations: foundationPiles, cells: Array.from({ length: 4 }, () => []),
    completed: 0, moves: 0, won: false,
  };
  return {
    v: 2,
    columns: [{
      widthPreset: 'full',
      apps: [{
        type: 'freecell',
        state: { version: 1, kind: 'freecell', options: { suits: 1, drawCount: 1 }, state },
      }],
    }],
  };
}

async function restoreGame(page, session, game = 'klondike') {
  await page.evaluate(value => localStorage.setItem('desktop-session-v2', JSON.stringify(value)), session);
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const app = page.locator(`.app-window[data-type="${game}"]`).last();
  await app.getByRole('button', { name: 'Resume saved game' }).click();
  return app;
}

test('root menu restores app and file entries; the six game tiles stay nested with back/Escape navigation', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  await expect(page.locator('#app-list .app-launcher')).toHaveCount(6);
  await expect(page.locator('#app-list .app-launcher[data-type]')).toHaveCount(5);
  await expect(page.locator('#doc-files-list .app-file-btn')).toHaveCount(9);
  await expect(page.locator('#game-submenu')).toBeHidden();
  await page.locator('#game-center-entry').click();
  await expect(page.locator('#launcher-root')).toBeHidden();
  await expect(page.locator('#app-menu-title')).toHaveText('Game Center');
  await expect(page.getByRole('button', { name: 'Back to root app menu' })).toBeVisible();
  await expect(page.locator('.game-menu-description')).toHaveCount(0);
  await expect(page.locator('#game-list .app-launcher')).toHaveCount(6);
  await expect(page.locator('#launcher-root [data-game]')).toHaveCount(0);
  await page.locator('#game-menu-back').click();
  await expect(page.locator('#game-center-entry')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('#launcher-root')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-menu')).toBeHidden();
});

test('all previous app shortcuts still launch and manifest files open in the document viewer', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  await expect(page.locator('#app-list .app-launcher[data-type="welcome"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#app-list .app-launcher[data-type="doc-viewer"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveCount(1);
  await page.locator('#close-btn').click();

  for (const type of ['welcome', 'doc-viewer', 'img-viewer', 'file-manager', 'media-player']) {
    await page.locator('#app-menu-btn').click();
    await page.locator(`#app-list .app-launcher[data-type="${type}"]`).click();
    if (type === 'welcome') {
      await expect(page.locator('#welcome-overlay')).toBeVisible();
      await page.locator('#welcome-win-close').click();
    } else {
      await expect(page.locator(`.app-window[data-type="${type}"]`)).toHaveCount(1);
      await page.locator('#close-btn').click();
    }
  }

  await page.locator('#app-menu-btn').click();
  await expect(page.locator('#doc-files-count')).toHaveText('9');
  await expect(page.locator('#doc-files-list .app-file-btn').first()).toContainText('About Me');
  await page.locator('#doc-files-list .app-file-btn[data-file-name="big update"]').click();
  await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveCount(1);
  await expect(page.locator('.app-window[data-type="doc-viewer"] .doc-body'))
    .toContainText('Big Update', { timeout: 10000 });
});

test('video manifest entries appear in Videos and open directly in Media Player', async ({ page }) => {
  await page.route('**/videos/manifest.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { filename: '20261022_Archive.mkv', url: 'https://example.test/archive.mkv' },
      { filename: '20261022_Trailer.mp4', url: 'https://example.test/trailer.mp4' },
      { filename: '20261022_Clip.WEBM', url: 'https://example.test/clip.webm' },
    ]),
  }));
  await page.reload();
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();

  await expect(page.locator('#video-files-heading')).toBeVisible();
  await expect(page.locator('#video-files-count')).toHaveText('3');
  await expect(page.locator('#video-files-list .app-file-btn')).toHaveCount(3);
  await expect(page.locator('#video-files-list .app-file-name')).toHaveText([
    'Archive', 'Clip', 'Trailer',
  ]);
  await page.locator('#video-files-list .app-file-btn[data-file-name="trailer"]').click();

  const player = page.locator('.app-window[data-type="media-player"]');
  await expect(player).toHaveCount(1);
  await expect(player.locator('.media-video')).toBeVisible();
  await expect(player.locator('.media-video')).toHaveAttribute('src', 'https://example.test/trailer.mp4');
  await expect(page.locator('#active-title')).toContainText('Trailer');
});

test('launcher search filters documents, pictures, and videos by name without hiding app shortcuts', async ({ page }) => {
  await page.route('**/pictures/manifest.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { filename: '20261022_City_Tour.mp4' },
      { filename: '20261022_Summer_Beach.jpg' },
      { filename: '20261022_Mountain_Trail.png' },
    ]),
  }));
  await page.route('**/videos/manifest.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { filename: '20261022_Welcome_Message.webm' },
      { filename: '20261022_Beach_Trip.mp4' },
    ]),
  }));
  await page.reload();
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();

  await expect(page.locator('#doc-files-list .app-file-name')).toHaveText([
    'About Me', 'Big Update', 'Happy New Year', 'Im Back', 'Merry Christmas',
    'My Sites', 'News Update', 'Site Redesign', 'Welcome',
  ]);
  await expect(page.locator('#pic-files-list .app-file-name')).toHaveText([
    'Mountain Trail', 'Summer Beach',
  ]);
  await expect(page.locator('#video-files-list .app-file-name')).toHaveText([
    'Beach Trip', 'City Tour', 'Welcome Message',
  ]);

  const search = page.locator('#launcher-file-search');
  await search.fill('BEACH');
  await expect(page.locator('#app-list .app-launcher[data-type]')).toHaveCount(5);
  await expect(page.locator('#doc-files-count')).toHaveText('0');
  await expect(page.locator('#pic-files-count')).toHaveText('1');
  await expect(page.locator('#video-files-count')).toHaveText('1');
  await expect(page.locator('#launcher-file-search-status'))
    .toHaveText('Matching files: 0 documents, 1 picture, and 1 video.');
  await expect(page.locator('#doc-files-list .app-file-btn:visible')).toHaveCount(0);
  await expect(page.locator('#pic-files-list .app-file-btn:visible')).toHaveCount(1);
  await expect(page.locator('#video-files-list .app-file-btn:visible')).toHaveCount(1);
  await expect(page.locator('#pic-files-list .app-file-btn:visible')).toContainText('Summer Beach');
  await expect(page.locator('#video-files-list .app-file-btn:visible')).toContainText('Beach Trip');
  await expect(page.locator('#doc-files-heading')).toBeHidden();

  await search.fill('i');
  await expect(page.locator('#launcher-file-search-status'))
    .toHaveText('Matching files: 5 documents, 1 picture, and 2 videos.');
  await expect(page.locator('#video-files-list .app-file-btn:visible')).toHaveCount(2);

  await search.fill('welcome');
  await expect(page.locator('#doc-files-count')).toHaveText('1');
  await expect(page.locator('#pic-files-count')).toHaveText('0');
  await expect(page.locator('#video-files-count')).toHaveText('1');
  await expect(page.locator('#launcher-file-search-status'))
    .toHaveText('Matching files: 1 document, 0 pictures, and 1 video.');
  await expect(page.locator('#doc-files-list .app-file-btn:visible')).toHaveCount(1);
  await expect(page.locator('#pic-files-list .app-file-btn:visible')).toHaveCount(0);
  await expect(page.locator('#video-files-list .app-file-btn:visible')).toHaveCount(1);
  await expect(page.locator('#doc-files-list .app-file-btn:visible')).toContainText('Welcome');

  await search.fill('not-a-file');
  await expect(page.locator('#doc-files-count')).toHaveText('0');
  await expect(page.locator('#pic-files-count')).toHaveText('0');
  await expect(page.locator('#video-files-count')).toHaveText('0');
  await expect(page.locator('#launcher-file-search-status'))
    .toHaveText('Matching files: 0 documents, 0 pictures, and 0 videos.');
  await expect(page.locator('#launcher-file-search-empty')).toBeVisible();
  await search.fill('');
  await expect(page.locator('#launcher-file-search-status'))
    .toHaveText('All 9 documents, 2 pictures, and 3 videos are shown.');
  await expect(page.locator('#doc-files-count')).toHaveText('9');
  await expect(page.locator('#pic-files-count')).toHaveText('2');
  await expect(page.locator('#video-files-count')).toHaveText('3');
  await expect(page.locator('#doc-files-list .app-file-btn:visible')).toHaveCount(9);
  await expect(page.locator('#pic-files-list .app-file-btn:visible')).toHaveCount(2);
  await expect(page.locator('#video-files-list .app-file-btn:visible')).toHaveCount(3);
});

test('launcher search moves focus from a hidden file to search and restores keyboard navigation when cleared', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  const search = page.locator('#launcher-file-search');
  const firstDocument = page.locator('#doc-files-list .app-file-btn').first();

  await firstDocument.focus();
  await page.evaluate(() => {
    const input = document.querySelector('#launcher-file-search');
    input.value = 'welcome';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect(firstDocument).toBeHidden();
  await expect(search).toBeFocused();
  await expect(page.locator('#doc-files-list .app-file-btn:visible')).toHaveCount(1);

  await search.fill('');
  await page.keyboard.press('Tab');
  await expect(firstDocument).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#doc-files-list .app-file-btn').nth(1)).toBeFocused();
});

test('all three solitaire games deal, select, draw, undo, configure, and restart', async ({ page }) => {
  for (const [game, count] of [['klondike', 28], ['spider', 54], ['freecell', 52]]) {
    const app = await openGame(page, game);
    await expect(app.locator('.card-columns .playing-card')).toHaveCount(count);
    await app.locator('.card-columns .card-pile').first().locator('.playing-card').last().click();
    await expect(app.locator('.playing-card.selected')).toHaveCount(1);
    if (game !== 'freecell') {
      await app.locator('.card-stock button').click();
      await expect(app.locator('.game-status')).toContainText('1 moves');
      await app.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(app.locator('.game-status')).toContainText('0 moves');
    } else {
      await app.getByRole('button', { name: 'Empty Cell 1', exact: true }).click();
      await expect(app.locator('.game-status')).toContainText('1 moves');
      await app.getByRole('button', { name: 'Undo', exact: true }).click();
    }
    await app.getByRole('button', { name: 'New deal' }).click();
    await expect(app.locator('.game-status')).toContainText('0 moves');
    if (game === 'klondike') {
      await app.getByLabel('Draw', { exact: true }).selectOption('3');
      await app.locator('.card-stock button').click();
      await expect(app.getByRole('button', { name: /Stock: 21 cards/ })).toBeVisible();
    }
    if (game === 'spider') {
      await app.getByLabel('Suits', { exact: true }).selectOption('4');
      await expect(app.locator('.card-columns .playing-card')).toHaveCount(54);
    }
    await page.locator('#close-btn').click();
  }
});

test('all six games share a keyboard-operable instructions side panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const game of ['klondike', 'spider', 'freecell', 'minesweeper', 'chess', 'reversi']) {
    const app = await openGame(page, game);
    const toggle = app.getByRole('button', { name: 'Instructions', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const panel = app.locator('.game-instructions');
    await expect(panel).toBeVisible();
    const appBox = await app.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(panelBox.x).toBeGreaterThanOrEqual(appBox.x);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(appBox.x + appBox.width + 1);
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(`How to play ${
      game === 'minesweeper' ? 'Minesweeper'
        : game === 'freecell' ? 'FreeCell'
          : game[0].toUpperCase() + game.slice(1)
    }`);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('button', { name: 'Close instructions' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await toggle.click();
    await panel.getByRole('button', { name: 'Close instructions' }).click();
    await page.locator('#close-btn').click();
  }
});

test('double-click auto-home moves eligible Klondike and FreeCell cards and explains ineligible cards', async ({ page }) => {
  const eligible = await restoreGame(page, savedKlondike({
    columns: [[], [[2, 0]]], foundations: { 0: [1] },
  }));
  await eligible.locator('[data-key="card-1"]').dblclick();
  await expect(eligible.locator('[aria-label="Home 1"] .playing-card')).toHaveText('2♠');
  await expect(eligible.locator('.game-status')).toContainText('1 moves');
  await page.locator('#close-btn').click();

  const freecell = await restoreGame(page, savedFreecell({
    columnCards: [[[2, 0]]], foundations: { 0: [1] },
  }), 'freecell');
  await freecell.locator('[data-key="card-1"]').dblclick();
  await expect(freecell.locator('[aria-label="Home 1"] .playing-card')).toHaveText('2♠');
  await expect(freecell.locator('.game-status')).toContainText('1 moves');
  await page.locator('#close-btn').click();

  const blocked = await restoreGame(page, savedKlondike({
    columns: [[[3, 0]]], foundations: { 0: [1] },
  }));
  await blocked.locator('[data-key="card-2"]').dblclick();
  await expect(blocked.locator('.game-status'))
    .toContainText('This card cannot move home yet');
  await expect(blocked.locator('[data-key="card-2"]')).toBeVisible();
});

test('Send home moves a chain of newly eligible cards in one undoable action', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({
    columns: [[[3, 0]], [[2, 0]]], foundations: { 0: [1] },
  }));
  await app.getByRole('button', { name: 'Send home', exact: true }).click();
  await expect(app.locator('[aria-label="Home 1"] .playing-card')).toHaveText('3♠');
  await expect(app.locator('.game-status')).toContainText('Moved 2 cards home');
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(app.locator('[aria-label="Home 1"] .playing-card')).toHaveText('A♠');
});

test('dragging a valid card moves it to a legal pile and animates the move', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({ columns: [[[13, 0]]] }));
  const king = app.locator('[data-key="card-12"]');
  const destination = app.locator('.card-columns .card-pile').nth(1);
  const fromBox = await king.boundingBox();
  const toBox = await destination.boundingBox();
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(destination.locator('[data-key="card-12"]')).toHaveClass(/card-moved/);
  await expect(app.locator('.game-status')).toContainText('1 moves');

  const touchSource = app.locator('[data-key="card-12"]');
  const touchDestination = app.locator('.card-columns .card-pile').nth(2);
  await page.evaluate(({ sourceKey, targetIndex }) => {
    const source = document.querySelector(`[data-key="${sourceKey}"]`);
    const target = document.querySelectorAll('.card-columns .card-pile')[targetIndex];
    const sourceBox = source.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const start = { clientX: sourceBox.x + sourceBox.width / 2, clientY: sourceBox.y + sourceBox.height / 2 };
    const end = { clientX: targetBox.x + targetBox.width / 2, clientY: targetBox.y + targetBox.height / 2 };
    source.dispatchEvent(new PointerEvent('pointerdown', {
      ...start, bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true,
      button: 0, buttons: 1,
    }));
    document.dispatchEvent(new PointerEvent('pointermove', {
      ...end, bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true,
      button: 0, buttons: 1,
    }));
    document.dispatchEvent(new PointerEvent('pointerup', {
      ...end, bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', isPrimary: true,
      button: 0, buttons: 0,
    }));
  }, { sourceKey: 'card-12', targetIndex: 2 });
  await expect(touchDestination.locator('[data-key="card-12"]')).toHaveClass(/card-moved/);
  await expect(app.locator('.game-status')).toContainText('2 moves');
});

test('one selected win celebration runs and restarting allows a new celebration', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({
    columns: [[[13, 0]]],
    foundations: { 0: Array.from({ length: 12 }, (_, index) => index + 1),
      1: Array.from({ length: 13 }, (_, index) => index + 1),
      2: Array.from({ length: 13 }, (_, index) => index + 1),
      3: Array.from({ length: 13 }, (_, index) => index + 1) },
  }));
  await page.evaluate(() => {
    window.celebrationRandomCalls = 0;
    Math.random = () => { window.celebrationRandomCalls++; return 0.01; };
  });
  await app.locator('[data-key="card-12"]').dblclick();
  const table = app.locator('.solitaire-table');
  await expect(table).toHaveAttribute('data-win-celebration', 'fireworks');
  await expect(table.locator('.solitaire-fireworks span')).toHaveCount(18);
  await expect.poll(() => page.evaluate(() => window.celebrationRandomCalls)).toBe(1);
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await app.locator('[data-key="card-12"]').dblclick();
  await expect(table).toHaveAttribute('data-win-celebration', 'fireworks');
  await expect.poll(() => page.evaluate(() => window.celebrationRandomCalls)).toBe(2);
  await app.getByRole('button', { name: 'New deal' }).click();
  await expect(app.locator('.solitaire-table')).not.toHaveAttribute('data-win-celebration', /.+/);
});

test('solitaire tableau scrolls independently and reduced motion suppresses celebration animation', async ({ page }) => {
  const longColumn = Array.from({ length: 52 }, (_, id) => [id % 13 + 1, Math.floor(id / 13)]);
  const app = await restoreGame(page, savedKlondike({ columns: [longColumn] }));
  const scroll = app.locator('.card-tableau-scroll');
  const before = await app.locator('.card-top-row').boundingBox();
  const dimensions = await scroll.evaluate(element => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
  await scroll.evaluate(element => { element.scrollTop = 180; });
  const after = await app.locator('.card-top-row').boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  await page.locator('#close-btn').click();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const winningApp = await restoreGame(page, savedKlondike({
    columns: [[[13, 0]]],
    foundations: { 0: Array.from({ length: 12 }, (_, index) => index + 1),
      1: Array.from({ length: 13 }, (_, index) => index + 1),
      2: Array.from({ length: 13 }, (_, index) => index + 1),
      3: Array.from({ length: 13 }, (_, index) => index + 1) },
  }));
  await page.evaluate(() => { Math.random = () => 0.01; });
  await winningApp.locator('[data-key="card-12"]').dblclick();
  await expect(winningApp.locator('.solitaire-table')).toHaveAttribute('data-win-celebration', 'fireworks');
  await expect(winningApp.locator('.solitaire-fireworks')).toHaveCount(0);
});

test('Minesweeper supports reveal, touch flag mode, keyboard flags, and all board sizes', async ({ page }) => {
  const app = await openGame(page, 'minesweeper');
  await expect(app.locator('.mine-cell')).toHaveCount(81);
  await app.locator('.mine-cell').first().click();
  await expect(app.locator('.mine-cell').first()).toHaveClass(/revealed/);
  await app.getByRole('button', { name: 'New game' }).click();
  await app.getByRole('button', { name: 'Flag mode' }).click();
  await app.locator('.mine-cell').first().click();
  await expect(app.locator('.mine-cell').first()).toHaveClass(/flagged/);
  await page.keyboard.press('f');
  await expect(app.locator('.mine-cell').first()).not.toHaveClass(/flagged/);
  await app.getByLabel('Difficulty', { exact: true }).selectOption('intermediate');
  await expect(app.locator('.mine-cell')).toHaveCount(256);
  await app.getByLabel('Difficulty', { exact: true }).selectOption('expert');
  await expect(app.locator('.mine-cell')).toHaveCount(480);
  await expect(app.getByRole('button', { name: 'Flag mode' })).toHaveAttribute('aria-pressed', 'true');
});

test('Chess makes computer turns, undoes a round, and supports local two-player', async ({ page }) => {
  const app = await openGame(page, 'chess');
  await app.locator('[data-square="e2"]').click();
  await expect(app.locator('[data-square="e4"]')).toHaveClass(/legal/);
  await app.locator('[data-square="e4"]').click();
  await expect(app.locator('.game-status')).toContainText('White to move', { timeout: 10000 });
  await expect(app.locator('.piece-black')).toHaveCount(16);
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(app.locator('[data-square="e2"]')).toHaveAttribute('aria-label', /White Pawn/);
  await app.getByLabel('Opponent', { exact: true }).selectOption('local');
  await app.locator('[data-square="e2"]').click();
  await app.locator('[data-square="e4"]').click();
  await expect(app.locator('.game-status')).toContainText('Black to move');
  await app.locator('[data-square="e7"]').click();
  await app.locator('[data-square="e5"]').click();
  await expect(app.locator('.game-status')).toContainText('White to move');
  await app.getByRole('button', { name: 'New game' }).click();
  await expect(app.locator('[data-square="e7"]')).toHaveAttribute('aria-label', /Black Pawn/);
  await app.locator('[data-square="e2"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(app.locator('[data-square="f2"]')).toBeFocused();
});

test('Reversi flips discs, makes a computer move, undoes and supports local play', async ({ page }) => {
  const app = await openGame(page, 'reversi');
  await expect(app.locator('.legal')).toHaveCount(4);
  await app.locator('[data-square="d6"]').click();
  await expect(app.locator('.game-status')).toContainText('Black to move');
  await expect(app.locator('.disc')).toHaveCount(6);
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(app.locator('.disc')).toHaveCount(4);
  await app.getByLabel('Opponent', { exact: true }).selectOption('local');
  await app.locator('[data-square="d6"]').click();
  await expect(app.locator('.game-status')).toContainText('White to move');
  await expect(app.locator('.disc.black')).toHaveCount(4);
  await app.getByRole('button', { name: '← Game Center' }).click();
  await expect(page.locator('#game-submenu')).toBeVisible();
  await page.locator('#game-menu-back').click();
  await expect(page.locator('#launcher-root')).toBeVisible();
});

test('game windows restore and closing a thinking computer does not leave errors', async ({ page }) => {
  const app = await openGame(page, 'chess');
  await app.locator('[data-square="e2"]').click();
  await app.locator('[data-square="e4"]').click();
  await page.locator('#close-btn').click();
  await expect(page.locator('.game-app')).toHaveCount(0);
  await openGame(page, 'freecell');
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const restored = page.locator('.app-window[data-type="freecell"]');
  await restored.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(restored.locator('.playing-card')).toHaveCount(52);
});

test('unfinished solitaire and chess games offer resume and restore their rules and opponent mode', async ({ page }) => {
  const cards = await openGame(page, 'klondike');
  await cards.getByLabel('Draw', { exact: true }).selectOption('3');
  await cards.locator('.card-stock button').click();
  await expect(cards.getByRole('button', { name: /Stock: 21 cards/ })).toBeVisible();
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const restoredCards = page.locator('.app-window[data-type="klondike"]');
  await expect(restoredCards.getByRole('button', { name: 'Resume saved game' })).toBeVisible();
  await restoredCards.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(restoredCards.getByLabel('Draw', { exact: true })).toHaveValue('3');
  await expect(restoredCards.getByRole('button', { name: /Stock: 21 cards/ })).toBeVisible();

  const chess = await openGame(page, 'chess');
  await chess.getByLabel('Opponent', { exact: true }).selectOption('local');
  await chess.locator('[data-square="e2"]').click();
  await chess.locator('[data-square="e4"]').click();
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const restoredChess = page.locator('.app-window[data-type="chess"]');
  await restoredChess.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(restoredChess.getByLabel('Opponent', { exact: true })).toHaveValue('local');
  await expect(restoredChess.locator('[data-square="e4"]')).toHaveAttribute('aria-label', /White Pawn/);
});

test('multiple game windows keep separate saved boards after refresh', async ({ page }) => {
  const first = await openGame(page, 'minesweeper');
  await first.locator('.mine-cell').first().click();
  const second = await openGame(page, 'minesweeper');
  await second.getByLabel('Difficulty', { exact: true }).selectOption('intermediate');
  await second.getByRole('button', { name: 'Flag mode' }).click();
  await second.locator('.mine-cell').nth(40).click();

  const savedStates = await page.evaluate(() => JSON.parse(localStorage.getItem('desktop-session-v2'))
    .columns.flatMap(column => column.apps)
    .filter(app => app.type === 'minesweeper')
    .map(app => app.state));
  expect(savedStates).toHaveLength(2);
  expect(savedStates[0].state.cells.some(cell => cell.open)).toBe(true);
  expect(savedStates[0].state.cells.some(cell => cell.flag)).toBe(false);
  expect(savedStates[1].state.cells[40].flag).toBe(true);

  await page.reload();
  await page.locator('#welcome-win-close').click();
  const games = page.locator('.app-window[data-type="minesweeper"]');
  await expect(games).toHaveCount(2);
  for (const game of await games.all()) {
    await game.getByRole('button', { name: 'Resume saved game' }).click();
  }
  await expect(games.nth(0).locator('.mine-cell').filter({ hasClass: /revealed/ })).not.toHaveCount(0);
  await expect(games.nth(0).locator('.mine-cell')).toHaveCount(81);
  await expect(games.nth(1).locator('.mine-cell')).toHaveCount(256);
  await expect(games.nth(0).locator('.mine-cell.flagged')).toHaveCount(0);
  await expect(games.nth(1).locator('.mine-cell.flagged')).toHaveCount(1);
});

test('Reversi restores its board, local opponent choice, and available undo', async ({ page }) => {
  const app = await openGame(page, 'reversi');
  await app.getByLabel('Opponent', { exact: true }).selectOption('local');
  await app.locator('[data-square="d6"]').click();
  await expect(app.locator('.disc')).toHaveCount(5);
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const restored = page.locator('.app-window[data-type="reversi"]');
  await restored.getByRole('button', { name: 'Resume saved game' }).click();
  await expect(restored.locator('.disc')).toHaveCount(5);
  await expect(restored.getByLabel('Opponent', { exact: true })).toHaveValue('local');
  await expect(restored.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await restored.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(restored.locator('.disc')).toHaveCount(4);
});

test('invalid saves offer a clean start and finished games do not resume', async ({ page }) => {
  const session = {
    v: 2,
    columns: [{ widthPreset: 'full', apps: [
      { type: 'klondike', state: { version: 0, kind: 'klondike', options: {}, state: {} } },
      { type: 'spider', state: {
        version: 1, kind: 'spider', options: { suits: 1, drawCount: 1 },
        state: {
          kind: 'spider', suits: 1, drawCount: 1,
          columns: Array.from({ length: 10 }, () => []), stock: [], waste: [],
          foundations: Array.from({ length: 4 }, () => []), cells: Array.from({ length: 4 }, () => []),
          completed: 8, moves: 900, won: true,
        },
      } },
    ] }],
  };
  await page.evaluate(value => localStorage.setItem('desktop-session-v2', JSON.stringify(value)), session);
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const invalid = page.locator('.app-window[data-type="klondike"]');
  await expect(invalid.getByText('Saved game could not be loaded')).toBeVisible();
  await expect(invalid.getByRole('button', { name: 'Resume saved game' })).toHaveCount(0);
  await invalid.getByRole('button', { name: 'Start new game' }).click();
  await expect(invalid.locator('.playing-card')).toHaveCount(28);
  const finished = page.locator('.app-window[data-type="spider"]');
  await expect(finished.getByRole('button', { name: 'Resume saved game' })).toHaveCount(0);
  await expect(finished.locator('.playing-card')).toHaveCount(54);
});

test('phone-sized layouts keep menu, boards and controls accessible in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  for (const game of ['spider', 'chess', 'minesweeper']) {
    const app = await openGame(page, game);
    await expect(app).toBeVisible();
    await expect(app.getByRole('button', { name: /New/ })).toBeInViewport();
    const box = await app.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    if (game === 'chess') {
      const board = await app.locator('.game-board').boundingBox();
      expect(board.width).toBeGreaterThan(200);
      expect(board.x).toBeGreaterThanOrEqual(0);
      await app.locator('[data-square="e2"]').click();
      await expect(app.locator('[data-square="e4"]')).toHaveClass(/legal/);
    }
    if (game === 'spider') {
      const tableau = app.locator('.card-tableau-scroll');
      const widths = await tableau.evaluate(element => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(widths.scrollWidth).toBeGreaterThan(widths.width);
      await tableau.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      const lastColumn = await app.locator('.card-columns .card-pile').last().boundingBox();
      const areaBounds = await tableau.boundingBox();
      expect(lastColumn.x + lastColumn.width).toBeLessThanOrEqual(areaBounds.x + areaBounds.width + 1);
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.locator('#close-btn').click();
  }
});
