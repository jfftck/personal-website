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

test('root menu restores app and file entries; all nine game tiles stay nested with back/Escape navigation', async ({ page }) => {
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
  await expect(page.locator('#game-list .app-launcher')).toHaveCount(9);
  await expect(page.locator('#game-list .app-launcher small')).toHaveCount(0);
  for (const game of ['Klondike', 'Spider', 'FreeCell', 'Pyramid', 'TriPeaks', 'Golf', 'Minesweeper', 'Chess', 'Reversi']) {
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

test('Pyramid, TriPeaks, and Golf use shared card settings and their own playable layouts', async ({ page }) => {
  const expectStagger = async (table, type) => {
    if (type === 'pyramid') {
      const offsets = await table.evaluate(element => {
        const rows = [...element.querySelectorAll('.pyramid-layout .card-triangle-row')];
        const first = rows[0].getBoundingClientRect();
        const second = rows[1].getBoundingClientRect();
        const cardWidth = rows[0].querySelector('.card-triangle-position').getBoundingClientRect().width;
        const gap = parseFloat(getComputedStyle(rows[0]).columnGap);
        return { offset: first.left - second.left, expected: (cardWidth + gap) / 2 };
      });
      expect(Math.abs(offsets.offset - offsets.expected)).toBeLessThan(1);
    } else if (type === 'tripeaks') {
      const offsets = await table.evaluate(element => {
        const rows = [...element.querySelectorAll('.tripeaks-layout .card-triangle-row')];
        const cardWidth = rows[0].querySelector('.card-triangle-position').getBoundingClientRect().width;
        return {
          cardWidth,
          x: rows.map(row => {
            const transform = getComputedStyle(row).transform;
            return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
          }),
        };
      });
      for (const [actual, expected] of offsets.x.map((value, index) =>
        [value, index === 0 || index === 2 ? offsets.cardWidth / 2
          : index === 1 ? offsets.cardWidth : 0])) {
        expect(Math.abs(actual - expected)).toBeLessThan(1);
      }
    }
  };
  const findUncoveredLowerHalf = table => table.evaluate(element => {
    const rows = [...element.querySelectorAll('.card-triangle-row')];
    const cards = [...element.querySelectorAll('.card-triangle-position .playing-card')];
    const rects = new Map(cards.map(card => [card, card.getBoundingClientRect()]));
    const visible = element.querySelector('.card-tableau-scroll').getBoundingClientRect();
    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
      for (const card of rows[rowIndex].querySelectorAll('.playing-card')) {
        const rect = rects.get(card);
        for (const yFraction of [.6, .75, .9]) {
          for (let x = rect.left + 3; x < rect.right - 3; x += 2) {
            const y = rect.top + rect.height * yFraction;
            if (x <= Math.max(0, visible.left) || x >= Math.min(innerWidth, visible.right)
              || y <= Math.max(0, visible.top) || y >= Math.min(innerHeight, visible.bottom)) continue;
            const covered = cards.some(other => {
              if (other === card) return false;
              const otherRect = rects.get(other);
              return x >= otherRect.left - 2 && x <= otherRect.right + 2
                && y >= otherRect.top - 2 && y <= otherRect.bottom + 2;
            });
            if (covered) continue;
            return {
              x, y,
              cardId: card.dataset.cardId,
              hitId: document.elementFromPoint(x, y)?.closest('.playing-card')?.dataset.cardId || null,
            };
          }
        }
      }
    }
    return null;
  });

  for (const game of [
    { type: 'pyramid', title: 'Pyramid', cardCount: 28, stock: 24, rule: 'pairs that total 13' },
    { type: 'tripeaks', title: 'TriPeaks', cardCount: 28, stock: 23, rule: 'Ace and King connect' },
    { type: 'golf', title: 'Golf', cardCount: 35, stock: 16, rule: 'Aces and Kings do not connect' },
  ]) {
    const app = await openGame(page, game.type);
    const table = app.locator('.solitaire-table');
    await expect(table).toHaveClass(new RegExp(game.type));
    await expect(table).toHaveCSS('user-select', 'none');
    if (game.type === 'golf') {
      await expect(table.locator('.card-columns > .card-pile')).toHaveCount(7);
      await expect(table.locator('.card-columns .playing-card')).toHaveCount(game.cardCount);
    } else {
      await expect(table.locator('.card-triangle-position:not(.removed)')).toHaveCount(game.cardCount);
      await expectStagger(table, game.type);
      const coveredCard = table.locator('.card-triangle-row').first().locator('.playing-card').first();
      await expect(coveredCard).toBeEnabled();
      await expect(coveredCard).toHaveAttribute('aria-label', /covered by other cards/);
      const coveredBounds = await coveredCard.boundingBox();
      await coveredCard.click({ position: { x: coveredBounds.width / 2, y: coveredBounds.height * 0.2 } });
      await expect(app.locator('.game-status')).toHaveText(game.type === 'pyramid'
        ? 'That card is still covered.' : 'That card is still covered by the cards below it.');
      const exposedCard = table.locator('.card-triangle-row').last().locator('.playing-card').first();
      await expect(exposedCard).toBeEnabled();
      const exposedBounds = await exposedCard.boundingBox();
      await exposedCard.click({ position: { x: exposedBounds.width / 2, y: exposedBounds.height * 0.8 } });
      await expect(app.locator('.game-status')).not.toContainText('covered');
      const uncovered = await findUncoveredLowerHalf(table);
      expect(uncovered).not.toBeNull();
      expect(uncovered.hitId, JSON.stringify(uncovered)).toBe(uncovered.cardId);
      await page.mouse.click(uncovered.x, uncovered.y);
      await expect(app.locator('.game-status')).toContainText('covered');
      await page.setViewportSize({ width: 402, height: 874 });
      await expectStagger(table, game.type);
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    const stock = app.locator('.card-stock button');
    await expect(stock).toContainText(String(game.stock));
    await stock.click();
    await expect(stock).toContainText(String(game.stock - 1));
    await expect(table.locator('.card-pile[aria-label="Waste"] .playing-card')).toHaveCount(1);

    const instructions = app.getByRole('button', { name: 'Instructions', exact: true });
    await instructions.click();
    const panel = app.locator('.game-instructions');
    await expect(panel.getByRole('heading', { name: `How to play ${game.title}` })).toBeVisible();
    await expect(panel).toContainText(game.rule);
    await panel.getByRole('button', { name: 'Close instructions' }).click();

    const dialog = await openSettings(app);
    await dialog.getByRole('radio', { name: 'Card theme: Glass', exact: true }).click();
    await dialog.getByRole('radio', { name: 'Playfield theme: Midnight', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close settings' }).click();
    await expect(app).toHaveAttribute('data-card-theme', 'glass');
    await expect(app).toHaveAttribute('data-card-table-theme', 'midnight');
    await page.locator('#close-btn').click();
  }
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
  const games = ['klondike', 'spider', 'freecell', 'pyramid', 'tripeaks', 'golf', 'minesweeper', 'chess', 'reversi'];
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
      expect(iconPaths.size).toBe(9);
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

test('Chess and Reversi piece outlines stay at 10% with dark outlines on white and white outlines on black', async ({ page }) => {
  const chess = await openGame(page, 'chess');
  let dialog = await openSettings(chess);
  for (const theme of ['Classic', 'Modern', 'Glass']) {
    await dialog.getByRole('radio', { name: `Piece theme: ${theme}`, exact: true }).click();
    const outlines = await chess.evaluate(element => {
      const outline = side => getComputedStyle(element.querySelector(`.piece-${side} .piece-body`)).stroke;
      return { white: outline('white'), black: outline('black') };
    });
    expect(outlines.white).toBe('rgba(0, 0, 0, 0.1)');
    expect(outlines.black).toBe('rgba(255, 255, 255, 0.1)');
    const preview = dialog.locator(`.game-theme-preview--chess-pieces[data-preview-theme="${theme.toLowerCase()}"]`);
    const previewOutlines = await preview.locator('.game-theme-chess-piece').evaluateAll(pieces =>
      pieces.map(piece => getComputedStyle(piece).textShadow));
    expect(previewOutlines[0]).toContain('rgba(0, 0, 0, 0.1)');
    expect(previewOutlines[1]).toContain('rgba(255, 255, 255, 0.1)');
  }
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await page.locator('#close-btn').click();

  const reversi = await openGame(page, 'reversi');
  dialog = await openSettings(reversi);
  for (const theme of ['Classic', 'Amber', 'Glass']) {
    await dialog.getByRole('radio', { name: `Piece theme: ${theme}`, exact: true }).click();
    const outlines = await reversi.evaluate(element => ({
      white: getComputedStyle(element.querySelector('.disc.white')).borderTopColor,
      black: getComputedStyle(element.querySelector('.disc.black')).borderTopColor,
    }));
    expect(outlines.white).toBe('rgba(0, 0, 0, 0.1)');
    expect(outlines.black).toBe('rgba(255, 255, 255, 0.1)');
    const preview = dialog.locator(`.game-theme-preview--reversi-pieces[data-preview-theme="${theme.toLowerCase()}"]`);
    expect(await preview.locator('.game-theme-disc--light').evaluate(piece =>
      getComputedStyle(piece).borderTopColor)).toBe('rgba(0, 0, 0, 0.1)');
    expect(await preview.locator('.game-theme-disc:not(.game-theme-disc--light)').evaluate(piece =>
      getComputedStyle(piece).borderTopColor)).toBe('rgba(255, 255, 255, 0.1)');
  }
});

test('Glass theme previews adapt to both desktop appearances and stay distinct from neighboring themes', async ({ page }) => {
  const previewGroups = [
    { game: 'klondike', types: [['cards', 'botanical'], ['card-table', 'botanical']] },
    { game: 'chess', types: [['chess-board', 'slate'], ['chess-pieces', 'modern']] },
    { game: 'reversi', types: [['reversi-board', 'ocean'], ['reversi-pieces', 'amber']] },
  ];
  const appearanceSignatures = new Map();

  for (const { game, types } of previewGroups) {
    const app = await openGame(page, game);
    const dialog = await openSettings(app);
    for (const [type, neighbor] of types) {
      const glass = dialog.locator(`.game-theme-preview--${type}[data-preview-theme="glass"]`);
      const adjacent = dialog.locator(`.game-theme-preview--${type}[data-preview-theme="${neighbor}"]`);
      for (const appearance of ['light', 'dark']) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, appearance);
        const signature = async sample => sample.evaluate(element => {
          const visualParts = [element, ...element.querySelectorAll('span')];
          return visualParts.map(part => {
            const style = getComputedStyle(part);
            return [
              style.backgroundColor,
              style.backgroundImage,
              style.color,
              style.borderColor,
            ].join('/');
          }).join('|');
        });
        const glassAppearance = await signature(glass);
        const neighborAppearance = await signature(adjacent);
        expect(glassAppearance, `${game} ${type} Glass should change in ${appearance}`).not.toBe(
          appearanceSignatures.get(`${game}-${type}`),
        );
        expect(glassAppearance, `${game} ${type} Glass should differ from ${neighbor} in ${appearance}`)
          .not.toBe(neighborAppearance);
        appearanceSignatures.set(`${game}-${type}`, glassAppearance);
      }
    }
    await dialog.getByRole('button', { name: 'Close settings' }).click();
  }
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
      cardFaces: 'classic',
      cardBacks: 'lattice',
      cardTable: 'classic',
      chessBoard: 'wood',
      chessPieces: 'classic',
      chessArtwork: 'classic',
      reversiBoard: 'classic',
      reversiPieces: 'classic',
      minesweeper: 'classic',
    });
});

test('game settings dialogs contain options, trap keyboard focus, and return focus on Escape', async ({ page }) => {
  for (const game of ['klondike', 'spider', 'freecell', 'pyramid', 'tripeaks', 'golf', 'minesweeper', 'chess', 'reversi']) {
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
  for (const game of ['klondike', 'spider', 'freecell', 'pyramid', 'tripeaks', 'golf', 'minesweeper', 'chess', 'reversi']) {
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

test('Glass game materials are translucent and blurred, with distinguishable colors in both appearances', async ({ page }) => {
  for (const game of ['klondike', 'chess', 'reversi', 'minesweeper']) {
    const app = await openGame(page, game);
    const dialog = await openSettings(app);
    const labels = game === 'klondike' ? ['Card theme', 'Playfield theme']
      : game === 'minesweeper' ? ['Theme'] : ['Board theme', 'Piece theme'];
    for (const label of labels) await dialog.getByRole('radio', { name: `${label}: Glass`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Close settings' }).click();
    const results = await app.evaluate((element, kind) => {
      const translucent = value => [...value.matchAll(/rgba\([^)]+,\s*([\d.]+)\)/g)]
        .some(match => Number(match[1]) > 0 && Number(match[1]) < 1);
      const values = {};
      for (const appearance of ['light', 'dark']) {
        document.documentElement.dataset.theme = appearance;
        const style = getComputedStyle(element);
        if (kind === 'klondike') {
          values[`${appearance}-face-transparent`] = translucent(style.getPropertyValue('--card-face'));
          values[`${appearance}-suits-distinct`] = style.getPropertyValue('--card-ink') !== style.getPropertyValue('--card-red');
          values[`${appearance}-card-blur`] = getComputedStyle(element.querySelector('.playing-card')).backdropFilter.includes('blur');
          values[`${appearance}-table-blur`] = getComputedStyle(element.querySelector('.solitaire-table')).backdropFilter.includes('blur');
          values[`${appearance}-table-transparent`] = translucent(getComputedStyle(element.querySelector('.solitaire-table')).background);
        } else if (kind === 'chess') {
          const light = getComputedStyle(element.querySelector('.board-square.light'));
          const dark = getComputedStyle(element.querySelector('.board-square.dark'));
          values[`${appearance}-squares-distinct`] = light.backgroundImage !== dark.backgroundImage;
          values[`${appearance}-square-transparent`] = translucent(light.backgroundImage);
          values[`${appearance}-square-blur`] = light.backdropFilter.includes('blur');
          values[`${appearance}-pieces-distinct`] = style.getPropertyValue('--chess-white-piece') !== style.getPropertyValue('--chess-black-piece');
          values[`${appearance}-pieces-transparent`] = translucent(style.getPropertyValue('--chess-white-piece'));
        } else if (kind === 'reversi') {
          const square = getComputedStyle(element.querySelector('.board-square'));
          values[`${appearance}-board-transparent`] = translucent(square.backgroundImage);
          values[`${appearance}-board-blur`] = square.backdropFilter.includes('blur');
          values[`${appearance}-discs-distinct`] = style.getPropertyValue('--disc-black') !== style.getPropertyValue('--disc-white');
          values[`${appearance}-discs-transparent`] = translucent(style.getPropertyValue('--disc-white'));
        } else {
          const cell = getComputedStyle(element.querySelector('.mine-cell'));
          values[`${appearance}-cells-transparent`] = translucent(cell.backgroundImage);
          values[`${appearance}-cells-blur`] = cell.backdropFilter.includes('blur');
          values[`${appearance}-states-distinct`] = style.getPropertyValue('--mine-cell-face') !== style.getPropertyValue('--mine-cell-open');
        }
      }
      return values;
    }, game);
    for (const [name, value] of Object.entries(results)) {
      expect(value, `${game}: ${name} ${JSON.stringify(results)}`).toBe(true);
    }
  }
});

test('card faces and backs share independent artwork choices, and Chess silhouettes persist separately from colors', async ({ page }) => {
  const cards = await openGame(page, 'klondike');
  let dialog = await openSettings(cards);
  await dialog.getByRole('radio', { name: 'Card faces: Ornate', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Card backs: Orbit', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Card theme: Botanical', exact: true }).click();
  await expect(cards).toHaveAttribute('data-card-face-style', 'ornate');
  await expect(cards).toHaveAttribute('data-card-back-style', 'orbit');
  const minimalPreview = dialog.locator('.game-theme-preview--card-faces[data-card-face-style="minimal"]');
  expect(await minimalPreview.locator('.card-art-minimal').evaluate(node => getComputedStyle(node).display)).not.toBe('none');
  expect(await minimalPreview.locator('.card-art-ornate').evaluate(node => getComputedStyle(node).display)).toBe('none');
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  const firstCard = cards.locator('.playing-card:not(.face-down)').first();
  await expect(firstCard.locator('.card-face-art')).toHaveCount(1);
  expect(await firstCard.locator('.card-art-ornate').evaluate(node => getComputedStyle(node).display)).not.toBe('none');

  const spider = await openGame(page, 'spider');
  await expect(spider).toHaveAttribute('data-card-face-style', 'ornate');
  await expect(spider).toHaveAttribute('data-card-back-style', 'orbit');
  dialog = await openSettings(spider);
  await dialog.getByRole('radio', { name: 'Card faces: Minimal', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Card backs: Diamonds', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(cards).toHaveAttribute('data-card-face-style', 'minimal');
  await expect(cards).toHaveAttribute('data-card-back-style', 'diamonds');
  await expect(cards).toHaveAttribute('data-card-theme', 'botanical');
  const freecell = await openGame(page, 'freecell');
  await expect(freecell).toHaveAttribute('data-card-face-style', 'minimal');
  await expect(freecell).toHaveAttribute('data-card-back-style', 'diamonds');

  const chess = await openGame(page, 'chess');
  dialog = await openSettings(chess);
  await dialog.getByRole('radio', { name: 'Piece style: Geometric', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Piece theme: Glass', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Piece style: Carved', exact: true }).click();
  const geometricPreview = dialog.locator('.game-theme-preview--chess-artwork[data-chess-piece-style="geometric"]');
  expect(await geometricPreview.locator('.chess-shape-geometric').first().evaluate(node => getComputedStyle(node).display)).not.toBe('none');
  expect(await geometricPreview.locator('.chess-shape-carved').first().evaluate(node => getComputedStyle(node).display)).toBe('none');
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect(chess).toHaveAttribute('data-chess-piece-style', 'carved');
  await expect(chess).toHaveAttribute('data-chess-pieces-theme', 'glass');
  expect(await chess.locator('.chess-board .chess-shape-carved').first().evaluate(node => getComputedStyle(node).display)).not.toBe('none');
  expect(await chess.locator('.chess-board .chess-shape-classic').first().evaluate(node => getComputedStyle(node).display)).toBe('none');

  await page.reload();
  await page.locator('#welcome-win-close').click();
  await expect(page.locator('.app-window[data-type="chess"]')).toHaveAttribute('data-chess-piece-style', 'carved');
  await expect(page.locator('.app-window[data-type="klondike"]')).toHaveAttribute('data-card-face-style', 'minimal');
  await expect(page.locator('.app-window[data-type="klondike"]')).toHaveAttribute('data-card-back-style', 'diamonds');
});

test('selected card back artwork stays visible on face-down playfield cards as well as the stock', async ({ page }) => {
  for (const game of ['klondike', 'spider']) {
    const app = await openGame(page, game);
    const dialog = await openSettings(app);
    for (const theme of ['Classic', 'Midnight', 'Botanical', 'Glass']) {
      await dialog.getByRole('radio', { name: `Card theme: ${theme}`, exact: true }).click();
      for (const artwork of ['Diamonds', 'Orbit']) {
        await dialog.getByRole('radio', { name: `Card backs: ${artwork}`, exact: true }).click();
        const result = await app.evaluate(element => {
          const card = element.querySelector('.card-columns .playing-card.face-down');
          const stock = element.querySelector('.card-stock button');
          const cardStyle = getComputedStyle(card, '::before');
          const stockStyle = getComputedStyle(stock, '::before');
          return {
            color: cardStyle.color, stockColor: stockStyle.color,
            image: cardStyle.backgroundImage, stockImage: stockStyle.backgroundImage,
            opacity: Number(cardStyle.opacity),
          };
        });
        expect(result.color, `${game}, ${theme}, ${artwork}`).not.toBe('rgba(0, 0, 0, 0)');
        expect(result.color).toBe(result.stockColor);
        expect(result.image).toBe(result.stockImage);
        expect(result.image).not.toBe('none');
        expect(result.opacity).toBeGreaterThan(0);
      }
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

test('Minesweeper Glass number and flag colors remain distinguishable in light and dark appearances', async ({ page }) => {
  const app = await restoreGame(page, savedMinesweeper({ finalSafeCell: 10 }), 'minesweeper');
  await openSettings(app);
  const themePicker = app.getByRole('radiogroup', { name: 'Theme' });
  await themePicker.getByRole('radio', { name: 'Theme: Glass' }).click();
  await app.getByRole('button', { name: 'Close settings' }).click();
  await app.locator('.mine-cell').nth(10).press('f');
  const contrast = await app.evaluate(element => {
    const root = element.querySelector('.mine-board').closest('.game-app');
    const luminance = color => {
      const channels = color.startsWith('#')
        ? color.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        : color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255);
      const linear = channels.map(value => value <= 0.04045
        ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const contrastRatio = (foreground, background) => {
      const fg = typeof foreground === 'number' ? foreground : luminance(foreground);
      const bg = typeof background === 'number' ? background : luminance(background);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    };
    const colors = value => [...value.matchAll(/rgba?\([^)]*\)|#[\da-f]{6}/gi)].map(match => match[0]);
    const results = {};
    [...element.querySelectorAll('.mine-cell.revealed')].slice(0, 8)
      .forEach((cell, index) => { cell.dataset.number = String(index + 1); });
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      for (let number = 1; number <= 8; number++) {
        const cell = element.querySelector(`.mine-cell[data-number="${number}"]`);
        const style = getComputedStyle(cell);
        const stops = colors(getComputedStyle(root).getPropertyValue('--mine-cell-open'));
        results[`${theme}-${number}`] = Math.min(...stops.map(stop => contrastRatio(style.color, stop)));
      }
      const flag = element.querySelector('.mine-cell.flagged');
      const flagColor = getComputedStyle(flag, '::after').borderTopColor;
      const stops = colors(getComputedStyle(root).getPropertyValue('--mine-cell-face'));
      results[`${theme}-flag`] = Math.min(...stops.map(stop => contrastRatio(flagColor, stop)));
    }
    return results;
  });
  for (const value of Object.values(contrast)) {
    expect(Number.isFinite(value), JSON.stringify(contrast)).toBe(true);
    expect(value, JSON.stringify(contrast)).toBeGreaterThan(1.1);
  }
});

test('Minesweeper revealed cells are darker across themes, with a centered Glass gradient and adaptive border', async ({ page }) => {
  const app = await restoreGame(page, savedMinesweeper({ finalSafeCell: 10 }), 'minesweeper');
  const settings = await openSettings(app);
  const choices = [
    ['Classic grey', 'classic'],
    ['Ocean', 'ocean'],
    ['Sunset', 'sunset'],
    ['Glass', 'glass'],
    ['Color-blind friendly', 'colorblind'],
  ];
  const result = await app.evaluate((element, themeChoices) => {
    const root = element.querySelector('.mine-board').closest('.game-app');
    const getStops = value => [...value.matchAll(/rgba?\([^)]*\)|#[\da-f]{6}/gi)].map(match => match[0]);
    const luminance = color => {
      const channels = color.startsWith('#')
        ? color.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        : color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255);
      const linear = channels.map(value => value <= 0.04045
        ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const ratio = (first, second) => (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    const values = {};
    for (const [, theme] of themeChoices) {
      root.dataset.minesweeperTheme = theme;
      for (const appearance of ['light', 'dark']) {
        document.documentElement.dataset.theme = appearance;
        const appStyle = getComputedStyle(root);
        const faceStops = getStops(appStyle.getPropertyValue('--mine-cell-face')).map(luminance);
        const openStops = getStops(appStyle.getPropertyValue('--mine-cell-open')).map(luminance);
        const faceMean = faceStops.reduce((sum, value) => sum + value, 0) / faceStops.length;
        const openMean = openStops.reduce((sum, value) => sum + value, 0) / openStops.length;
        values[`${theme}-${appearance}-surface`] = ratio(faceMean, openMean);
        values[`${theme}-${appearance}-darker`] = openMean < faceMean;

        const cells = [...element.querySelectorAll('.mine-cell.revealed')].slice(0, 8);
        cells.forEach((cell, index) => { cell.dataset.number = String(index + 1); });
        for (const cell of cells) {
          const foreground = luminance(getComputedStyle(cell).color);
          values[`${theme}-${appearance}-number-${cell.dataset.number}`] =
            Math.min(...openStops.map(stop => ratio(foreground, stop)));
        }

        if (theme === 'glass') {
          const border = luminance(getComputedStyle(element.querySelector('.mine-cell')).borderTopColor);
          values[`${appearance}-glass-border`] = border;
          values[`${appearance}-glass-face-center-brighter`] =
            faceStops[1] > faceStops[0] && faceStops[1] > faceStops.at(-1);
          values[`${appearance}-glass-open-center-brighter`] =
            openStops[1] > openStops[0] && openStops[1] > openStops.at(-1);
        }
      }
      const radio = document.querySelector(`.game-theme-preview--minesweeper[data-preview-theme="${theme}"]`);
      values[`${theme}-preview-open`] = getStops(getComputedStyle(radio).getPropertyValue('--preview-mine-open')).length > 0;
    }
    return values;
  }, choices);

  for (const [, theme] of choices) {
    expect(result[`${theme}-light-surface`], theme).toBeGreaterThanOrEqual(theme === 'glass' ? 1.1 : 2.5);
    expect(result[`${theme}-dark-surface`], theme).toBeGreaterThanOrEqual(theme === 'glass' ? 1.1 : 2.5);
    expect(result[`${theme}-light-darker`], theme).toBe(true);
    expect(result[`${theme}-dark-darker`], theme).toBe(true);
    expect(result[`${theme}-preview-open`]).toBe(true);
    for (const appearance of ['light', 'dark']) {
      for (let number = 1; number <= 8; number++) {
        expect(result[`${theme}-${appearance}-number-${number}`], `${theme} ${appearance} number ${number}`)
          .toBeGreaterThanOrEqual(theme === 'glass' ? 1.1 : 4.5);
      }
    }
  }
  expect(result['light-glass-border']).toBeLessThan(result['dark-glass-border']);
  expect(result['light-glass-face-center-brighter']).toBe(true);
  expect(result['light-glass-open-center-brighter']).toBe(true);
  expect(result['dark-glass-face-center-brighter']).toBe(true);
  expect(result['dark-glass-open-center-brighter']).toBe(true);
  await settings.getByRole('button', { name: 'Close settings' }).click();
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

test('all nine games share a keyboard-operable instructions side panel', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const game of ['klondike', 'spider', 'freecell', 'pyramid', 'tripeaks', 'golf', 'minesweeper', 'chess', 'reversi']) {
      const app = await openGame(page, game);
      const toggle = app.getByRole('button', { name: 'Instructions', exact: true });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      const panel = app.locator('.game-instructions');
      await expect(panel).toBeVisible();
      await expect(toggle.locator('.game-instructions-icon')).toBeVisible();
      await expect(toggle.locator('.game-instructions-icon')).toHaveAttribute('aria-hidden', 'true');
      const gameTitle = game === 'minesweeper' ? 'Minesweeper'
        : game === 'freecell' ? 'FreeCell' : game === 'tripeaks' ? 'TriPeaks'
          : game[0].toUpperCase() + game.slice(1);
      const tabIcon = page.locator(`.app-tab-btn[aria-label="${gameTitle}"] svg path`);
      await expect(toggle.locator('.game-instructions-icon svg path'))
        .toHaveAttribute('d', await tabIcon.getAttribute('d'));
      const appBox = await app.boundingBox();
      const panelBox = await panel.boundingBox();
      const toggleBox = await toggle.boundingBox();
      expect(Math.abs(panelBox.x - toggleBox.x)).toBeLessThanOrEqual(1);
      expect(panelBox.y).toBeGreaterThanOrEqual(toggleBox.y + toggleBox.height - 1);
      expect(panelBox.x).toBeGreaterThanOrEqual(appBox.x);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(appBox.x + appBox.width + 1);
      await expect(panel.getByRole('heading', { level: 2 })).toHaveText(`How to play ${gameTitle}`);
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
    ['pyramid', 'Pyramid'], ['tripeaks', 'TriPeaks'], ['golf', 'Golf'],
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
  expect(iconPaths.size).toBe(9);
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

test('an invalid face-up sequence cannot enter the drag layer', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({
    columns: [[[7, 0], [6, 0]], [[8, 1]]],
  }));
  const firstCard = app.locator('[data-key="card-6"]');
  const bounds = await firstCard.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + 45, { steps: 4 });
  await expect(page.locator('body > .card-drag-layer')).toHaveCount(0);
  await page.mouse.up();
  await expect(app.locator('[data-key="card-6"]')).toBeVisible();
  await expect(app.locator('[data-key="card-5"]')).toBeVisible();
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

test('holding the right mouse button peeks through original stack layers without moving or selecting cards', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({
    columns: [[[13, 0], [12, 1], [11, 0], [10, 1]]],
  }));
  const stack = app.locator('.card-columns .card-pile').first();
  const slots = await stack.locator('.playing-card').evaluateAll(cards => cards.map(card => {
    const rect = card.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + 8 };
  }));
  await page.mouse.move(slots[0].x, slots[0].y);
  await page.mouse.down({ button: 'right' });
  await expect(stack.locator('.card-peeking')).toHaveAttribute('data-offset', '0');
  for (const offset of [2, 1, 3, 0]) {
    await page.mouse.move(slots[offset].x, slots[offset].y);
    await expect(stack.locator('.card-peeking')).toHaveAttribute('data-offset', String(offset));
  }
  await expect(page.locator('.card-drag-layer')).toHaveCount(0);
  await expect(app.locator('.playing-card.selected')).toHaveCount(0);
  await page.screenshot({ path: 'generated-artifacts/card-stack-peek.jpg' });
  await page.mouse.up({ button: 'right' });
  await expect(stack.locator('.card-peeking')).toHaveCount(0);
  await expect(stack.locator('.playing-card')).toHaveCount(4);
  await expect(app.locator('.game-status')).toContainText('0 moves');
  expect(await stack.locator('.playing-card').first().evaluate(card =>
    !card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
});

test.describe('touch stack peeking', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('vertical finger movement follows layers in both directions and cleans up on release or cancellation', async ({ page }) => {
    const app = await restoreGame(page, savedFreecell({
      columnCards: [[[13, 0], [12, 1], [11, 0], [10, 1]]],
    }), 'freecell');
    const stack = app.locator('.card-columns .card-pile').first();
    const slots = await stack.locator('.playing-card').evaluateAll(cards => cards.map(card => {
      const rect = card.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + 8 };
    }));
    const client = await page.context().newCDPSession(page);
    const touch = (type, offset) => client.send('Input.dispatchTouchEvent', {
      type, touchPoints: offset == null ? [] : [{ ...slots[offset], id: 0 }],
    });
    await touch('touchStart', 0);
    for (const offset of [2, 1, 3, 0]) {
      await touch('touchMove', offset);
      await expect(stack.locator('.card-peeking')).toHaveAttribute('data-offset', String(offset));
      await expect(page.locator('.card-drag-layer')).toHaveCount(0);
    }
    await touch('touchEnd');
    await expect(app.locator('.card-peeking, .playing-card.selected')).toHaveCount(0);
    await expect(stack.locator('.playing-card')).toHaveCount(4);
    await expect(app.locator('.game-status')).toContainText('0 moves');
    await touch('touchStart', 0);
    await touch('touchMove', 2);
    await expect(stack.locator('.card-peeking')).toHaveCount(1);
    await touch('touchCancel');
    await expect(stack.locator('.card-peeking')).toHaveCount(0);
  });

  for (const direction of [1, -1]) {
  test(`a peeked valid sequence can become a drag after a half-card ${direction > 0 ? 'right' : 'left'} swipe`, async ({ page }) => {
    const app = await restoreGame(page, savedKlondike({
      columns: [[[7, 3], [6, 0], [5, 1]], [[7, 1]]],
    }));
    const source = app.locator('[aria-label="Pile 1"]');
    const startingCard = source.locator('[data-key="card-45"]');
    const peekedCard = source.locator('[data-key="card-5"]');
    const target = app.locator('.card-columns .card-pile').nth(1).locator('[data-key="card-19"]');
    const startBounds = await startingCard.boundingBox();
    const peekBounds = await peekedCard.boundingBox();
    const start = { x: startBounds.x + startBounds.width / 2, y: startBounds.y + 6 };
    const peekPoint = { x: start.x, y: peekBounds.y + 6 };
    const client = await page.context().newCDPSession(page);
    const touch = point => client.send('Input.dispatchTouchEvent', {
      type: point ? 'touchMove' : 'touchEnd',
      touchPoints: point ? [{ ...point, id: 0 }] : [],
    });

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...start, id: 0 }],
    });
    await touch(peekPoint);
    await expect(peekedCard).toHaveClass(/card-peeking/);
    const cardWidth = await peekedCard.evaluate(card => card.getBoundingClientRect().width);
    await touch({ x: peekPoint.x + direction * cardWidth * 0.4, y: peekPoint.y });
    await expect(page.locator('body > .card-drag-layer')).toHaveCount(0);
    await expect(peekedCard).toHaveClass(/card-peeking/);
    await touch({ x: peekPoint.x + direction * (cardWidth / 2 + 2), y: peekPoint.y });
    await expect(page.locator('body > .card-drag-layer')).toHaveCount(1);
    await expect(peekedCard).not.toHaveClass(/card-peeking/);

    const targetBounds = await target.boundingBox();
    await touch({
      x: targetBounds.x + targetBounds.width / 2,
      y: targetBounds.y + targetBounds.height / 3,
    });
    await expect(app.locator('.card-peeking')).toHaveCount(0);
    await touch(null);
    await expect(app.locator('[aria-label="Pile 2"] [data-key="card-5"]')).toHaveClass(/card-moved/);
    await expect(app.locator('[aria-label="Pile 2"] [data-key="card-17"]')).toHaveClass(/card-moved/);
    await expect(source.locator('[data-key="card-5"]')).toHaveCount(0);
    await expect(app.locator('.game-status')).toContainText('Moved 6♠ and 1 more card');
  });
  }
});

test('dragging a valid card moves it to a legal pile and animates the move', async ({ page }) => {
  const app = await restoreGame(page, savedKlondike({ columns: [[[13, 0]]] }));
  const settings = await openSettings(app);
  await settings.getByRole('radio', { name: 'Card faces: Ornate', exact: true }).click();
  await settings.getByRole('radio', { name: 'Card backs: Orbit', exact: true }).click();
  await settings.getByRole('button', { name: 'Close settings' }).click();
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
  await expect(dragLayer).toHaveAttribute('data-card-face-style', 'ornate');
  await expect(dragLayer).toHaveAttribute('data-card-back-style', 'orbit');
  await expect(floatingCard.locator('.card-face-art')).toHaveCount(1);
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
  const details = await celebration.evaluate(layer => {
    const particles = layer.querySelector('canvas');
    return {
      faces: layer.querySelectorAll('.game-layer-card .card-face-art').length,
      cards: layer.querySelectorAll('.game-layer-card.card-firework').length,
      effect: particles.dataset.particleEffect,
      bursts: particles.dataset.particleBursts,
      duration: Number(particles.dataset.particleDuration),
      position: getComputedStyle(layer).position,
      zIndex: getComputedStyle(layer).zIndex,
      pointerEvents: getComputedStyle(layer).pointerEvents,
      parent: layer.parentElement?.tagName,
      randomCalls: window.celebrationRandomCalls,
    };
  });
  expect(details).toMatchObject({
    faces: 52, cards: 52, effect: 'fireworks', bursts: '8',
    position: 'fixed', zIndex: '2147483646', pointerEvents: 'none', parent: 'BODY', randomCalls: 1,
  });
  expect(details.duration).toBeGreaterThan(5500);
  await app.getByRole('button', { name: 'Undo', exact: true }).click();
  await app.locator('[data-key="card-12"]').dblclick();
  await expect(table).toHaveAttribute('data-win-celebration', 'bounce');
  await expect.poll(() => page.evaluate(() => window.celebrationRandomCalls)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('game-center-solitaire-celebrations-v1'))))
    .toEqual(['fireworks', 'bounce']);
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
  for (const [randomValue, effect] of [[0.2, 'bounce'], [0.2, 'spiral']]) {
    const app = await restoreGame(page, winningDeal);
    await page.evaluate(value => { Math.random = () => value; }, randomValue);
    await app.locator('[data-key="card-12"]').dblclick();
    const layer = page.locator('body > .solitaire-celebration-layer');
    await expect(layer).toHaveCount(1);
    await expect(layer.locator(`.game-layer-card.win-${effect}`)).toHaveCount(52);
    await expect(app.locator('.solitaire-table .win-bounce, .solitaire-table .win-spiral')).toHaveCount(0);
    if (effect === 'spiral') {
      const details = await layer.locator('.win-spiral').evaluateAll(elements => elements.slice(0, 4).map(card => {
        const frames = card.getAnimations()[0].effect.getKeyframes();
        const layer = card.closest('.solitaire-celebration-layer');
        const width = parseFloat(card.style.width);
        const height = parseFloat(card.style.height);
        const startX = parseFloat(card.style.left) + width / 2;
        const startY = parseFloat(card.style.top) + height / 2;
        const centerX = parseFloat(layer.style.width) / 2;
        const centerY = parseFloat(layer.style.height) / 2;
        const positions = frames.slice(1).map(frame => {
          const matrix = new DOMMatrixReadOnly(frame.transform);
          return { x: startX + matrix.m41 - centerX, y: startY + matrix.m42 - centerY };
        });
        const angles = positions.map(point => Math.atan2(point.y, point.x));
        const deltas = angles.slice(1).map((angle, index) => {
          const delta = angle - angles[index];
          return Math.atan2(Math.sin(delta), Math.cos(delta));
        });
        return {
          direction: card.dataset.spiralFirstTurn,
          firstRotation: deltas.slice(0, 32).reduce((sum, delta) => sum + delta, 0),
          secondRotation: deltas.slice(32).reduce((sum, delta) => sum + delta, 0),
          finalOpacity: Number(frames.at(-1).opacity),
          finalRadius: Math.hypot(positions.at(-1).x, positions.at(-1).y),
          exitRadius: Math.hypot(centerX, centerY) + Math.hypot(width, height) / 2,
        };
      }));
      expect(new Set(details.map(card => card.direction)).size).toBe(1);
      for (const card of details) {
        const sign = card.direction === 'clockwise' ? 1 : -1;
        expect(card.firstRotation).toBeCloseTo(sign * Math.PI * 2, 3);
        expect(card.secondRotation).toBeCloseTo(-sign * Math.PI * 2, 3);
        expect(card.finalOpacity).toBeCloseTo(0, 8);
        expect(card.finalRadius).toBeGreaterThan(card.exitRadius);
      }
    }
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
    if (effect === 'wave') {
      const particles = layer.locator('canvas[data-particle-effect="splash"]');
      await expect(particles).toHaveAttribute('data-particle-bursts', '7');
    }
    if (effect === 'tornado') {
      const particles = layer.locator('canvas[data-particle-effect="streaks"]');
      expect(Number(await particles.getAttribute('data-particle-duration'))).toBeGreaterThan(4000);
    }
    if (effect === 'rain') {
      const before = await cards.first().textContent();
      await page.waitForTimeout(120);
      await expect.poll(() => cards.first().textContent()).not.toBe(before);
      const latestAnimationEnd = await cards.evaluateAll(elements =>
        Math.max(...elements.map(card => {
          const animation = card.getAnimations()[0];
          const schedule = animation.effect.getTiming();
          return Number(schedule.delay || 0) + Number(schedule.duration) - Number(animation.currentTime || 0);
        })));
      await page.waitForTimeout(latestAnimationEnd + 50);
      await expect(layer).toHaveCount(1);
      const boardBottom = await app.locator('.solitaire-table').evaluate(table =>
        table.getBoundingClientRect().bottom);
      const remainingCardTops = await cards.evaluateAll(elements =>
        elements.map(card => card.getBoundingClientRect().top));
      expect(remainingCardTops.every(top => top > boardBottom)).toBe(true);
      await expect(layer).toHaveCount(0, { timeout: 1000 });
      await app.getByRole('button', { name: 'Start new game' }).click();
      await page.locator('#close-btn').click();
      continue;
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

test('all card playfields keep 2rem padding on every side of the scrollable tableau', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const game of ['klondike', 'spider', 'freecell']) {
    const app = await openGame(page, game);
    const scroll = app.locator('.card-tableau-scroll');
    const padding = await scroll.evaluate(element => {
      const style = getComputedStyle(element);
      return ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`padding${side}`]);
    });
    expect(padding).toEqual(['32px', '32px', '32px', '32px']);
    await scroll.evaluate(element => { element.scrollLeft = element.scrollWidth; element.scrollTop = element.scrollHeight; });
    const spacing = await scroll.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const columns = [...element.querySelectorAll('.card-columns .card-pile')];
      const cards = [...element.querySelectorAll('.playing-card')];
      return {
        right: bounds.right - columns.at(-1).getBoundingClientRect().right,
        bottom: bounds.bottom - Math.max(...cards.map(card => card.getBoundingClientRect().bottom)),
      };
    });
    expect(spacing.right, game).toBeGreaterThanOrEqual(31);
    expect(spacing.bottom, game).toBeGreaterThanOrEqual(31);
    await page.locator('#close-btn').click();
  }
});

test('Chess, Reversi, and every Minesweeper difficulty fit and center in their available play space on resize', async ({ page }) => {
  for (const game of ['chess', 'reversi', 'minesweeper']) {
    const app = await openGame(page, game);
    const levels = game === 'minesweeper' ? ['beginner', 'intermediate', 'expert'] : [null];
    for (const level of levels) {
      if (level) await setGameOption(app, 'Difficulty', level);
      for (const viewport of [
        { width: 1280, height: 800 }, { width: 900, height: 400 },
        { width: 390, height: 844 }, { width: 600, height: 320 },
      ]) {
        await page.setViewportSize(viewport);
        const geometry = await app.evaluate(element => {
          const slot = element.querySelector('.game-board-fit').getBoundingClientRect();
          const board = element.querySelector('.mine-board-wrap, .game-board').getBoundingClientRect();
          const cell = element.querySelector('.mine-cell, .board-square').getBoundingClientRect();
          const area = element.querySelector('.game-area');
          return {
            left: board.left - slot.left, right: slot.right - board.right,
            top: board.top - slot.top, bottom: slot.bottom - board.bottom,
            width: board.width, height: board.height,
            cellWidth: cell.width, cellHeight: cell.height,
            overflowX: area.scrollWidth - area.clientWidth,
            overflowY: area.scrollHeight - area.clientHeight,
          };
        });
        const context = `${game} ${level || ''} ${JSON.stringify(viewport)} ${JSON.stringify(geometry)}`;
        for (const edge of ['left', 'right', 'top', 'bottom']) expect(geometry[edge], context).toBeGreaterThanOrEqual(-1);
        expect(Math.abs(geometry.left - geometry.right), context).toBeLessThan(2);
        expect(Math.abs(geometry.top - geometry.bottom), context).toBeLessThan(2);
        expect(Math.min(geometry.left, geometry.top), context).toBeLessThan(2);
        expect(geometry.width, context).toBeGreaterThan(40);
        expect(geometry.height, context).toBeGreaterThan(40);
        expect(Math.abs(geometry.cellWidth - geometry.cellHeight), context).toBeLessThan(1);
        expect(geometry.overflowX, context).toBeLessThanOrEqual(1);
        expect(geometry.overflowY, context).toBeLessThanOrEqual(1);
      }
    }
    await page.locator('#close-btn').click();
  }
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
  await expect(winningApp.locator('.celebration-particle-canvas')).toHaveCount(0);
  await expect(winningApp.locator('.solitaire-celebration-layer')).toHaveCount(0);
  await expect(winningApp.locator('.game-new-game-screen')).toBeVisible();
  await expect(winningApp.locator('.game-new-game-screen').getByLabel('Draw', { exact: true })).toHaveValue('1');
  expect(await page.evaluate(() => localStorage.getItem('game-center-solitaire-celebrations-v1'))).toBeNull();
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
  await app.getByRole('switch', { name: 'Flag mode' }).focus();
  await page.keyboard.press('Space');
  await expect(app.getByRole('switch', { name: 'Flag mode' })).toHaveAttribute('aria-checked', 'true');
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
  await expect(app.getByRole('switch', { name: 'Flag mode' })).toHaveAttribute('aria-checked', 'true');
});

test('Minesweeper win screen lets users change the next game difficulty', async ({ page }) => {
  const app = await restoreGame(page, savedMinesweeper(), 'minesweeper');
  await app.locator('[data-key="mine-10"]').click();
  const layer = page.locator('body > .game-celebration-layer[data-game="minesweeper"]');
  await expect(layer).toHaveAttribute('data-effect', 'fireworks');
  await expect(app.locator('.mine-cell.revealed')).toHaveCount(71);
  const screen = app.locator('.game-new-game-screen');
  await expect(screen).toBeHidden();
  await expect(screen).toBeVisible({ timeout: 8000 });
  await expect(layer).toHaveCount(0);
  await expect(screen.getByRole('heading', { name: 'Minefield cleared!' })).toBeVisible();
  await screen.getByLabel('Difficulty', { exact: true }).selectOption('intermediate');
  await screen.getByRole('button', { name: 'Start new game' }).click();
  await expect(app.locator('.mine-cell')).toHaveCount(256);
  await expect(app.getByLabel('Difficulty', { exact: true })).toHaveValue('intermediate');
});

test('Minesweeper shows the exploded board during its mine-burst celebration', async ({ page }) => {
  const app = await restoreGame(page, savedMinesweeper(), 'minesweeper');
  await app.locator('[data-key="mine-0"]').click();
  await expect(app.locator('.mine-cell.exploded')).toHaveCount(1);
  const layer = page.locator('body > .game-celebration-layer[data-game="minesweeper"]');
  await expect(layer).toHaveAttribute('data-effect', 'explosions');
  await expect(layer.locator('canvas[data-particle-effect="explosions"]')).toHaveCount(1);
  await expect(app.locator('.game-new-game-screen')).toBeVisible();
  await expect(layer).toHaveCount(0);
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
  await expect(screen).toBeVisible({ timeout: 5000 });
  await expect(screen).toContainText('Checkmate');
  await screen.getByLabel('Opponent', { exact: true }).selectOption('computer');
  await expect(screen.getByLabel('Play as', { exact: true })).toBeVisible();
  await screen.getByLabel('Play as', { exact: true }).selectOption('black');
  await screen.getByRole('button', { name: 'Start new game' }).click();
  await expect(screen).toHaveCount(0);
  await expect(app.locator('.chess-piece')).toHaveCount(32);
  await expect(app.getByLabel('Opponent', { exact: true })).toHaveValue('computer');
  await expect(app.locator('.game-status')).toContainText('Black to move', { timeout: 10000 });
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
  await expect(screen).toBeVisible({ timeout: 5000 });
  await expect(screen.getByLabel('Opponent', { exact: true })).toHaveValue('local');
  await screen.getByLabel('Opponent', { exact: true }).selectOption('computer');
  await expect(screen.getByLabel('Play as', { exact: true })).toBeVisible();
  await screen.getByLabel('Play as', { exact: true }).selectOption('white');
  await screen.getByRole('button', { name: 'Start new game' }).click();
  await expect(app.locator('.disc')).toHaveCount(5);
  await expect(app.getByLabel('Opponent', { exact: true })).toHaveValue('computer');
  await expect(app.locator('.game-status')).toContainText('White to move', { timeout: 5000 });
});

test('Chess and Reversi let computer players choose either color and save the choice', async ({ page }) => {
  const chess = await openGame(page, 'chess');
  let settings = await openSettings(chess);
  await expect(settings.getByLabel('Play as', { exact: true })).toHaveValue('white');
  await settings.getByLabel('Play as', { exact: true }).selectOption('black');
  await expect(chess.locator('.game-status')).toContainText('Black to move', { timeout: 10000 });
  let savedColor = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('desktop-session-v2'));
    return session.columns.flatMap(column => column.apps).find(app => app.type === 'chess')
      ?.state?.options?.playerColor;
  });
  expect(savedColor).toBe('black');

  settings = await openSettings(chess);
  await settings.getByLabel('Opponent', { exact: true }).selectOption('local');
  settings = await openSettings(chess);
  await expect(settings.getByLabel('Play as', { exact: true })).toBeHidden();
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await page.locator('#close-btn').click();

  const reversi = await openGame(page, 'reversi');
  settings = await openSettings(reversi);
  await settings.getByLabel('Play as', { exact: true }).selectOption('white');
  await expect(reversi.locator('.game-status')).toContainText('White to move', { timeout: 5000 });
  await expect(reversi.locator('.disc')).toHaveCount(5);
  savedColor = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('desktop-session-v2'));
    return session.columns.flatMap(column => column.apps).find(app => app.type === 'reversi')
      ?.state?.options?.playerColor;
  });
  expect(savedColor).toBe('white');
});

test('Chess and Reversi support each board-piece celebration style', async ({ page }) => {
  for (const game of ['chess', 'reversi']) {
    const app = await openGame(page, game);
    for (const effect of ['pulse', 'fade', 'fireworks', 'knock']) {
      const result = await app.evaluate(async (root, selectedEffect) => {
        const { createBoardCelebration } = await import('/apps/games/game-celebrations.js');
        const kind = root.dataset.type;
        const themeAttribute = kind === 'chess' ? 'chessPiecesTheme' : 'reversiPiecesTheme';
        root.dataset[themeAttribute] = 'glass';
        const board = root.querySelector('.game-board');
        const cleanup = createBoardCelebration(kind, board, 'white', selectedEffect);
        const layer = document.querySelector('.game-celebration-layer[data-game="' + kind + '"]');
        const sources = [...board.querySelectorAll(kind === 'chess' ? '.chess-piece' : '.disc')];
        const active = [...layer.querySelectorAll('.game-celebration-piece')];
        const count = active.length;
        const animations = active.reduce((total, piece) => total + piece.getAnimations().length, 0);
        const hiddenSources = sources.every(piece => piece.classList.contains('game-celebration-source-hidden'));
        const themeCopied = layer.classList.contains('game-app')
          && layer.dataset[themeAttribute] === 'glass';
        cleanup();
        return { effect: layer.dataset.effect, count, animations, hiddenSources, themeCopied, removed: !layer.isConnected };
      }, effect);
      expect(result).toEqual({
        effect, count: game === 'chess' ? 32 : 4, animations: expect.any(Number),
        hiddenSources: true, themeCopied: true, removed: true,
      });
      expect(result.animations).toBeGreaterThan(0);
    }
    await page.locator('#close-btn').click();
  }
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

test('Glass Reversi pieces preserve their 3D flip and finish on the new side', async ({ page }) => {
  const app = await openGame(page, 'reversi');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let dialog = await openSettings(app);
  await dialog.getByRole('radio', { name: 'Piece theme: Glass', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await setGameOption(app, 'Opponent', 'local');
  await app.locator('[data-square="d6"]').click();
  const disc = app.locator('[data-square="d5"] .disc');
  await expect(disc).toHaveClass(/disc-flipping/);
  const layers = await disc.evaluate(element => ({
    transformStyle: getComputedStyle(element).transformStyle,
    backdropFilter: getComputedStyle(element).backdropFilter,
    fillMode: getComputedStyle(element).animationFillMode,
    animationName: getComputedStyle(element).animationName,
    beforeBackface: getComputedStyle(element, '::before').backfaceVisibility,
    afterBackface: getComputedStyle(element, '::after').backfaceVisibility,
    faceBlur: getComputedStyle(element, '::after').backdropFilter,
  }));
  expect(layers).toEqual({
    transformStyle: 'preserve-3d', backdropFilter: 'none', fillMode: 'both',
    animationName: 'reversi-disc-flip', beforeBackface: 'hidden',
    afterBackface: 'hidden', faceBlur: 'blur(5px) saturate(1.2)',
  });
  await expect.poll(() => disc.evaluate(element =>
    element.getAnimations().some(animation => animation.playState === 'finished'))).toBe(true);
  expect(await disc.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m11))
    .toBeLessThan(-0.99);
  await expect(disc).toHaveClass(/white/);
  expect(await disc.evaluate(element => getComputedStyle(element, '::after').backgroundImage))
    .toContain('radial-gradient');
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
  await second.getByRole('switch', { name: 'Flag mode' }).click();
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
