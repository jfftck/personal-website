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

async function openSettings(app) {
  await app.getByRole('button', { name: 'Settings', exact: true }).click();
  return app.locator('.game-settings-dialog');
}

async function setGameOption(app, label, value) {
  const dialog = await openSettings(app);
  await dialog.getByLabel(label, { exact: true }).selectOption(value);
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close settings' }).click();
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

function savedFreecell({ columnCards = [], foundations = {}, cellCards = [] } = {}) {
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
  const cells = Array.from({ length: 4 }, (_, index) =>
    (cellCards[index] || []).map(([rank, suit = 0]) => makeCard(rank, suit)));
  for (let id = 0; id < 52; id++) {
    if (used.has(id)) continue;
    const card = { id, rank: id % 13 + 1, suit: Math.floor(id / 13), up: true };
    used.add(id);
    columns[7].push(card);
  }
  const state = {
    kind: 'freecell', suits: 1, drawCount: 1, columns, stock: [], waste: [],
    foundations: foundationPiles, cells,
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

function savedMinesweeper({ level = 'beginner', finalSafeCell = 10 } = {}) {
  const [width, height, mines] = { beginner: [9, 9, 10], intermediate: [16, 16, 40], expert: [30, 16, 99] }[level];
  const mineIndices = new Set(Array.from({ length: mines }, (_, index) => index));
  const cells = Array.from({ length: width * height }, (_, index) => {
    const x = index % width, y = Math.floor(index / width);
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && mineIndices.has((y + dy) * width + x + dx)
        && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) count++;
    }
    const mine = mineIndices.has(index);
    return { mine, open: !mine && index !== finalSafeCell, flag: false, count };
  });
  return {
    v: 2,
    columns: [{
      widthPreset: 'full',
      apps: [{
        type: 'minesweeper',
        state: {
          version: 1,
          kind: 'minesweeper',
          options: { level, flagMode: false },
          state: { width, height, mines, planted: true, status: 'playing', cells },
        },
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
  await expect(page.getByRole('dialog', { name: 'Game Center' })).toBeVisible();
  await expect(page.locator('#app-menu-title')).toHaveText('Game Center');
  await expect(page.locator('#app-menu-title')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#app-menu-title')).toHaveAttribute('aria-atomic', 'true');
  await expect(page.getByRole('button', { name: 'Back to root app menu' })).toBeVisible();
  await expect(page.locator('.game-menu-description')).toHaveCount(0);
  await expect(page.locator('#game-list .app-launcher')).toHaveCount(6);
  for (const game of ['Klondike', 'Spider', 'FreeCell', 'Minesweeper', 'Chess', 'Reversi']) {
    await expect(page.getByRole('button', { name: new RegExp(game) })).toBeVisible();
  }
  await expect(page.locator('#launcher-root [data-game]')).toHaveCount(0);
  await page.locator('#game-menu-back').click();
  await expect(page.getByRole('dialog', { name: 'App launcher' })).toBeVisible();
  await expect(page.locator('#game-center-entry')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('#launcher-root')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-menu')).toBeHidden();
});

test('app launcher is anchored under its button with aligned search and an inset scrollbar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#app-menu-btn').click();
  await expect(page.locator('#doc-files-list .app-file-btn')).toHaveCount(9);
  await expect(page.getByLabel('Find a document, picture, or video')).toBeVisible();

  const layout = await page.evaluate(() => {
    const button = document.querySelector('#app-menu-btn').getBoundingClientRect();
    const topbar = document.querySelector('#topbar').getBoundingClientRect();
    const menu = document.querySelector('#app-menu');
    const menuBox = menu.getBoundingClientRect();
    const search = document.querySelector('#launcher-file-search').getBoundingClientRect();
    const appList = document.querySelector('#app-list').getBoundingClientRect();
    const heading = document.querySelector('#doc-files-heading').getBoundingClientRect();
    const label = getComputedStyle(document.querySelector('.app-files-search-label'));
    const style = getComputedStyle(menu);
    const searchStyle = getComputedStyle(document.querySelector('#launcher-file-search'));
    return {
      buttonLeft: button.left,
      topbarBottom: topbar.bottom,
      menuLeft: menuBox.left,
      menuTop: menuBox.top,
      menuWidth: menuBox.width,
      viewportWidth: innerWidth,
      menuRight: innerWidth - menuBox.right,
      searchLeft: search.left,
      searchTop: search.top,
      searchRadius: parseFloat(searchStyle.borderRadius),
      searchMarginTop: parseFloat(searchStyle.marginTop),
      appListBottom: appList.bottom,
      headingLeft: heading.left,
      labelPosition: label.position,
      labelWidth: parseFloat(label.width),
      overflowY: style.overflowY,
      supportsOverlayOverflow: CSS.supports('overflow-y: overlay'),
      scrollbarWidth: style.scrollbarWidth,
      ariaModal: menu.getAttribute('aria-modal'),
    };
  });
  expect(Math.abs(layout.menuLeft - layout.buttonLeft)).toBeLessThan(2);
  expect(layout.menuTop).toBeGreaterThanOrEqual(layout.topbarBottom);
  expect(layout.menuWidth).toBeLessThanOrEqual(560);
  expect(layout.menuWidth).toBeLessThan(layout.viewportWidth);
  expect(Math.abs(layout.searchLeft - layout.headingLeft)).toBeLessThan(1);
  expect(layout.searchTop - layout.appListBottom).toBeGreaterThanOrEqual(28);
  expect(layout.searchMarginTop).toBe(28);
  expect(layout.searchRadius).toBe(999);
  expect(layout.labelPosition).toBe('absolute');
  expect(layout.labelWidth).toBe(1);
  expect(layout.overflowY).toBe('auto');
  expect(layout.supportsOverlayOverflow).toBe(true);
  expect(layout.scrollbarWidth).toBe('thin');
  expect(layout.ariaModal).toBe('false');

  const pulse = await page.locator('#app-menu-btn').evaluate(async button => {
    button.classList.add('pulse-hint');
    await new Promise(resolve => setTimeout(resolve, 80));
    return {
      boxShadow: getComputedStyle(button).boxShadow,
      outlineStyle: getComputedStyle(button).outlineStyle,
    };
  });
  expect(pulse.boxShadow).toContain('inset');
  expect(pulse.outlineStyle).toBe('none');
  await page.locator('#topbar').click({ position: { x: 300, y: 24 } });
  await expect(page.locator('#app-menu')).toBeHidden();

  await page.setViewportSize({ width: 402, height: 874 });
  await page.locator('#app-menu-btn').click();
  const mobile = await page.locator('#app-menu').evaluate(menu => {
    const rect = menu.getBoundingClientRect();
    return { left: rect.left, width: rect.width, right: innerWidth - rect.right };
  });
  expect(mobile.left).toBeGreaterThanOrEqual(12);
  expect(mobile.right).toBeGreaterThanOrEqual(12);
  expect(mobile.width).toBeLessThan(402);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-menu')).toBeHidden();
});

test('Game Center game icons stay distinct and legible in both themes at desktop and phone sizes', async ({ page }) => {
  const games = ['klondike', 'spider', 'freecell', 'minesweeper', 'chess', 'reversi'];
  const contrastRatio = (foreground, background) => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255);
      const linear = channels.map(value => value <= 0.04045
        ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const fg = luminance(foreground), bg = luminance(background);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  };

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.locator('#app-menu-btn').click();
      await page.locator('#game-center-entry').click();
      const iconPaths = new Set();
      for (const game of games) {
        const icon = page.locator(`#game-list [data-game="${game}"] .game-launcher-icon`);
        await expect(icon).toHaveAttribute('aria-hidden', 'true');
        await expect(icon.locator('svg')).toBeVisible();
        const details = await icon.evaluate(element => {
          const style = getComputedStyle(element);
          return {
            color: style.color,
            background: style.backgroundColor,
            fill: getComputedStyle(element.querySelector('svg path')).fill,
            path: element.querySelector('svg path').getAttribute('d'),
          };
        });
        const box = await icon.locator('svg').boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
        expect(details.fill).toBe(details.color);
        expect(details.path).toBeTruthy();
        iconPaths.add(details.path);
        expect(contrastRatio(details.color, details.background)).toBeGreaterThanOrEqual(3);
      }
      expect(iconPaths.size).toBe(6);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
  }
});

test('all games prevent mouse text selection and expose shared, game-specific visual themes', async ({ page }) => {
  const checkSelectionDisabled = async (app, playfield) => {
    await expect(app).toHaveCSS('user-select', 'none');
    await expect(app.locator(playfield).first()).toHaveCSS('user-select', 'none');
  };

  const klondike = await openGame(page, 'klondike');
  await checkSelectionDisabled(klondike, '.solitaire-table');
  await openSettings(klondike);
  const cardThemeGroup = klondike.getByRole('radiogroup', { name: 'Card theme' });
  await expect(cardThemeGroup.getByRole('radio')).toHaveCount(4);
  await expect(cardThemeGroup.locator('.game-theme-preview')).toHaveCount(4);
  await cardThemeGroup.getByRole('radio', { name: 'Card theme: Botanical' }).click();
  await expect(klondike).toHaveAttribute('data-card-theme', 'botanical');
  await klondike.getByRole('radio', { name: 'Playfield theme: Midnight', exact: true }).click();
  await klondike.getByRole('button', { name: 'Close settings' }).click();

  const spider = await openGame(page, 'spider');
  await checkSelectionDisabled(spider, '.solitaire-table');
  await openSettings(spider);
  await expect(spider).toHaveAttribute('data-card-table-theme', 'midnight');
  const spiderCardThemes = spider.getByRole('radiogroup', { name: 'Card theme' });
  await expect(spiderCardThemes.getByRole('radio', { name: 'Card theme: Botanical' }))
    .toHaveAttribute('aria-checked', 'true');
  await spiderCardThemes.getByRole('radio', { name: 'Card theme: Botanical' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(spiderCardThemes.getByRole('radio', { name: 'Card theme: Glass' }))
    .toHaveAttribute('aria-checked', 'true');
  await expect(klondike).toHaveAttribute('data-card-theme', 'glass');
  await expect(spider).toHaveAttribute('data-card-table-theme', 'midnight');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('game-center-visual-themes-v1')).cards))
    .toBe('glass');
  await spider.getByRole('button', { name: 'Close settings' }).click();

  const freecell = await openGame(page, 'freecell');
  await checkSelectionDisabled(freecell, '.solitaire-table');
  await openSettings(freecell);
  await expect(freecell.getByRole('radiogroup', { name: 'Card theme' })
    .getByRole('radio', { name: 'Card theme: Glass' })).toHaveAttribute('aria-checked', 'true');
  await freecell.getByRole('button', { name: 'Close settings' }).click();

  const chess = await openGame(page, 'chess');
  await checkSelectionDisabled(chess, '.chess-board');
  await expect(chess.locator('.chess-board .chess-piece-svg')).toHaveCount(32);
  await openSettings(chess);
  const chessBoardThemes = chess.getByRole('radiogroup', { name: 'Board theme' });
  const chessPieceThemes = chess.getByRole('radiogroup', { name: 'Piece theme' });
  await expect(chessBoardThemes.locator('.game-theme-preview')).toHaveCount(3);
  await expect(chessPieceThemes.locator('.game-theme-preview')).toHaveCount(3);
  await chessBoardThemes.getByRole('radio', { name: 'Board theme: Slate' }).click();
  await chessPieceThemes.getByRole('radio', { name: 'Piece theme: Glass' }).click();
  await expect(chess).toHaveAttribute('data-chess-board-theme', 'slate');
  await expect(chess).toHaveAttribute('data-chess-pieces-theme', 'glass');
  await chess.getByRole('button', { name: 'Close settings' }).click();

  const reversi = await openGame(page, 'reversi');
  await checkSelectionDisabled(reversi, '.reversi-board');
  await openSettings(reversi);
  await reversi.getByRole('radiogroup', { name: 'Board theme' })
    .getByRole('radio', { name: 'Board theme: Ocean blue' }).click();
  await reversi.getByRole('radiogroup', { name: 'Piece theme' })
    .getByRole('radio', { name: 'Piece theme: Amber' }).click();
  await expect(reversi).toHaveAttribute('data-reversi-board-theme', 'ocean');
  await expect(reversi).toHaveAttribute('data-reversi-pieces-theme', 'amber');
  await reversi.getByRole('button', { name: 'Close settings' }).click();

  const minesweeper = await openGame(page, 'minesweeper');
  await checkSelectionDisabled(minesweeper, '.mine-board');
  await openSettings(minesweeper);
  const themePicker = minesweeper.getByRole('radiogroup', { name: 'Theme' });
  await expect(themePicker.locator('.game-theme-preview')).toHaveCount(5);
  for (const theme of ['classic', 'ocean', 'sunset', 'glass', 'colorblind']) {
    const label = theme === 'colorblind' ? 'Color-blind friendly' : theme;
    await themePicker.getByRole('radio', { name: new RegExp(`Theme: ${label}`, 'i') }).click();
    await expect(minesweeper).toHaveAttribute('data-minesweeper-theme', theme);
  }
  await themePicker.getByRole('radio', { name: 'Theme: Glass' }).click();
  const glassColors = await page.evaluate(async () => {
    const cell = document.querySelector('.app-window[data-type="minesweeper"] .mine-board');
    document.documentElement.dataset.theme = 'light';
    await new Promise(requestAnimationFrame);
    const light = getComputedStyle(cell).backgroundColor;
    document.documentElement.dataset.theme = 'dark';
    await new Promise(requestAnimationFrame);
    const dark = getComputedStyle(cell).backgroundColor;
    return { light, dark };
  });
  expect(glassColors.light).not.toBe(glassColors.dark);

  await page.setViewportSize({ width: 390, height: 844 });
  const fitsToolbar = await minesweeper.evaluate(app => {
    const toolbar = app.querySelector('.game-settings-dialog').getBoundingClientRect();
    return [...app.querySelectorAll('.game-theme-control')].every(control => {
      const rect = control.getBoundingClientRect();
      return rect.left >= toolbar.left - 1 && rect.right <= toolbar.right + 1
        && control.scrollWidth <= control.clientWidth;
    });
  });
  expect(fitsToolbar).toBe(true);
});

test('reset all game themes restores defaults in every open game and saved preferences', async ({ page }) => {
  const klondike = await openGame(page, 'klondike');
  await openSettings(klondike);
  await klondike.getByRole('radio', { name: 'Card theme: Botanical' }).click();
  await klondike.getByRole('radio', { name: 'Playfield theme: Ocean' }).click();
  await klondike.getByRole('button', { name: 'Close settings' }).click();

  const spider = await openGame(page, 'spider');
  const freecell = await openGame(page, 'freecell');

  const chess = await openGame(page, 'chess');
  await openSettings(chess);
  await chess.getByRole('radio', { name: 'Board theme: Slate' }).click();
  await chess.getByRole('radio', { name: 'Piece theme: Glass' }).click();
  await chess.getByRole('button', { name: 'Close settings' }).click();

  const reversi = await openGame(page, 'reversi');
  await openSettings(reversi);
  await reversi.getByRole('radio', { name: 'Board theme: Ocean blue' }).click();
  await reversi.getByRole('radio', { name: 'Piece theme: Amber' }).click();
  await reversi.getByRole('button', { name: 'Close settings' }).click();

  const minesweeper = await openGame(page, 'minesweeper');
  const settings = await openSettings(minesweeper);
  await minesweeper.getByRole('radio', { name: 'Theme: Color-blind friendly' }).click();
  await expect(settings.getByRole('button', { name: 'Reset all game themes' })).toBeVisible();
  await settings.getByRole('button', { name: 'Reset all game themes' }).click();

  for (const app of [klondike, spider, freecell]) {
    await expect(app).toHaveAttribute('data-card-theme', 'classic');
    await expect(app).toHaveAttribute('data-card-table-theme', 'classic');
    await expect(app.locator('[aria-label="Card theme: Classic"]')).toHaveAttribute('aria-checked', 'true');
    await expect(app.locator('[aria-label="Playfield theme: Classic green"]')).toHaveAttribute('aria-checked', 'true');
  }
  await expect(chess).toHaveAttribute('data-chess-board-theme', 'wood');
  await expect(chess).toHaveAttribute('data-chess-pieces-theme', 'classic');
  await expect(reversi).toHaveAttribute('data-reversi-board-theme', 'classic');
  await expect(reversi).toHaveAttribute('data-reversi-pieces-theme', 'classic');
  await expect(minesweeper).toHaveAttribute('data-minesweeper-theme', 'classic');

  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('game-center-visual-themes-v1'))))
    .toEqual({
      cards: 'classic',
      cardTable: 'classic',
      chessBoard: 'wood',
      chessPieces: 'classic',
      reversiBoard: 'classic',
      reversiPieces: 'classic',
      minesweeper: 'classic',
    });
});

test('game settings dialogs contain options, trap keyboard focus, and return focus on Escape', async ({ page }) => {
  for (const game of ['klondike', 'spider', 'freecell', 'minesweeper', 'chess', 'reversi']) {
    const app = await openGame(page, game);
    await expect(app.locator('.game-toolbar select, .game-toolbar .game-theme-control')).toHaveCount(0);
    const dialog = await openSettings(app);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = dialog.getByRole('button', { name: 'Close settings' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(app.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  }
});

test('all game toolbars place instructions and undo left, new game in the center, and settings right', async ({ page }) => {
  for (const game of ['klondike', 'spider', 'freecell', 'minesweeper', 'chess', 'reversi']) {
    const app = await openGame(page, game);
    const toolbar = app.locator('.game-toolbar');
    const left = toolbar.locator('.game-toolbar-left');
    const center = toolbar.locator('.game-toolbar-center');
    const right = toolbar.locator('.game-toolbar-right');
    await expect(left.getByRole('button', { name: 'Instructions' })).toBeVisible();
    await expect(right.getByRole('button', { name: 'Settings' })).toBeVisible();
    const centerButton = center.locator('button');
    await expect(centerButton).toHaveCount(1);
    await expect(centerButton).toHaveText(/^(New game|New deal)$/);
    if (game !== 'minesweeper') await expect(left.getByRole('button', { name: 'Undo' })).toBeVisible();
    const positions = await toolbar.evaluate(element => {
      const bounds = selector => {
        const { left: x, width } = element.querySelector(selector).getBoundingClientRect();
        return { x, width };
      };
      const toolbarBounds = element.getBoundingClientRect();
      return {
        toolbarX: toolbarBounds.left,
        toolbar: toolbarBounds.width,
        left: bounds('.game-toolbar-left'),
        center: bounds('.game-toolbar-center'),
        right: bounds('.game-toolbar-right'),
      };
    });
    expect(Math.abs(positions.center.x + positions.center.width / 2 - positions.toolbarX - positions.toolbar / 2)).toBeLessThan(2);
    expect(positions.left.x + positions.left.width).toBeLessThanOrEqual(positions.center.x);
    expect(positions.center.x + positions.center.width).toBeLessThanOrEqual(positions.right.x);
  }
});

test('Glass cards, Chess squares and pieces, and Reversi discs retain strong contrast in both appearances', async ({ page }) => {
  for (const game of ['klondike', 'chess', 'reversi']) {
    const app = await openGame(page, game);
    const dialog = await openSettings(app);
    const labels = game === 'klondike' ? ['Card theme', 'Playfield theme'] : ['Board theme', 'Piece theme'];
    for (const label of labels) await dialog.getByRole('radio', { name: `${label}: Glass`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Close settings' }).click();
    const results = await app.evaluate((element, kind) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const luminance = color => {
        context.fillStyle = '#fff'; context.fillRect(0, 0, 1, 1);
        context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => value / 255);
        const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
        return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      };
      const ratio = (a, b) => {
        const x = luminance(a), y = luminance(b);
        return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
      };
      const values = {};
      for (const appearance of ['light', 'dark']) {
        document.documentElement.dataset.theme = appearance;
        const style = getComputedStyle(element);
        if (kind === 'klondike') {
          const face = style.getPropertyValue('--card-face');
          values[`${appearance}-card-ink`] = ratio(face, style.getPropertyValue('--card-ink'));
          values[`${appearance}-card-red`] = ratio(face, style.getPropertyValue('--card-red'));
        } else if (kind === 'chess') {
          const squares = ['light', 'dark'].map(color => getComputedStyle(element.querySelector(`.board-square.${color}`)).backgroundColor);
          values[`${appearance}-squares`] = ratio(...squares);
          for (const side of ['white', 'black']) {
            const fill = style.getPropertyValue(`--chess-${side}-piece`);
            const outline = style.getPropertyValue(`--chess-${side}-outline`);
            for (const [index, square] of squares.entries()) {
              values[`${appearance}-${side}-${index}`] = Math.max(ratio(fill, square), ratio(outline, square));
            }
          }
        } else {
          const square = getComputedStyle(element.querySelector('.board-square')).backgroundColor;
          for (const side of ['black', 'white']) {
            values[`${appearance}-${side}`] = Math.max(
              ratio(style.getPropertyValue(`--disc-${side}-fill`), square),
              ratio(style.getPropertyValue(`--disc-${side}-border`), square),
            );
          }
        }
      }
      return values;
    }, game);
    for (const [name, value] of Object.entries(results)) {
      expect(value, `${game}: ${name} ${JSON.stringify(results)}`).toBeGreaterThanOrEqual(game === 'klondike' ? 4.5 : 3);
    }
  }
});

test('Minesweeper color-blind palette keeps every number legible and flags distinct in both desktop themes', async ({ page }) => {
  const app = await restoreGame(page, savedMinesweeper({ finalSafeCell: 10 }), 'minesweeper');
  await openSettings(app);
  const themePicker = app.getByRole('radiogroup', { name: 'Theme' });
  await themePicker.getByRole('radio', { name: 'Theme: Color-blind friendly' }).click();
  await expect(app).toHaveAttribute('data-minesweeper-theme', 'colorblind');
  await app.getByRole('button', { name: 'Close settings' }).click();
  const flagged = app.locator('.mine-cell').nth(10);
  await flagged.press('f');
  await expect(flagged).toHaveClass(/flagged/);
  await expect(flagged).toHaveAttribute('aria-label', /flagged/);

  const contrast = await app.evaluate(element => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255);
      const linear = channels.map(value => value <= 0.04045
        ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const ratio = (foreground, background) => {
      const fg = luminance(foreground), bg = luminance(background);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    };
    const results = {};
    [...element.querySelectorAll('.mine-cell.revealed')].slice(0, 8)
      .forEach((cell, index) => { cell.dataset.number = String(index + 1); });
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      for (let number = 1; number <= 8; number++) {
        const cell = element.querySelector(`.mine-cell[data-number="${number}"]`);
        const style = getComputedStyle(cell);
        results[`${theme}-${number}`] = {
          color: style.color,
          background: style.backgroundColor,
          contrast: ratio(style.color, style.backgroundColor),
        };
      }
    }
    const flag = element.querySelector('.mine-cell.flagged');
    const flagStyle = getComputedStyle(flag, '::after');
    const flagColor = flagStyle.borderTopColor;
    const flagBackground = getComputedStyle(flag).backgroundColor;
    return {
      numbers: results,
      flagContrast: ratio(flagColor, flagBackground),
      flagColor,
      flagBackground,
      flagOutline: getComputedStyle(flag).outlineStyle,
      flagOutlineColor: getComputedStyle(flag).outlineColor,
    };
  });
  for (const value of Object.values(contrast.numbers)) {
    expect(value.contrast).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast.flagContrast).toBeGreaterThanOrEqual(4.5);
  expect(contrast.flagOutline).toBe('dashed');
  expect(contrast.flagColor).not.toBe(contrast.flagBackground);
  expect(contrast.flagOutlineColor).not.toBe(contrast.flagBackground);
});

test('Minesweeper Glass number and flag colors remain readable in light and dark appearances', async ({ page }) => {
  const app = await restoreGame(page, savedMinesweeper({ finalSafeCell: 10 }), 'minesweeper');
  await openSettings(app);
  const themePicker = app.getByRole('radiogroup', { name: 'Theme' });
  await themePicker.getByRole('radio', { name: 'Theme: Glass' }).click();
  await app.getByRole('button', { name: 'Close settings' }).click();
  await app.locator('.mine-cell').nth(10).press('f');
  const contrast = await app.evaluate(element => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255);
      const linear = channels.map(value => value <= 0.04045
        ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const ratio = (foreground, background) => {
      const fg = luminance(foreground), bg = luminance(background);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    };
    const results = {};
    [...element.querySelectorAll('.mine-cell.revealed')].slice(0, 8)
      .forEach((cell, index) => { cell.dataset.number = String(index + 1); });
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      for (let number = 1; number <= 8; number++) {
        const cell = element.querySelector(`.mine-cell[data-number="${number}"]`);
        const style = getComputedStyle(cell);
        results[`${theme}-${number}`] = ratio(style.color, style.backgroundColor);
      }
      const flag = element.querySelector('.mine-cell.flagged');
      const flagColor = getComputedStyle(flag, '::after').borderTopColor;
      results[`${theme}-flag`] = ratio(flagColor, getComputedStyle(flag).backgroundColor);
    }
    return results;
  });
  for (const value of Object.values(contrast)) {
    expect(value, JSON.stringify(contrast)).toBeGreaterThanOrEqual(4.5);
  }
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
      await expect(app.locator('.game-status')).toHaveText(/^Moved .+ to Cell 1\.$/);
      await app.getByRole('button', { name: 'Undo', exact: true }).click();
    }
    await app.getByRole('button', { name: 'New deal' }).click();
    await expect(app.locator('.game-status')).toContainText('0 moves');
    if (game === 'klondike') {
      await setGameOption(app, 'Draw', '3');
      await app.locator('.card-stock button').click();
      await expect(app.getByRole('button', { name: /Stock: 21 cards/ })).toBeVisible();
    }
    if (game === 'spider') {
      await setGameOption(app, 'Suits', '4');
      await expect(app.locator('.card-columns .playing-card')).toHaveCount(54);
    }
    await page.locator('#close-btn').click();
  }
});

test('all six games share a keyboard-operable instructions side panel', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const game of ['klondike', 'spider', 'freecell', 'minesweeper', 'chess', 'reversi']) {
      const app = await openGame(page, game);
      const toggle = app.getByRole('button', { name: 'Instructions', exact: true });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      const panel = app.locator('.game-instructions');
      await expect(panel).toBeVisible();
      await expect(toggle.locator('.game-instructions-icon')).toBeVisible();
      await expect(toggle.locator('.game-instructions-icon')).toHaveAttribute('aria-hidden', 'true');
      const tabIcon = page.locator(`.app-tab-btn[aria-label="${game === 'minesweeper'
        ? 'Minesweeper' : game === 'freecell' ? 'FreeCell' : game[0].toUpperCase() + game.slice(1)}"] svg path`);
      await expect(toggle.locator('.game-instructions-icon svg path'))
        .toHaveAttribute('d', await tabIcon.getAttribute('d'));
      const appBox = await app.boundingBox();
      const panelBox = await panel.boundingBox();
      const toggleBox = await toggle.boundingBox();
      expect(Math.abs(panelBox.x - toggleBox.x)).toBeLessThanOrEqual(1);
      expect(panelBox.y).toBeGreaterThanOrEqual(toggleBox.y + toggleBox.height - 1);
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
  }
});

test('game windows use distinct game icons and do not duplicate Game Center navigation', async ({ page }) => {
  const iconPaths = new Set();
  for (const [game, title] of [
    ['klondike', 'Klondike'], ['spider', 'Spider'], ['freecell', 'FreeCell'],
    ['minesweeper', 'Minesweeper'], ['chess', 'Chess'], ['reversi', 'Reversi'],
  ]) {
    const app = await openGame(page, game);
    await expect(app.locator('.game-toolbar')).not.toContainText('Game Center');
    await expect(app.locator('.game-toolbar button', { hasText: 'Game Center' })).toHaveCount(0);
    const tabIcon = page.locator(`.app-tab-btn[aria-label="${title}"] svg path`);
    await expect(tabIcon).toHaveCount(1);
    const path = await tabIcon.getAttribute('d');
    iconPaths.add(path);

    await page.locator('#app-menu-btn').click();
    await page.locator('#game-center-entry').click();
    const tileIcon = page.locator(`#game-list [data-game="${game}"] .game-launcher-icon`);
    await expect(tileIcon).toHaveAttribute('aria-hidden', 'true');
    await expect(tileIcon.locator('svg')).toHaveCount(1);
    await expect(tileIcon.locator('svg path')).toHaveAttribute('d', path);
    await expect(app.locator('.game-instructions-icon svg path')).toHaveAttribute('d', path);
    await page.locator('#app-menu-btn').click();
    await page.locator('#close-btn').click();
  }
  expect(iconPaths.size).toBe(6);
});

test('double-click keeps Klondike auto-home and moves FreeCell cards by their source', async ({ page }) => {
  const eligible = await restoreGame(page, savedKlondike({
    columns: [[], [[2, 0]]], foundations: { 0: [1] },
  }));
  await eligible.locator('[data-key="card-1"]').dblclick();
  await expect(eligible.locator('[aria-label="Home 1"] .playing-card')).toHaveText('2♠');
  await expect(eligible.locator('.game-status')).toContainText('1 moves');
  await page.locator('#close-btn').click();

  const freecellTableau = await restoreGame(page, savedFreecell({
    columnCards: [[[5, 0]]],
  }), 'freecell');
  await freecellTableau.locator('[data-key="card-4"]').dblclick();
  await expect(freecellTableau.locator('[aria-label="Cell 1"] .playing-card')).toHaveText('5♠');
  await expect(freecellTableau.locator('.game-status')).toContainText('1 moves');
  await page.locator('#close-btn').click();

  const freecellCell = await restoreGame(page, savedFreecell({
    columnCards: [[], [[6, 1]]],
    cellCards: [[[5, 0]]],
  }), 'freecell');
  await freecellCell.locator('[data-key="card-4"]').dblclick();
  await expect(freecellCell.locator('[aria-label="Pile 2"] [data-key="card-4"]')).toBeVisible();
  await expect(freecellCell.locator('[aria-label="Pile 2"] .playing-card')).toHaveCount(2);
  await expect(freecellCell.locator('.game-status')).toContainText('1 moves');
  await page.locator('#close-btn').click();

  const freecellEmptyColumn = await restoreGame(page, savedFreecell({
    columnCards: [[[2, 1]]],
    cellCards: [[[5, 0]]],
  }), 'freecell');
  await freecellEmptyColumn.locator('[data-key="card-4"]').dblclick();
  await expect(freecellEmptyColumn.locator('[aria-label="Pile 2"] [data-key="card-4"]')).toBeVisible();
  await expect(freecellEmptyColumn.locator('[aria-label="Pile 2"] .playing-card')).toHaveCount(1);
  await page.locator('#close-btn').click();

  const blocked = await restoreGame(page, savedKlondike({
    columns: [[[3, 0]]], foundations: { 0: [1] },
  }));
  await blocked.locator('[data-key="card-2"]').dblclick();
  await expect(blocked.locator('.game-status'))
    .toContainText('This card cannot move home yet');
  await expect(blocked.locator('[data-key="card-2"]')).toBeVisible();
});

test('FreeCell double-click highlights Home and an open cell, or sends the card home when full', async ({ page }) => {
  const withOpenCell = await restoreGame(page, savedFreecell({
    columnCards: [[[2, 0]]],
    foundations: { 0: [1] },
  }), 'freecell');
  await withOpenCell.locator('[data-key="card-1"]').dblclick();
  await expect(withOpenCell.locator('[data-key="card-1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(withOpenCell.locator('[aria-label="Cell 1"]')).toHaveClass(/available-move/);
  await expect(withOpenCell.locator('[aria-label="Home 1"]')).toHaveClass(/available-move/);
  await expect(withOpenCell.locator('.game-status')).toHaveText('Choose Cell 1 or Home 1.');
  await withOpenCell.locator('[aria-label="Home 1"] [data-key="card-0"]').click();
  await expect(withOpenCell.locator('[aria-label="Home 1"] .playing-card')).toHaveText('2♠');
  await page.locator('#close-btn').click();

  const noOpenCell = await restoreGame(page, savedFreecell({
    columnCards: [[[2, 0]]],
    foundations: { 0: [1] },
    cellCards: [[[2, 1]], [[3, 1]], [[4, 1]], [[5, 1]]],
  }), 'freecell');
  await noOpenCell.locator('[data-key="card-1"]').dblclick();
  await expect(noOpenCell.locator('[aria-label="Home 1"] .playing-card')).toHaveText('2♠');
  await expect(noOpenCell.locator('.game-status')).toHaveText('Moved 2♠ to Home 1.');
});

test('FreeCell double-click announces later-numbered Cell and Home destinations', async ({ page }) => {
  const laterDestinations = await restoreGame(page, savedFreecell({
    columnCards: [[[2, 2]]],
    foundations: { 2: [1] },
    cellCards: [[[5, 0]]],
  }), 'freecell');
  await laterDestinations.locator('[data-key="card-27"]').dblclick();
  await expect(laterDestinations.locator('.game-status')).toHaveText('Choose Cell 2 or Home 3.');
  await expect(laterDestinations.locator('[aria-label="Cell 2"]')).toHaveClass(/available-move/);
  await expect(laterDestinations.locator('[aria-label="Home 3"]')).toHaveClass(/available-move/);
  await expect(laterDestinations.locator('[aria-label="Cell 1"]')).not.toHaveClass(/available-move/);
  await expect(laterDestinations.locator('[aria-label="Home 1"]')).not.toHaveClass(/available-move/);
  await page.locator('#close-btn').click();

  const fullCells = await restoreGame(page, savedFreecell({
    columnCards: [[[2, 3]]],
    foundations: { 3: [1] },
    cellCards: [[[2, 0]], [[3, 0]], [[4, 0]], [[5, 0]]],
  }), 'freecell');
  await fullCells.locator('[data-key="card-40"]').dblclick();
  await expect(fullCells.locator('[aria-label="Home 4"] .playing-card')).toHaveText('2♦');
  await expect(fullCells.locator('.game-status')).toHaveText('Moved 2♦ to Home 4.');
});

test('manual click moves announce the card and destination', async ({ page }) => {
  const tableau = await restoreGame(page, savedKlondike({
    columns: [[[5, 0]], [[6, 1]]],
  }));
  await tableau.locator('[data-key="card-4"]').click();
  await tableau.locator('[aria-label="Pile 2"] [data-key="card-18"]').click();
  await expect(tableau.locator('.game-status')).toHaveText('Moved 5♠ to Pile 2.');
  await page.locator('#close-btn').click();

  const home = await restoreGame(page, savedKlondike({
    columns: [[[2, 0]]], foundations: { 0: [1] },
  }));
  await home.locator('[data-key="card-1"]').click();
  await home.locator('[aria-label="Home 1"] [data-key="card-0"]').click();
  await expect(home.locator('.game-status')).toHaveText('Moved 2♠ to Home 1.');
});

test('card-game fields use grouped Home and Cells labels without individual pile captions', async ({ page }) => {
  const klondike = await openGame(page, 'klondike');
  await expect(klondike.locator('.home-group')).toHaveAttribute('aria-label', 'Home');
  await expect(klondike.locator('.home-group .card-pile')).toHaveCount(4);
  await expect(klondike.locator('.pile-label')).toHaveCount(0);
  await page.locator('#close-btn').click();

  const freecell = await openGame(page, 'freecell');
  await expect(freecell.locator('.cell-group')).toHaveAttribute('aria-label', 'Cells');
  await expect(freecell.locator('.cell-group .card-pile')).toHaveCount(4);
  await expect(freecell.locator('.home-group')).toHaveAttribute('aria-label', 'Home');
  const cellStyles = await freecell.locator('.cell-group').evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, borderTop: style.borderTopWidth,
      borderBottom: style.borderBottomWidth };
  });
  expect(cellStyles.background).toBe('rgba(0, 0, 0, 0)');
  expect(cellStyles.borderTop).not.toBe('0px');
  expect(cellStyles.borderBottom).toBe('0px');
  await page.locator('#close-btn').click();

  const spider = await openGame(page, 'spider');
  await expect(spider.locator('.home-group')).toHaveAttribute('aria-label', 'Home');
  await expect(spider.locator('.spider-home-space')).toHaveCount(8);
  const homeRows = await spider.locator('.spider-home-space').evaluateAll(spaces =>
    spaces.map(space => space.getBoundingClientRect().y));
  expect(Math.max(...homeRows) - Math.min(...homeRows)).toBeLessThan(1);
  await expect(spider.locator('.card-top-row')).not.toContainText('complete runs');
});

async function dragToBlankPileArea(page, source, destination) {
  const from = await source.boundingBox();
  const point = await destination.evaluate(element => {
    const rect = element.getBoundingClientRect();
    for (let y = rect.bottom - 2; y > rect.top; y -= 2) {
      for (let x = rect.left + 2; x < rect.right - 2; x += 2) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('.card-pile') === element
          && !hit.closest('.playing-card, .empty-pile, .pile-label')) return { x, y };
      }
    }
    return null;
  });
  expect(point, 'destination should expose a blank drop area').not.toBeNull();
  await page.mouse.move(from.x + from.width / 2, from.y + Math.min(8, from.height / 4));
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 5 });
  await page.mouse.up();
}

test('cards and valid sequences drop in blank tableau space while invalid drops stay put', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cardApp = await restoreGame(page, savedKlondike({
    columns: [[[5, 0]], [[6, 1]]],
  }));
  const cardTarget = cardApp.locator('.card-columns .card-pile').nth(1);
  await dragToBlankPileArea(page, cardApp.locator('[data-key="card-4"]'), cardTarget);
  await expect(cardTarget.locator('[data-key="card-4"]')).toBeVisible();
  await expect(cardApp.locator('.game-status')).toHaveText('Moved 5♠ to Pile 2.');
  await page.locator('#close-btn').click();

  const sequenceApp = await restoreGame(page, savedKlondike({
    columns: [[[7, 0], [6, 1]], [[8, 1]]],
  }));
  const sequenceTarget = sequenceApp.locator('.card-columns .card-pile').nth(1);
  await dragToBlankPileArea(page, sequenceApp.locator('[data-key="card-6"]'), sequenceTarget);
  await expect(sequenceTarget.locator('[data-key="card-6"]')).toBeVisible();
  await expect(sequenceTarget.locator('[data-key="card-18"]')).toBeVisible();
  await expect(sequenceApp.locator('.game-status'))
    .toHaveText('Moved 7♠ and 1 more card to Pile 2.');
  await page.locator('#close-btn').click();

  const invalidApp = await restoreGame(page, savedKlondike({
    columns: [[[5, 0]]],
  }));
  const invalidTarget = invalidApp.locator('.card-columns .card-pile').nth(1);
  await dragToBlankPileArea(page, invalidApp.locator('[data-key="card-4"]'), invalidTarget);
  await expect(invalidApp.locator('[data-key="card-4"]')).toBeVisible();
  await expect(invalidApp.locator('[aria-label="Pile 1"] [data-key="card-4"]')).toBeVisible();
  await expect(invalidTarget.locator('[data-key="card-4"]')).toHaveCount(0);
  await expect(invalidApp.locator('.game-status')).toContainText('cannot move to this pile');
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
  await page.mouse.move(fromBox.x + fromBox.width / 2 + 20, fromBox.y + fromBox.height / 2 + 20);
  const dragLayer = page.locator('body > .card-drag-layer');
  await expect(dragLayer).toHaveCount(1);
  await expect(king).toHaveClass(/drag-source-hidden/);
  const layerPosition = await dragLayer.evaluate(layer => ({
    position: getComputedStyle(layer).position,
    zIndex: getComputedStyle(layer).zIndex,
    pointerEvents: getComputedStyle(layer).pointerEvents,
    parent: layer.parentElement.tagName,
  }));
  expect(layerPosition).toEqual({
    position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', parent: 'BODY',
  });
  const floatingCard = dragLayer.locator('.card-drag-layer-card');
  await expect(floatingCard).toHaveCount(1);
  const floatingBox = await floatingCard.boundingBox();
  expect(Math.abs(floatingBox.x - (fromBox.x + 20))).toBeLessThanOrEqual(1);
  expect(Math.abs(floatingBox.y - (fromBox.y + 20))).toBeLessThanOrEqual(1);
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(dragLayer).toHaveCount(0);
  await expect(destination.locator('[data-key="card-12"]')).toHaveClass(/card-moved/);
  await expect(app.locator('.game-status')).toHaveText('Moved K♠ to Pile 2.');

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
  await expect(app.locator('.game-status')).toHaveText('Moved K♠ to Pile 3.');
});

test('dragging a card home announces its card and foundation', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({
    columns: [[[2, 0]]], foundations: { 0: [1] },
  }));
  const card = app.locator('[data-key="card-1"]');
  const home = app.locator('[aria-label="Home 1"] .playing-card');
  const from = await card.boundingBox();
  const to = await home.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(app.locator('[aria-label="Home 1"] .playing-card')).toHaveText('2♠');
  await expect(app.locator('.game-status')).toHaveText('Moved 2♠ to Home 1.');
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
  const celebration = page.locator('body > .solitaire-celebration-layer');
  await expect(celebration).toHaveCount(1);
  await expect(celebration.locator('.game-layer-card.card-firework')).toHaveCount(52);
  await expect(celebration.locator('.solitaire-fireworks span')).toHaveCount(24);
  const layerPosition = await celebration.evaluate(layer => ({
    position: getComputedStyle(layer).position,
    zIndex: getComputedStyle(layer).zIndex,
    pointerEvents: getComputedStyle(layer).pointerEvents,
    parent: layer.parentElement.tagName,
  }));
  expect(layerPosition).toEqual({
    position: 'fixed', zIndex: '2147483646', pointerEvents: 'none', parent: 'BODY',
  });
  await expect.poll(() => page.evaluate(() => window.celebrationRandomCalls)).toBe(1);
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await app.locator('[data-key="card-12"]').dblclick();
  await expect(table).toHaveAttribute('data-win-celebration', 'fireworks');
  await expect.poll(() => page.evaluate(() => window.celebrationRandomCalls)).toBe(2);
  await expect(celebration).toHaveCount(1);
  await app.getByRole('button', { name: 'New deal' }).click();
  await expect(celebration).toHaveCount(0);
  await expect(app.locator('.solitaire-table')).not.toHaveAttribute('data-win-celebration', /.+/);
});

test('bounce and spiral win celebrations use floating card layers too', async ({ page }) => {
  const winningDeal = savedKlondike({
    columns: [[[13, 0]]],
    foundations: { 0: Array.from({ length: 12 }, (_, index) => index + 1),
      1: Array.from({ length: 13 }, (_, index) => index + 1),
      2: Array.from({ length: 13 }, (_, index) => index + 1),
      3: Array.from({ length: 13 }, (_, index) => index + 1) },
  });
  for (const [randomValue, effect] of [[0.2, 'bounce'], [0.4, 'spiral']]) {
    const app = await restoreGame(page, winningDeal);
    await page.evaluate(value => { Math.random = () => value; }, randomValue);
    await app.locator('[data-key="card-12"]').dblclick();
    const layer = page.locator('body > .solitaire-celebration-layer');
    await expect(layer).toHaveCount(1);
    await expect(layer.locator(`.game-layer-card.win-${effect}`)).toHaveCount(52);
    await expect(app.locator('.solitaire-table .win-bounce, .solitaire-table .win-spiral')).toHaveCount(0);
    await page.locator('#close-btn').click();
    await expect(layer).toHaveCount(0);
  }
});

test('rain, wave, and tornado celebrations animate changing cards on the fixed layer', async ({ page }) => {
  const winningDeal = savedKlondike({
    columns: [[[13, 0]]],
    foundations: { 0: Array.from({ length: 12 }, (_, index) => index + 1),
      1: Array.from({ length: 13 }, (_, index) => index + 1),
      2: Array.from({ length: 13 }, (_, index) => index + 1),
      3: Array.from({ length: 13 }, (_, index) => index + 1) },
  });
  for (const [randomValue, effect] of [[0.55, 'rain'], [0.72, 'wave'], [0.9, 'tornado']]) {
    const app = await restoreGame(page, winningDeal);
    await page.evaluate(value => { Math.random = () => value; }, randomValue);
    await app.locator('[data-key="card-12"]').dblclick();
    const layer = page.locator('body > .solitaire-celebration-layer');
    await expect(layer).toHaveCount(1);
    const cards = layer.locator(`.game-layer-card.card-${effect}`);
    await expect(cards).toHaveCount(52);
    expect(await cards.first().evaluate(card => card.getAnimations().length)).toBeGreaterThan(0);
    if (effect === 'rain') {
      const before = await cards.first().textContent();
      await page.waitForTimeout(120);
      await expect.poll(() => cards.first().textContent()).not.toBe(before);
    }
    await page.locator('#close-btn').click();
    await expect(layer).toHaveCount(0);
  }
});

test('the win screen appears after the celebration and lets Klondike choose the next deal options', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({
    columns: [[[13, 0]]],
    foundations: { 0: Array.from({ length: 12 }, (_, index) => index + 1),
      1: Array.from({ length: 13 }, (_, index) => index + 1),
      2: Array.from({ length: 13 }, (_, index) => index + 1),
      3: Array.from({ length: 13 }, (_, index) => index + 1) },
  }));
  await page.evaluate(() => { Math.random = () => 0.01; });
  await app.locator('[data-key="card-12"]').dblclick();
  const screen = app.locator('.game-new-game-screen');
  await expect(screen).toBeVisible({ timeout: 6000 });
  await expect(screen.getByRole('heading', { name: 'Victory!' })).toBeVisible();
  await screen.getByLabel('Draw', { exact: true }).selectOption('3');
  await screen.getByRole('button', { name: 'Start new game' }).click();
  await expect(screen).toHaveCount(0);
  await expect(app.getByLabel('Draw', { exact: true })).toHaveValue('3');
  await expect(app.locator('.solitaire-table')).toBeVisible();
});

test('Spider celebrations include cards from all eight completed Home runs', async ({ page }) => {
  await openGame(page, 'spider');
  const cardCount = await page.evaluate(async () => {
    const app = document.querySelector('.app-window[data-type="spider"]');
    const table = app.querySelector('.solitaire-table');
    table.querySelectorAll('.spider-home-space').forEach(space => space.classList.add('completed'));
    const { createWinCelebration } = await import('/apps/games/celebrations.js');
    const cleanup = createWinCelebration('wave', 'spider', {
      completed: 8,
      suits: 1,
    }, table, app);
    const count = document.querySelectorAll('.solitaire-celebration-layer .game-layer-card').length;
    cleanup();
    return count;
  });
  expect(cardCount).toBe(104);
});

test('solitaire tableau scrolls independently and reduced motion suppresses celebration animation', async ({ page }) => {
  const longColumn = Array.from({ length: 52 }, (_, id) => [id % 13 + 1, Math.floor(id / 13)]);
  const app = await restoreGame(page, savedKlondike({ columns: [longColumn] }));
  const scroll = app.locator('.card-tableau-scroll');
  const before = await app.locator('.card-top-row').boundingBox();
  const dimensions = await scroll.evaluate(element => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    paddingTop: parseFloat(getComputedStyle(element).paddingTop),
    firstCardOffset: element.querySelector('.playing-card').getBoundingClientRect().top
      - element.getBoundingClientRect().top,
    tableGap: parseFloat(getComputedStyle(element.parentElement).rowGap),
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
  expect(dimensions.paddingTop).toBe(32);
  expect(dimensions.firstCardOffset).toBeGreaterThanOrEqual(31);
  expect(dimensions.tableGap).toBe(0);
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
  await expect(winningApp.locator('.solitaire-celebration-layer')).toHaveCount(0);
  await expect(winningApp.locator('.game-new-game-screen')).toBeVisible();
  await expect(winningApp.locator('.game-new-game-screen').getByLabel('Draw', { exact: true })).toHaveValue('1');
});

test('Minesweeper supports reveal, touch flag mode, keyboard flags, and all board sizes', async ({ page }) => {
  const app = await openGame(page, 'minesweeper');
  await expect(app.locator('.mine-cell')).toHaveCount(81);
  const boardCentering = await app.evaluate(element => {
    const area = element.querySelector('.game-area').getBoundingClientRect();
    const wrap = element.querySelector('.mine-board-wrap').getBoundingClientRect();
    return Math.abs((area.left + area.width / 2) - (wrap.left + wrap.width / 2));
  });
  expect(boardCentering).toBeLessThan(2);
  await app.locator('.mine-cell').first().click();
  await expect(app.locator('.mine-cell').first()).toHaveClass(/revealed/);
  await app.getByRole('button', { name: 'New game' }).click();
  await openSettings(app);
  await app.getByRole('button', { name: 'Flag mode' }).click();
  await app.getByRole('button', { name: 'Close settings' }).click();
  await app.locator('.mine-cell').first().click();
  await expect(app.locator('.mine-cell').first()).toHaveClass(/flagged/);
  await page.keyboard.press('f');
  await expect(app.locator('.mine-cell').first()).not.toHaveClass(/flagged/);
  await setGameOption(app, 'Difficulty', 'intermediate');
  await expect(app.locator('.mine-cell')).toHaveCount(256);
  await setGameOption(app, 'Difficulty', 'expert');
  await expect(app.locator('.mine-cell')).toHaveCount(480);
  const expertBoardCentering = await app.evaluate(element => {
    const area = element.querySelector('.game-area').getBoundingClientRect();
    const wrap = element.querySelector('.mine-board-wrap').getBoundingClientRect();
    return Math.abs((area.left + area.width / 2) - (wrap.left + wrap.width / 2));
  });
  expect(expertBoardCentering).toBeLessThan(2);
  await expect(app.getByRole('button', { name: 'Flag mode', includeHidden: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Minesweeper win screen lets users change the next game difficulty', async ({ page }) => {
  const app = await restoreGame(page, savedMinesweeper(), 'minesweeper');
  await app.locator('[data-key="mine-10"]').click();
  const screen = app.locator('.game-new-game-screen');
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Minefield cleared!' })).toBeVisible();
  await screen.getByLabel('Difficulty', { exact: true }).selectOption('intermediate');
  await screen.getByRole('button', { name: 'Start new game' }).click();
  await expect(app.locator('.mine-cell')).toHaveCount(256);
  await expect(app.getByLabel('Difficulty', { exact: true })).toHaveValue('intermediate');
});

test('Chess moves animate, and checkmate opens the opponent options for a new game', async ({ page }) => {
  const app = await openGame(page, 'chess');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setGameOption(app, 'Opponent', 'local');
  const moves = [
    ['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['b8', 'c6'],
    ['f1', 'c4'], ['g8', 'f6'], ['h5', 'f7'],
  ];
  for (const [from, to] of moves) {
    await app.locator(`[data-square="${from}"]`).click();
    await app.locator(`[data-square="${to}"]`).click();
    if (from === 'e2') {
      expect(await app.locator('[data-square="e4"] .chess-piece').evaluate(piece => piece.getAnimations().length))
        .toBeGreaterThan(0);
    }
  }
  const screen = app.locator('.game-new-game-screen');
  await expect(screen).toBeVisible({ timeout: 3000 });
  await expect(screen).toContainText('Checkmate');
  await screen.getByLabel('Opponent', { exact: true }).selectOption('computer');
  await screen.getByRole('button', { name: 'Start new game' }).click();
  await expect(screen).toHaveCount(0);
  await expect(app.locator('.chess-piece')).toHaveCount(32);
  await expect(app.getByLabel('Opponent', { exact: true })).toHaveValue('computer');
});

test('Reversi terminal screen offers opponent options before starting again', async ({ page }) => {
  const { finalMove, finalBefore } = await page.evaluate(async () => {
    const { createReversi, playReversi, reversiMoves } = await import('/apps/games/reversi.js');
    const game = createReversi();
    let moveToFinish = null, positionBeforeFinish = null, seed = 17;
    while (game.status === 'playing') {
      const moves = reversiMoves(game.board, game.turn);
      const index = moves[(seed * 7) % moves.length];
      const before = structuredClone(game);
      playReversi(game, index);
      if (game.status === 'finished') {
        moveToFinish = index;
        positionBeforeFinish = before;
        break;
      }
      seed = (seed * 17 + 13) % 997;
    }
    return { finalMove: moveToFinish, finalBefore: positionBeforeFinish };
  });
  expect(finalMove).not.toBeNull();
  const session = {
    v: 2,
    columns: [{
      widthPreset: 'full',
      apps: [{
        type: 'reversi',
        state: {
          version: 1,
          kind: 'reversi',
          options: { mode: 'local' },
          state: finalBefore,
        },
      }],
    }],
  };
  const app = await restoreGame(page, session, 'reversi');
  const file = 'abcdefgh'[finalMove % 8];
  const rank = 8 - Math.floor(finalMove / 8);
  await app.locator(`[data-square="${file}${rank}"]`).click();
  const screen = app.locator('.game-new-game-screen');
  await expect(screen).toBeVisible({ timeout: 3000 });
  await expect(screen.getByLabel('Opponent', { exact: true })).toHaveValue('local');
  await screen.getByLabel('Opponent', { exact: true }).selectOption('computer');
  await screen.getByRole('button', { name: 'Start new game' }).click();
  await expect(app.locator('.disc')).toHaveCount(4);
  await expect(app.getByLabel('Opponent', { exact: true })).toHaveValue('computer');
});

test('Chess makes computer turns, undoes a round, and supports local two-player', async ({ page }) => {
  const app = await openGame(page, 'chess');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const beforeSize = await app.locator('.chess-board').evaluate(board => {
    const boardWidth = board.getBoundingClientRect().width;
    const cells = [...board.querySelectorAll('.board-square')].map(cell => cell.getBoundingClientRect());
    return { boardWidth, width: cells[0].width, height: cells[0].height,
      widthRange: Math.max(...cells.map(cell => cell.width)) - Math.min(...cells.map(cell => cell.width)),
      heightRange: Math.max(...cells.map(cell => cell.height)) - Math.min(...cells.map(cell => cell.height)) };
  });
  expect(beforeSize.widthRange).toBeLessThan(0.5);
  expect(beforeSize.heightRange).toBeLessThan(0.5);
  expect(Math.abs(beforeSize.width - beforeSize.height)).toBeLessThan(0.5);
  await app.locator('[data-square="e2"]').click();
  await expect(app.locator('[data-square="e4"]')).toHaveClass(/legal/);
  await app.locator('[data-square="e4"]').click();
  expect(await app.locator('[data-square="e4"] .chess-piece').evaluate(piece => piece.getAnimations().length))
    .toBeGreaterThan(0);
  expect(Math.abs(await app.locator('.chess-board').evaluate(board => board.getBoundingClientRect().width)
    - beforeSize.boardWidth)).toBeLessThan(0.5);
  await expect(app.locator('.game-status')).toContainText('White to move', { timeout: 10000 });
  await expect(app.locator('.piece-black')).toHaveCount(16);
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(app.locator('[data-square="e2"]')).toHaveAttribute('aria-label', /White Pawn/);
  await setGameOption(app, 'Opponent', 'local');
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
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(app.locator('.legal')).toHaveCount(4);
  const boardSize = await app.locator('.reversi-board').evaluate(board => {
    const rect = board.getBoundingClientRect();
    const cells = [...board.querySelectorAll('.board-square')].map(cell => cell.getBoundingClientRect());
    return { board: [rect.width, rect.height],
      widthRange: Math.max(...cells.map(cell => cell.width)) - Math.min(...cells.map(cell => cell.width)),
      heightRange: Math.max(...cells.map(cell => cell.height)) - Math.min(...cells.map(cell => cell.height)) };
  });
  expect(Math.abs(boardSize.board[0] - boardSize.board[1])).toBeLessThan(1);
  expect(boardSize.widthRange).toBeLessThan(0.5);
  expect(boardSize.heightRange).toBeLessThan(0.5);
  await app.locator('[data-square="d6"]').click();
  expect(Math.abs(await app.locator('.reversi-board').evaluate(board => board.getBoundingClientRect().width)
    - boardSize.board[0])).toBeLessThan(0.5);
  await expect(app.locator('.game-status')).toContainText('Black to move');
  await expect(app.locator('.disc')).toHaveCount(6);
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(app.locator('.disc')).toHaveCount(4);
  await setGameOption(app, 'Opponent', 'local');
  await app.locator('[data-square="d6"]').click();
  await expect(app.locator('[data-square="d6"] .disc')).toHaveClass(/disc-placed/);
  await expect(app.locator('[data-square="d5"] .disc')).toHaveClass(/disc-flipping/);
  expect(await app.locator('[data-square="d6"] .disc').evaluate(disc => disc.getAnimations().length))
    .toBeGreaterThan(0);
  expect(await app.locator('[data-square="d5"] .disc').evaluate(disc => disc.getAnimations().length))
    .toBeGreaterThan(0);
  await expect(app.locator('.game-status')).toContainText('White to move');
  await expect(app.locator('.disc.black')).toHaveCount(4);
  await page.locator('#app-menu-btn').click();
  await page.locator('#game-center-entry').click();
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
  await setGameOption(cards, 'Draw', '3');
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
  await setGameOption(chess, 'Opponent', 'local');
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
  await setGameOption(second, 'Difficulty', 'intermediate');
  await openSettings(second);
  await second.getByRole('button', { name: 'Flag mode' }).click();
  await second.getByRole('button', { name: 'Close settings' }).click();
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
  await setGameOption(app, 'Opponent', 'local');
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
