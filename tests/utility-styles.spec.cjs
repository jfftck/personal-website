const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const desktopStylesheet = readFileSync(
  join(__dirname, '../artifacts/personal-website/public/desktop.css'),
  'utf8',
);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
});

async function openUtility(page, type) {
  await page.locator('#app-menu-btn').click();
  await page.locator(`#app-list .app-launcher[data-type="${type}"]`).click();
  return page.locator(`.app-window[data-type="${type}"]`).last();
}

async function expectFamilyStylesheet(page, fileName) {
  const familySheet = page.locator(`link[data-app-stylesheet][href$="/apps/${fileName}"]`);
  await expect(familySheet).toHaveCount(1);
  await expect.poll(() => familySheet.evaluate(link => Boolean(link.sheet?.cssRules?.length))).toBe(true);
  const order = await page.locator('link[rel="stylesheet"]').evaluateAll(links =>
    links.map(link => new URL(link.href).pathname.split('/').pop()),
  );
  expect(order.indexOf(fileName)).toBeGreaterThan(order.indexOf('desktop-windows.css'));
}

async function openGame(page, type) {
  await page.locator('#app-menu-btn').click();
  await page.locator('#game-center-entry').click();
  await page.locator(`#game-list [data-game="${type}"]`).click();
  return page.locator(`.app-window[data-type="${type}"]`).last();
}

async function setAppWindowWidth(app, width) {
  await app.evaluate((element, targetWidth) => {
    element.style.width = `${targetWidth}px`;
    element.style.flex = `0 0 ${targetWidth}px`;
  }, width);
  await expect.poll(() => app.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(width);
}

async function expectInsideAppWindow(app, element) {
  await expect(element).toBeVisible();
  await element.scrollIntoViewIfNeeded();
  const [appBox, elementBox] = await Promise.all([app.boundingBox(), element.boundingBox()]);
  expect(appBox).not.toBeNull();
  expect(elementBox).not.toBeNull();
  expect(elementBox.x).toBeGreaterThanOrEqual(appBox.x - 1);
  expect(elementBox.x + elementBox.width).toBeLessThanOrEqual(appBox.x + appBox.width + 1);
}

async function tapControl(page, control) {
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function expectKeyboardFocus(control) {
  await expect(control).toBeFocused();
  expect(await control.evaluate(element => element.matches(':focus-visible'))).toBe(true);
  expect(await control.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
}

async function expectNoHorizontalPageScroll(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
}

async function mockCompactViewerFiles(page) {
  await page.route('**/documents/manifest.json', route => route.fulfill({
    json: [
      { filename: '20261106_Compact_First_Document.md', url: '/files/documents/compact-list-first.md' },
      { filename: '20261106_Compact_Second_Document.md', url: '/files/documents/compact-list-second.md' },
    ],
  }));
  await page.route('**/posts/manifest.json', route => route.fulfill({ json: [] }));
  await page.route('**/files/documents/compact-list-first.md', route => route.fulfill({
    contentType: 'text/markdown',
    body: '# Compact First Document',
  }));
  await page.route('**/files/documents/compact-list-second.md', route => route.fulfill({
    contentType: 'text/markdown',
    body: '# Compact Second Document',
  }));
  await page.route('**/pictures/manifest.json', route => route.fulfill({
    json: [
      { filename: '20261106_Compact_First_Photo.svg', url: '/files/pictures/compact-list-first.svg' },
      { filename: '20261106_Compact_Second_Photo.svg', url: '/files/pictures/compact-list-second.svg' },
    ],
  }));
  await page.route('**/files/pictures/compact-list-*.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#357"/></svg>',
  }));
  await page.route('**/videos/manifest.json', route => route.fulfill({
    json: [
      { filename: '20261106_Compact_First_Video.mp4', url: '/files/videos/compact-list-first.mp4' },
      { filename: '20261106_Compact_Second_Video.mp4', url: '/files/videos/compact-list-second.mp4' },
    ],
  }));
  await page.route('**/files/videos/compact-list-*.mp4', route => route.fulfill({
    contentType: 'video/mp4',
    body: '',
  }));
}

test('Calculator selectors stay out of the desktop shell stylesheet', () => {
  expect(desktopStylesheet).not.toMatch(/\.calc(?:[-_a-zA-Z0-9]*)/);
});

test('desktop shell and window frame styles remain stable at desktop and mobile widths', async ({ page }) => {
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links =>
    links.map(link => new URL(link.href).pathname.split('/').pop()),
  );
  expect(stylesheets.indexOf('desktop.css')).toBeGreaterThanOrEqual(0);
  expect(stylesheets.indexOf('desktop-windows.css')).toBe(stylesheets.indexOf('desktop.css') + 1);

  const app = await openUtility(page, 'calculator');
  await expectFamilyStylesheet(page, 'calculator.css');
  const inspect = () => page.evaluate(() => {
    const topbar = document.querySelector('#topbar');
    const desktop = document.querySelector('#desktop');
    const stripWrapper = document.querySelector('#app-strip-wrapper');
    const strip = document.querySelector('#app-strip');
    const appWindow = document.querySelector('.app-window.focused');
    const style = element => {
      const computed = getComputedStyle(element);
      return {
        display: computed.display,
        position: computed.position,
        overflow: computed.overflow,
        borderRadius: computed.borderRadius,
        borderLeftWidth: computed.borderLeftWidth,
        outlineStyle: computed.outlineStyle,
        outlineColor: computed.outlineColor,
        backgroundColor: computed.backgroundColor,
        cursor: computed.cursor,
        transitionDuration: computed.transitionDuration,
      };
    };
    return {
      topbar: style(topbar),
      desktop: style(desktop),
      stripWrapper: style(stripWrapper),
      strip: style(strip),
      appWindow: style(appWindow),
    };
  });

  const desktopStyles = await inspect();
  expect(desktopStyles.topbar.position).toBe('fixed');
  expect(desktopStyles.topbar.display).toBe('grid');
  expect(desktopStyles.appWindow.display).toBe('flex');
  expect(desktopStyles.appWindow.borderRadius).toBe('16px');
  expect(desktopStyles.appWindow.outlineStyle).toBe('solid');
  expect(desktopStyles.appWindow.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(desktopStyles.appWindow.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileStyles = await inspect();
  expect(mobileStyles.appWindow.borderRadius).toBe('0px');
  expect(mobileStyles.appWindow.borderLeftWidth).toBe('0px');

  await app.evaluate(element => document.body.classList.add('mod-overview'));
  const overviewStyles = await inspect();
  expect(overviewStyles.desktop.overflow).toBe('visible');
  expect(overviewStyles.stripWrapper.overflow).toBe('visible');
  expect(overviewStyles.appWindow.cursor).toBe('zoom-out');
});

test('light, dark, and custom tints preserve focused window and game artwork styles', async ({ page }) => {
  const chess = await openGame(page, 'chess');
  const reversi = await openGame(page, 'reversi');
  await expect(chess.locator('.chess-board .chess-piece-svg')).toHaveCount(32);
  await expect(reversi.locator('.reversi-board .disc')).toHaveCount(4);
  await chess.evaluate(element => {
    element.dataset.chessBoardTheme = 'slate';
    element.dataset.chessPiecesTheme = 'modern';
  });
  await reversi.evaluate(element => {
    element.dataset.reversiBoardTheme = 'ocean';
    element.dataset.reversiPiecesTheme = 'amber';
  });

  const supportsRelativeColors = await page.evaluate(() =>
    CSS.supports('color', 'oklch(from #006699 calc(l + 0.1) c h)'),
  );
  const palettes = [];
  const shellSamples = new Map();
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ['dark', 'light']) {
      for (const tintMode of supportsRelativeColors ? ['system', 'custom'] : ['system']) {
        await page.evaluate(({ theme, tintMode }) => {
          const root = document.documentElement;
          root.dataset.theme = theme;
          root.removeAttribute('data-window-tints');
          root.removeAttribute('data-window-dark-tint');
          root.removeAttribute('data-window-light-tint');
          for (const property of [
            '--window-dark-lightness',
            '--window-lightness',
            '--window-background-opacity',
            '--topbar-background-opacity',
            '--topbar-custom-background',
            '--topbar-custom-foreground',
          ]) root.style.removeProperty(property);

          if (tintMode === 'system') {
            root.dataset.topbarTheme = theme;
            return;
          }
          root.dataset.windowTints = 'custom';
          root.dataset.windowDarkTint = 'teal';
          root.dataset.windowLightTint = 'gold';
          root.style.setProperty('--window-dark-lightness', '21%');
          root.style.setProperty('--window-lightness', '87%');
          root.style.setProperty('--window-background-opacity', '78%');
          root.dataset.topbarTheme = theme === 'dark' ? 'custom-dark' : 'custom-light';
          root.style.setProperty('--topbar-background-opacity', '82%');
          root.style.setProperty('--topbar-custom-background',
            theme === 'dark' ? 'oklch(22% 0.08 240)' : 'oklch(92% 0.04 240)');
          root.style.setProperty('--topbar-custom-foreground',
            theme === 'dark' ? 'oklch(88% 0.06 90)' : 'oklch(20% 0.06 240)');
        }, { theme, tintMode });

        const expectedFocus = await page.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.outlineColor = 'var(--focus-color)';
          document.body.append(probe);
          const value = getComputedStyle(probe).outlineColor;
          probe.remove();
          return value;
        });
        await expect.poll(() => page.locator('.app-window.focused').evaluate(element =>
          getComputedStyle(element).outlineColor,
        )).toBe(expectedFocus);

        for (const overview of [false, true]) {
          await page.evaluate(value => document.body.classList.toggle('mod-overview', value), overview);
          const sample = await page.evaluate(() => {
            const root = document.documentElement;
            const window = document.querySelector('.app-window.focused');
            const topbar = document.querySelector('#topbar');
            const resolve = (property, cssProperty = 'color') => {
              const probe = document.createElement('span');
              probe.style[cssProperty] = `var(${property})`;
              document.body.append(probe);
              const value = getComputedStyle(probe)[cssProperty];
              probe.remove();
              return value;
            };
            const chess = document.querySelector('.app-window[data-type="chess"]');
            const reversi = document.querySelector('.app-window[data-type="reversi"]');
            return {
              rootTheme: root.dataset.theme,
              topbarTheme: root.dataset.topbarTheme,
              windowBackground: getComputedStyle(window).backgroundColor,
              expectedWindowBackground: resolve('--app-bg', 'backgroundColor'),
              windowBorder: getComputedStyle(window).borderTopColor,
              expectedWindowBorder: resolve('--app-border', 'borderColor'),
              windowFocus: getComputedStyle(window).outlineColor,
              expectedFocus: resolve('--focus-color', 'outlineColor'),
              topbarBackground: getComputedStyle(topbar).backgroundColor,
              expectedTopbarBackground: resolve('--topbar-bg', 'backgroundColor'),
              topbarText: getComputedStyle(topbar).color,
              expectedTopbarText: resolve('--topbar-text'),
              windowRadius: getComputedStyle(window).borderRadius,
              overviewCursor: getComputedStyle(window).cursor,
              gameText: getComputedStyle(chess).color,
              expectedGameText: resolve('--app-text'),
              chessLightSquare: getComputedStyle(chess.querySelector('.board-square.light')).backgroundColor,
              chessWhitePiece: getComputedStyle(chess.querySelector('.piece-white .piece-body')).fill,
              chessBlackPiece: getComputedStyle(chess.querySelector('.piece-black .piece-body')).fill,
              reversiSquare: getComputedStyle(reversi.querySelector('.board-square')).backgroundColor,
              reversiDisc: getComputedStyle(reversi.querySelector('.disc')).backgroundImage,
            };
          });
          expect(sample.windowBackground).toBe(sample.expectedWindowBackground);
          expect(sample.windowBorder).toBe(sample.expectedWindowBorder);
          expect(sample.windowFocus).toBe(sample.expectedFocus);
          expect(sample.topbarBackground).toBe(sample.expectedTopbarBackground);
          expect(sample.topbarText).toBe(sample.expectedTopbarText);
          expect(sample.gameText).toBe(sample.expectedGameText);
          expect(sample.rootTheme).toBe(theme);
          expect(sample.topbarTheme).toBe(tintMode === 'system'
            ? theme
            : (theme === 'dark' ? 'custom-dark' : 'custom-light'));
          expect(sample.windowRadius).toBe(viewport.width <= 640 ? '0px' : '16px');
          if (overview) expect(sample.overviewCursor).toBe('zoom-out');

          const key = `${viewport.width}:${theme}:${tintMode}`;
          if (!shellSamples.has(key)) shellSamples.set(key, sample.windowBackground);
          if (sample.windowBackground !== shellSamples.get(key)) {
            throw new Error(`Window theme colors changed with overview state: ${key}`);
          }
          palettes.push({
            theme,
            tintMode,
            chessLightSquare: sample.chessLightSquare,
            chessWhitePiece: sample.chessWhitePiece,
            chessBlackPiece: sample.chessBlackPiece,
            reversiSquare: sample.reversiSquare,
            reversiDisc: sample.reversiDisc,
          });
        }
      }
    }
  }

  expect(new Set(palettes.map(palette => palette.chessLightSquare)).size).toBe(1);
  expect(new Set(palettes.map(palette => palette.chessWhitePiece)).size).toBe(1);
  expect(new Set(palettes.map(palette => palette.chessBlackPiece)).size).toBe(1);
  expect(new Set(palettes.map(palette => palette.reversiSquare)).size).toBe(1);
  expect(new Set(palettes.map(palette => palette.reversiDisc)).size).toBe(1);
  const darkSystem = shellSamples.get('1280:dark:system');
  const lightSystem = shellSamples.get('1280:light:system');
  expect(darkSystem).not.toBe(lightSystem);
  if (supportsRelativeColors) {
    expect(shellSamples.get('1280:dark:custom')).not.toBe(darkSystem);
    expect(shellSamples.get('1280:light:custom')).not.toBe(lightSystem);
  }
  await page.evaluate(() => document.body.classList.remove('mod-overview'));
});

test('scrollbars and form controls use the shared accent and button colors', async ({ page }) => {
  const colors = await page.evaluate(() => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const radio = document.createElement('input');
    radio.type = 'radio';
    const range = document.createElement('input');
    range.type = 'range';
    document.body.append(checkbox, radio, range);

    const resolveColor = property => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = `var(${property})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    };
    const result = {
      checkboxBackground: getComputedStyle(checkbox).backgroundColor,
      radioBackground: getComputedStyle(radio).backgroundColor,
      buttonHover: resolveColor('--btn-hover'),
        rangeAppearance: getComputedStyle(range).appearance,
        rangeRules: [...document.styleSheets]
          .flatMap(sheet => {
            try { return [...sheet.cssRules]; } catch { return []; }
          })
          .filter(rule => rule.selectorText?.includes('input[type="range"]:not(.settings-tint-slider)'))
          .map(rule => ({ selector: rule.selectorText, background: rule.style.getPropertyValue('background') })),
      accent: resolveColor('--accent'),
      scrollbarThumb: resolveColor('--scrollbar-thumb'),
      scrollbarTrack: resolveColor('--scrollbar-track'),
    };
    checkbox.remove();
    radio.remove();
    range.remove();
    return result;
  });

  expect(colors.checkboxBackground).toBe(colors.buttonHover);
  expect(colors.radioBackground).toBe(colors.buttonHover);
  expect(colors.rangeAppearance).toBe('none');
  expect(colors.rangeRules.some(rule => rule.selector.includes('slider-runnable-track') && rule.background === 'var(--btn-hover)')).toBe(true);
  expect(colors.rangeRules.some(rule => rule.selector.includes('slider-thumb') && rule.background === 'var(--accent)')).toBe(true);
  expect(colors.scrollbarThumb).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.scrollbarTrack).toBe('rgba(0, 0, 0, 0)');
});

test('Settings mobile sections and pages use the full app width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const settings = await openUtility(page, 'settings');
  await expect(settings.locator('.settings-layout')).toBeVisible();
  const categoryGeometry = await settings.evaluate(root => {
    const layout = root.querySelector('.settings-layout').getBoundingClientRect();
    const list = root.querySelector('.settings-page-list').getBoundingClientRect();
    const nav = root.querySelector('.settings-mobile-nav').getBoundingClientRect();
    const item = root.querySelector('.settings-mobile-item').getBoundingClientRect();
    return { root: root.getBoundingClientRect().width, layout: layout.width, list: list.width, nav: nav.width, item: item.width, navLeft: nav.left, rootLeft: root.getBoundingClientRect().left };
  });
  expect(categoryGeometry.layout).toBeGreaterThan(categoryGeometry.root * 0.95);
  expect(categoryGeometry.list).toBeGreaterThan(categoryGeometry.root * 0.95);
  expect(categoryGeometry.item).toBeGreaterThan(categoryGeometry.nav * 0.95);
  expect(Math.abs(categoryGeometry.navLeft - categoryGeometry.rootLeft)).toBeLessThan(24);

  await settings.getByRole('button', { name: 'Appearance' }).click();
  const pageGeometry = await settings.evaluate(root => {
    const main = root.querySelector('.settings-main').getBoundingClientRect();
    const page = root.querySelector('.settings-page').getBoundingClientRect();
    const card = root.querySelector('.settings-card').getBoundingClientRect();
    return { main: main.width, page: page.width, card: card.width, pageLeft: page.left, mainLeft: main.left };
  });
  expect(pageGeometry.page).toBeGreaterThan(pageGeometry.main * 0.95);
  expect(pageGeometry.card).toBeGreaterThan(pageGeometry.page * 0.8);
  expect(Math.abs(pageGeometry.pageLeft - pageGeometry.mainLeft)).toBeLessThan(1);
  await expect(settings.getByRole('button', { name: 'All settings' })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(settings.locator('.settings-sidebar')).toBeVisible();
  const desktopGeometry = await settings.evaluate(root => {
    const layout = root.querySelector('.settings-layout');
    const sidebar = root.querySelector('.settings-sidebar').getBoundingClientRect();
    const main = root.querySelector('.settings-main').getBoundingClientRect();
    return {
      layoutDisplay: getComputedStyle(layout).display,
      sidebarWidth: sidebar.width,
      mainWidth: main.width,
      mainStartsAfterSidebar: main.left >= sidebar.right,
    };
  });
  expect(desktopGeometry.layoutDisplay).toBe('grid');
  expect(desktopGeometry.sidebarWidth).toBeGreaterThan(0);
  expect(desktopGeometry.mainWidth).toBeGreaterThan(desktopGeometry.sidebarWidth);
  expect(desktopGeometry.mainStartsAfterSidebar).toBe(true);
});

test('representative app toolbars keep selected states, quiet actions, and keyboard focus at all widths', async ({ page }) => {
  await page.route('**/documents/manifest.json', route => route.fulfill({
    json: [{ filename: '20261105_Toolbar_Test.md', url: '/files/documents/toolbar-test.md' }],
  }));
  await page.route('**/posts/manifest.json', route => route.fulfill({ json: [] }));
  await page.route('**/files/documents/toolbar-test.md', route => route.fulfill({
    contentType: 'text/markdown',
    body: '# Toolbar test',
  }));
  await page.route('**/pictures/manifest.json', route => route.fulfill({
    json: [{ filename: '20261105_Toolbar_Test.svg', url: '/files/pictures/toolbar-test.svg' }],
  }));
  await page.route('**/files/pictures/toolbar-test.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#357"/></svg>',
  }));
  await page.route('**/videos/manifest.json', route => route.fulfill({ json: [] }));

  const verifyToolbarState = async (selected, quietAction, focusTarget = quietAction) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      const focusColor = await selected.evaluate(element => {
        const probe = document.createElement('span');
        probe.style.borderTop = '1px solid var(--focus-color)';
        element.parentElement.append(probe);
        const color = getComputedStyle(probe).borderTopColor;
        probe.remove();
        return color;
      });
      await expect.poll(() => selected.evaluate(element => getComputedStyle(element).borderTopColor))
        .toBe(focusColor);
      const selectedStyle = await selected.evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
      }));
      expect(selectedStyle.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(await quietAction.evaluate(element => getComputedStyle(element).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');

      await page.keyboard.press('Tab');
      await focusTarget.focus();
      const focusStyle = await focusTarget.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          visible: element.matches(':focus-visible'),
          color: style.outlineColor,
          style: style.outlineStyle,
          offset: style.outlineOffset,
        };
      });
      expect(focusStyle.visible).toBe(true);
      expect(focusStyle.color).toBe(focusColor);
      expect(focusStyle.style).toBe('solid');
      expect(focusStyle.offset).toBe('2px');
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  };

  const calculator = await openUtility(page, 'calculator');
  const mode = calculator.getByRole('combobox', { name: 'Calculator mode' });
  await mode.click();
  const modePopup = await mode.getAttribute('aria-controls');
  await page.locator(`#${modePopup}`).getByRole('option', { name: 'Scientific', exact: true }).click();
  const baseEight = calculator.locator('.calc-base-control button[data-radix="8"]');
  await baseEight.click();
  await verifyToolbarState(baseEight, calculator.getByRole('button', { name: 'Memory store' }));
  const memoryActionBorder = await calculator.getByRole('button', { name: 'Memory store' })
    .evaluate(element => getComputedStyle(element).borderTopColor);
  expect(memoryActionBorder).toBe('rgba(0, 0, 0, 0)');

  const documentViewer = await openUtility(page, 'doc-viewer');
  const documentBrowse = documentViewer.locator('.app-toolbar .tool-btn[data-action="open"]');
  await documentBrowse.click();
  await verifyToolbarState(documentBrowse, documentViewer.locator('.app-toolbar .tool-btn[data-action="zoom-in"]'));

  const imageViewer = await openUtility(page, 'img-viewer');
  const imageBrowse = imageViewer.locator('.app-toolbar .tool-btn[data-action="open"]');
  await imageBrowse.click();
  await verifyToolbarState(imageBrowse, imageViewer.locator('.app-toolbar .tool-btn[data-action="zoom-in"]'));

  const mediaPlayer = await openUtility(page, 'media-player');
  const mediaBrowse = mediaPlayer.locator('.app-toolbar .tool-btn[data-action="open"]');
  await mediaBrowse.click();
  await verifyToolbarState(mediaBrowse, mediaPlayer.locator('.app-toolbar .tool-btn[data-action="external"]'));

  const calendar = await openUtility(page, 'calendar');
  const weekView = calendar.locator('.cal-view-button[data-view="week"]');
  await weekView.click();
  await verifyToolbarState(weekView, calendar.locator('.cal-today-button'), weekView);
});

test('Wallpaper settings apply changes immediately without save or cancel actions', async ({ page }) => {
  await page.evaluate(async () => {
    const { buildSettings } = await import('/apps/settings.js');
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/apps/settings.css';
    document.head.append(stylesheet);
    await new Promise((resolve, reject) => {
      stylesheet.addEventListener('load', resolve, { once: true });
      stylesheet.addEventListener('error', reject, { once: true });
    });
    window.__wallpaperTestCalls = [];
    const ctx = {
      settings: {
        getSnapshot: () => ({ theme: 'dark' }),
        loadWallpaper: async () => ({
          files: [
            { url: '/wallpaper-one.jpg', title: 'Wallpaper One' },
            { url: '/wallpaper-two.jpg', title: 'Wallpaper Two' },
          ],
          settings: {
            selected: ['/wallpaper-one.jpg', '/wallpaper-two.jpg'],
            mode: 'random',
            rotation: 'visit',
            intervalMinutes: 60,
            transition: ['fade'],
          },
        }),
        saveWallpaper: async value => { window.__wallpaperTestCalls.push(value); },
        useDefaultWallpaper: async () => { window.__wallpaperTestCalls.push({ default: true }); },
      },
    };
    const app = buildSettings('wallpaper-test', ctx, {});
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:4rem 0 0;';
    host.append(app);
    document.body.append(host);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    app.querySelector('.settings-nav-item[data-page="wallpaper"]').click();
  });

  const wallpaperPage = page.locator('.settings-app').last();
  await expect(wallpaperPage.getByText('Eligible wallpapers')).toBeVisible();
  await expect(wallpaperPage.getByText('Selected', { exact: true })).toHaveCount(0);
  await expect(wallpaperPage.locator('.settings-nav-copy small')).toHaveCount(0);
  const selectedWallpaper = wallpaperPage.locator('.settings-wallpaper-tile:has(input:checked)');
  await expect(selectedWallpaper.first().locator('input')).toBeChecked();
  const selectedMode = wallpaperPage.locator('.settings-choice-option[aria-pressed="true"]').first();
  const selectedStyles = await selectedMode.evaluate(button => ({
    borderColor: getComputedStyle(button).borderTopColor,
    radioBorderColor: getComputedStyle(button.querySelector('.settings-choice-radio')).borderTopColor,
    checkboxAccentColor: getComputedStyle(document.querySelector('.settings-wallpaper-tile input')).accentColor,
    focusColor: (() => {
      const probe = document.createElement('span');
      probe.style.borderTop = '1px solid var(--focus-color)';
      button.append(probe);
      const color = getComputedStyle(probe).borderTopColor;
      probe.remove();
      return color;
    })(),
  }));
  expect(selectedStyles.borderColor).toBe(selectedStyles.focusColor);
  expect(selectedStyles.radioBorderColor).toBe(selectedStyles.focusColor);
  expect(selectedStyles.checkboxAccentColor).toBe(selectedStyles.focusColor);
  await expect(wallpaperPage.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await expect(wallpaperPage.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(wallpaperPage.locator('.settings-subheading')).toHaveCount(0);

  const transitionMargin = await wallpaperPage.locator('.settings-wallpaper-transition').evaluate(element =>
    Number.parseFloat(getComputedStyle(element).marginTop),
  );
  expect(transitionMargin).toBeGreaterThan(0);
  const transitionPicker = wallpaperPage.getByRole('button', { name: /Wallpaper transition/ });
  await transitionPicker.evaluate(button => button.click());
  const transitionPanel = wallpaperPage.getByRole('dialog', { name: 'Wallpaper transition options' });
  await expect(transitionPanel).toBeVisible();
  await expect.poll(() => transitionPanel.evaluate(drawer =>
    Math.abs(drawer.getBoundingClientRect().right - drawer.closest('.settings-app').getBoundingClientRect().right),
  )).toBeLessThan(2);
  await transitionPanel.getByRole('checkbox', { name: 'Zoom' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => window.__wallpaperTestCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.__wallpaperTestCalls[0].transition)).toEqual(['fade', 'zoom']);

  await transitionPanel.getByRole('checkbox', { name: 'No animation' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => window.__wallpaperTestCalls.length)).toBe(2);
  expect(await page.evaluate(() => window.__wallpaperTestCalls[1].transition)).toEqual([]);
  await transitionPanel.getByRole('button', { name: 'Done' }).click();
  await expect(wallpaperPage.getByRole('status')).toContainText('applied');

  let timerOption = wallpaperPage.locator('.settings-timer-option');
  await expect(timerOption).toBeVisible();
  await timerOption.getByRole('button', { name: /On a timer/ }).click();
  timerOption = wallpaperPage.locator('.settings-timer-option');
  const intervalTrigger = timerOption.getByRole('combobox', { name: 'Wallpaper change interval' });
  await expect(intervalTrigger).toBeEnabled();
  const timerLayout = await timerOption.evaluate(row => {
    const rowRect = row.getBoundingClientRect();
    const textRect = row.querySelector('.settings-timer-choice .settings-choice-copy').getBoundingClientRect();
    const selectRect = row.querySelector('.standard-select-trigger').getBoundingClientRect();
    return { rowRight: rowRect.right, textRight: textRect.right, selectLeft: selectRect.left, selectRight: selectRect.right };
  });
  expect(timerLayout.selectLeft).toBeGreaterThan(timerLayout.textRight);
  expect(timerLayout.selectRight).toBeLessThanOrEqual(timerLayout.rowRight);

  await intervalTrigger.click();
  const intervalOptions = page.getByRole('listbox', { name: 'Wallpaper change interval' });
  await expect(intervalOptions.getByRole('option')).toHaveText([
    '1 minute', '5 minutes', '15 minutes', '30 minutes', '1 hour', '6 hours', '1 day',
  ]);
  await intervalOptions.getByRole('option', { name: '6 hours' }).click();
  await expect.poll(() => page.evaluate(() => window.__wallpaperTestCalls.length)).toBe(4);
  expect(await page.evaluate(() => window.__wallpaperTestCalls[3].intervalMinutes)).toBe(360);
  await expect(wallpaperPage.locator('.settings-timer-option .standard-select-trigger')).toHaveText('6 hours');

  await page.setViewportSize({ width: 390, height: 844 });
  await wallpaperPage.locator('.settings-mobile-item[data-page="wallpaper"]').click();
  await expect(wallpaperPage.locator('.settings-timer-option')).toBeVisible();
  const mobileTimerLayout = await wallpaperPage.locator('.settings-timer-option').evaluate(row => {
    const rowRect = row.getBoundingClientRect();
    const textRect = row.querySelector('.settings-timer-choice .settings-choice-copy').getBoundingClientRect();
    const selectRect = row.querySelector('.standard-select-trigger').getBoundingClientRect();
    return { rowRight: rowRect.right, textRight: textRect.right, selectLeft: selectRect.left, selectRight: selectRect.right };
  });
  expect(mobileTimerLayout.selectLeft).toBeGreaterThan(mobileTimerLayout.textRight);
  expect(mobileTimerLayout.selectRight).toBeLessThanOrEqual(mobileTimerLayout.rowRight);
});

test('animation settings use the picker labels without duplicate card headings', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  const animationCard = settings.locator('.settings-animations-card');
  await expect(settings.locator('.settings-appearance-card .settings-card-eyebrow')).toHaveText('WINDOW');
  await expect(animationCard.locator('.settings-card-eyebrow')).toHaveText('WINDOW');
  await expect(animationCard.getByRole('heading', { name: 'Animations', exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: /Opening windows/ })).toBeVisible();
  await expect(settings.getByRole('button', { name: /Closing windows/ })).toBeVisible();
  await expect(settings.locator('.settings-animation-row h3')).toHaveCount(0);
});

test('accent color choices are browser-gated, persist, and retain readable contrast', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  const supports = await page.evaluate(() =>
    CSS.supports('color', 'oklch(from #006699 calc(l + 0.1) c h)'),
  );

  if (!supports) {
    await expect(settings.getByText(/require a browser that supports CSS relative colors/i)).toBeVisible();
    await expect(settings.locator('.settings-accent-choice')).toHaveCount(0);
    return;
  }

  const colors = settings.locator('.settings-accent-choice');
  await expect(colors).toHaveCount(6);
  await expect(settings.getByRole('button', { name: 'Blue, default' })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: 'Purple', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await settings.locator('.settings-theme-choice[data-theme="dark"]').click();
  await expect(settings.getByText('Selected', { exact: true })).toHaveCount(0);
  const focusColor = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.borderColor = 'var(--focus-color)';
    document.body.append(probe);
    const color = getComputedStyle(probe).borderTopColor;
    probe.remove();
    return color;
  });
  expect(await settings.locator('.settings-nav-item.is-active').evaluate(element => getComputedStyle(element).borderTopColor)).toBe(focusColor);
  const selectionStyles = await settings.evaluate(root => {
    const wallpaper = document.createElement('label');
    wallpaper.className = 'settings-wallpaper-tile';
    const checked = document.createElement('input');
    checked.type = 'checkbox';
    checked.checked = true;
    wallpaper.append(checked);
    root.querySelector('.settings-main').append(wallpaper);
    const selections = [
      ...root.querySelectorAll('.settings-theme-choice[aria-pressed="true"], .settings-accent-choice[aria-pressed="true"], .settings-tint-choice[aria-pressed="true"]'),
      wallpaper,
    ];
    return selections.map(element => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderTopColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
  });
  expect(selectionStyles.length).toBeGreaterThan(4);
  for (const selectionStyle of selectionStyles) {
    expect(selectionStyle.borderColor).toBe(focusColor);
    expect(selectionStyle.outlineStyle).toBe('none');
    expect(selectionStyle.outlineWidth).toBe('0px');
  }
  const selectedAccent = settings.locator('.settings-accent-choice[aria-pressed="true"]');
  await selectedAccent.focus();
  await page.keyboard.press('ArrowDown');
  const keyboardFocusStyle = await selectedAccent.evaluate(element => {
    const style = getComputedStyle(element);
    return { matches: element.matches(':focus-visible'), color: style.outlineColor, width: style.outlineWidth };
  });
  expect(keyboardFocusStyle.matches).toBe(true);
  expect(keyboardFocusStyle.color).toBe(focusColor);
  expect(keyboardFocusStyle.width).toBe('2px');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accentColor)).toBe('purple');
  expect(await page.evaluate(() => localStorage.getItem('desktop-accent-color'))).toBe('purple');
  const purpleSurface = await settings.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--util-surface-strong').trim(),
  );
  await settings.getByRole('button', { name: 'Blue, default' }).click();
  const blueSurface = await settings.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--util-surface-strong').trim(),
  );
  expect(purpleSurface).not.toBe(blueSurface);
  await settings.getByRole('button', { name: 'Purple', exact: true }).click();

  const contrasts = await page.evaluate(() => {
    const root = document.documentElement;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const names = ['blue', 'teal', 'green', 'gold', 'coral', 'purple'];
    const luminance = color => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data.slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    return names.map(name => {
      root.dataset.accentColor = name;
      const ratio = 1.05 / (luminance(getComputedStyle(root).getPropertyValue('--accent')) + 0.05);
      return { name, ratio };
    });
  });
  for (const color of contrasts) expect(color.ratio, `${color.name} with white text`).toBeGreaterThanOrEqual(4.5);

  await page.reload();
  await page.locator('#welcome-win-close').evaluate(button => button.click());
  const restoredSettings = await openUtility(page, 'settings');
  await expect(restoredSettings.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.accentColor)).toBe('purple');
});

test('window tints reverse with appearance, support keyboard lightness, and keep contrast', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  const supports = await page.evaluate(() =>
    CSS.supports('color', 'oklch(from #006699 calc(l + 0.1) c h)'),
  );
  const tintKey = 'desktop-window-tints-v3';

  if (!supports) {
    await expect(settings.getByText(/window tint choices require a browser/i)).toBeVisible();
    await expect(settings.locator('.settings-tint-choice')).toHaveCount(0);
    return;
  }

  expect(await page.evaluate(key => localStorage.getItem(key), tintKey)).toBeNull();
  const darkTintGroup = settings.getByRole('group', { name: 'Dark window tint' });
  await expect(darkTintGroup.getByRole('button')).toHaveCount(7);
  const tintHeaderStyle = await settings.locator('.settings-tint-group h4').first().evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight };
  });
  const sliderLabelStyles = await settings.locator('.settings-tint-lightness-heading label').evaluateAll(labels =>
    labels.map(element => {
      const style = getComputedStyle(element);
      return { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight };
    }),
  );
  expect(sliderLabelStyles).toHaveLength(8);
  for (const labelStyle of sliderLabelStyles) expect(labelStyle).toEqual(tintHeaderStyle);
  await expect(darkTintGroup.getByRole('button', { name: 'None dark tint' })).toHaveAttribute('aria-pressed', 'false');
  let darkLightness = settings.getByRole('slider', { name: 'Dark tint lightness' });
  await expect(darkLightness).toHaveValue('25');
  await expect(darkLightness).toHaveAttribute('min', '5');
  await expect(darkLightness).toHaveAttribute('max', '25');
  await darkTintGroup.getByRole('button', { name: 'None dark tint' }).click();
  darkLightness = settings.getByRole('slider', { name: 'Dark tint lightness' });
  await expect(darkLightness).toHaveValue('0');
  await expect(darkLightness).toHaveAttribute('min', '0');
  await expect(darkLightness).toHaveAttribute('max', '25');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--window-dark-tint-color').trim())).toBe('oklch(0% 0 0)');
  await darkTintGroup.getByRole('button', { name: 'Teal dark tint' }).click();
  darkLightness = settings.getByRole('slider', { name: 'Dark tint lightness' });
  await expect(darkLightness).toHaveValue('5');
  await expect(darkLightness).toHaveAttribute('min', '5');
  await darkLightness.focus();
  await page.keyboard.press('ArrowRight');
  darkLightness = settings.getByRole('slider', { name: 'Dark tint lightness' });
  await expect(darkLightness).toHaveValue('6');

  const lightTintGroup = settings.getByRole('group', { name: 'Light window tint' });
  await expect(lightTintGroup.getByRole('button')).toHaveCount(7);
  await expect(lightTintGroup.getByRole('button', { name: 'None light tint' })).toHaveAttribute('aria-pressed', 'true');
  let lightness = settings.getByRole('slider', { name: 'Light tint lightness' });
  await expect(lightness).toHaveValue('100');
  await expect(lightness).toHaveAttribute('max', '100');

  await lightTintGroup.getByRole('button', { name: 'Purple light tint' }).click();
  lightness = settings.getByRole('slider', { name: 'Light tint lightness' });
  await expect(lightness).toHaveValue('95');
  await expect(lightness).toHaveAttribute('max', '95');
  await lightness.focus();
  await page.keyboard.press('Home');
  lightness = settings.getByRole('slider', { name: 'Light tint lightness' });
  await expect(lightness).toHaveValue('75');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), tintKey)).toEqual({
    darkTint: 'teal',
    darkLightness: 6,
    lightTint: 'purple',
    lightLightness: 75,
    backgroundOpacity: 92,
    topbar: {
      mode: 'matching-window',
      backgroundOpacity: null,
      darkBackground: { tint: 'blue', lightness: 25 },
      darkForeground: { tint: 'none', lightness: 100 },
      lightBackground: { tint: 'none', lightness: 100 },
      lightForeground: { tint: 'blue', lightness: 25 },
    },
  });
  await expect.poll(() => lightness.evaluate(input =>
    input.matches(':focus') && input.getRootNode().host === document.activeElement,
  )).toBe(true);
  await lightness.scrollIntoViewIfNeeded();
  await lightness.focus();
  const desktopScroller = settings.locator('.settings-main');
  await desktopScroller.evaluate(element => {
    element.scrollTop = Math.min(element.scrollHeight - element.clientHeight, Math.max(element.scrollTop, 160));
  });
  const desktopScrollBefore = await desktopScroller.evaluate(element => element.scrollTop);
  expect(desktopScrollBefore).toBeGreaterThan(0);
  await page.keyboard.press('ArrowRight');
  await expect(lightness).toHaveValue('76');
  const desktopScrollAfter = await desktopScroller.evaluate(element => element.scrollTop);
  expect(Math.abs(desktopScrollAfter - desktopScrollBefore)).toBeLessThanOrEqual(1);

  await settings.locator('.settings-theme-choice[data-theme="dark"]').click();
  const darkMapping = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      background: style.getPropertyValue('--window-background-tint').trim(),
      dark: style.getPropertyValue('--window-dark-tint-color').trim(),
      foreground: style.getPropertyValue('--window-foreground-tint').trim(),
      light: style.getPropertyValue('--window-light-tint-color').trim(),
    };
  });
  expect(darkMapping.background).toBe(darkMapping.dark);
  expect(darkMapping.foreground).toBe(darkMapping.light);

  await settings.locator('.settings-theme-choice[data-theme="light"]').click();
  const lightMapping = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      background: style.getPropertyValue('--window-background-tint').trim(),
      dark: style.getPropertyValue('--window-dark-tint-color').trim(),
      foreground: style.getPropertyValue('--window-foreground-tint').trim(),
      appText: style.getPropertyValue('--app-text').trim(),
      light: style.getPropertyValue('--window-light-tint-color').trim(),
    };
  });
  expect(lightMapping.background).toBe(lightMapping.light);
  expect(lightMapping.foreground).toBe(lightMapping.dark);
  expect(lightMapping.appText).toBe(lightMapping.dark);

  const minimumContrast = await page.evaluate(() => {
    const root = document.documentElement;
    const context = document.createElement('canvas').getContext('2d');
    const names = ['blue', 'teal', 'green', 'gold', 'coral', 'purple'];
    const darkNames = ['none', ...names];
    const lightNames = ['none', ...names];
    const luminance = (color, backdrop) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const pixels = context.getImageData(0, 0, 1, 1).data;
      const alpha = pixels[3] / 255;
      const rgb = [0, 1, 2].map(index => (pixels[index] / 255) * alpha + backdrop * (1 - alpha));
      const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    let minimum = Infinity;
    for (const darkTint of darkNames) {
      root.dataset.theme = 'dark';
      root.dataset.windowTints = 'custom';
      root.dataset.windowDarkTint = darkTint;
      root.style.setProperty('--window-dark-lightness', '25%');
      for (const lightTint of lightNames) {
        root.dataset.windowLightTint = lightTint;
        root.style.setProperty('--window-lightness', '75%');
        const style = getComputedStyle(root);
        const darkBackground = luminance(style.getPropertyValue('--app-bg'), 1);
        const lightForeground = luminance(style.getPropertyValue('--app-text'), 0);
        minimum = Math.min(minimum, (lightForeground + 0.05) / (darkBackground + 0.05));

        root.dataset.theme = 'light';
        const lightStyle = getComputedStyle(root);
        const lightBackground = luminance(lightStyle.getPropertyValue('--app-bg'), 0);
        const darkForeground = luminance(lightStyle.getPropertyValue('--app-text'), 1);
        minimum = Math.min(minimum, (lightBackground + 0.05) / (darkForeground + 0.05));
        root.dataset.theme = 'dark';
      }
    }
    return minimum;
  });
  expect(minimumContrast).toBeGreaterThanOrEqual(4.5);

  await page.reload();
  await page.locator('#welcome-win-close').click();
  const restoredSettings = await openUtility(page, 'settings');
  await expect(restoredSettings.getByRole('group', { name: 'Dark window tint' }).getByRole('button', { name: 'Teal dark tint' })).toHaveAttribute('aria-pressed', 'true');
  await expect(restoredSettings.getByRole('group', { name: 'Light window tint' }).getByRole('button', { name: 'Purple light tint' })).toHaveAttribute('aria-pressed', 'true');
  await expect(restoredSettings.getByRole('slider', { name: 'Dark tint lightness' })).toHaveValue('6');
  await expect(restoredSettings.getByRole('slider', { name: 'Light tint lightness' })).toHaveValue('76');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

  await page.setViewportSize({ width: 390, height: 844 });
  await restoredSettings.getByRole('button', { name: 'Appearance' }).click();
  await restoredSettings.getByRole('group', { name: 'Dark window tint' }).getByRole('button', { name: 'None dark tint' }).click();
  darkLightness = restoredSettings.getByRole('slider', { name: 'Dark tint lightness' });
  await expect(darkLightness).toHaveValue('0');
  await expect(darkLightness).toHaveAttribute('min', '0');
  await darkLightness.focus();
  await page.keyboard.press('End');
  darkLightness = restoredSettings.getByRole('slider', { name: 'Dark tint lightness' });
  await expect(darkLightness).toHaveValue('25');
  await expect(darkLightness).toHaveAttribute('max', '25');
  const noneOption = restoredSettings.getByRole('group', { name: 'Light window tint' }).getByRole('button', { name: 'None light tint' });
  await noneOption.click();
  lightness = restoredSettings.getByRole('slider', { name: 'Light tint lightness' });
  await expect(lightness).toHaveValue('100');
  await expect(lightness).toHaveAttribute('max', '100');
  const mobilePage = restoredSettings.locator('.settings-page');
  await lightness.scrollIntoViewIfNeeded();
  await mobilePage.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await lightness.scrollIntoViewIfNeeded();
  const scrollBeforeDrag = await mobilePage.evaluate(element => element.scrollTop);
  expect(scrollBeforeDrag).toBeGreaterThan(0);
  const sliderBox = await lightness.boundingBox();
  const sliderY = sliderBox.y + sliderBox.height / 2;
  await page.mouse.move(sliderBox.x + sliderBox.width - 8, sliderY);
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + 8, sliderY, { steps: 6 });
  await page.mouse.up();
  await expect(lightness).toHaveValue('75');
  const scrollAfterDrag = await mobilePage.evaluate(element => element.scrollTop);
  expect(Math.abs(scrollAfterDrag - scrollBeforeDrag)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), tintKey)).toEqual({
    darkTint: 'none',
    darkLightness: 25,
    lightTint: 'none',
    lightLightness: 75,
    backgroundOpacity: 92,
    topbar: {
      mode: 'matching-window',
      backgroundOpacity: null,
      darkBackground: { tint: 'blue', lightness: 25 },
      darkForeground: { tint: 'none', lightness: 100 },
      lightBackground: { tint: 'none', lightness: 100 },
      lightForeground: { tint: 'blue', lightness: 25 },
    },
  });
  const resetTints = restoredSettings.getByRole('button', { name: 'Reset to defaults' });
  await expect(resetTints).toBeEnabled();
  await resetTints.click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), tintKey)).toEqual({
    darkTint: 'blue',
    darkLightness: 25,
    lightTint: 'none',
    lightLightness: 100,
    backgroundOpacity: 92,
    topbar: {
      mode: 'matching-window',
      backgroundOpacity: null,
      darkBackground: { tint: 'blue', lightness: 25 },
      darkForeground: { tint: 'none', lightness: 100 },
      lightBackground: { tint: 'none', lightness: 100 },
      lightForeground: { tint: 'blue', lightness: 25 },
    },
  });
  await expect(restoredSettings.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
});

test('tint sliders debounce live previews and save the settled value', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  const lightness = settings.getByRole('slider', { name: 'Light tint lightness' });
  await page.evaluate(() => {
    const root = document.documentElement;
    const style = root.style;
    const stylePrototype = Object.getPrototypeOf(style);
    window.tintSetPropertyOriginal = stylePrototype.setProperty;
    window.tintSetPropertyTarget = style;
    window.tintStyleWrites = 0;
    stylePrototype.setProperty = function(name, value, priority) {
      if (this === window.tintSetPropertyTarget && name === '--window-lightness') window.tintStyleWrites += 1;
      return window.tintSetPropertyOriginal.call(this, name, value, priority);
    };
  });
  await lightness.evaluate(slider => {
    for (const value of ['93', '88', '84']) {
      slider.value = value;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await expect.poll(() => page.evaluate(() => window.tintStyleWrites)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('desktop-window-tints-v3'))).toBeNull();
  await lightness.evaluate(slider => slider.dispatchEvent(new Event('change', { bubbles: true })));
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'desktop-window-tints-v3')).toEqual({
    darkTint: 'blue',
    darkLightness: 25,
    lightTint: 'none',
    lightLightness: 84,
    backgroundOpacity: 92,
    topbar: {
      mode: 'matching-window',
      backgroundOpacity: null,
      darkBackground: { tint: 'blue', lightness: 25 },
      darkForeground: { tint: 'none', lightness: 100 },
      lightBackground: { tint: 'none', lightness: 100 },
      lightForeground: { tint: 'blue', lightness: 25 },
    },
  });
  await expect.poll(() => page.evaluate(() => window.tintStyleWrites)).toBe(2);
  await page.evaluate(() => {
    Object.getPrototypeOf(window.tintSetPropertyTarget).setProperty = window.tintSetPropertyOriginal;
  });
});

test('window background opacity previews, persists after interaction, and resets', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  const supports = await page.evaluate(() =>
    CSS.supports('color', 'oklch(from #006699 calc(l + 0.1) c h)'),
  );
  if (!supports) return;

  const key = 'desktop-window-tints-v3';
  const opacity = settings.getByRole('slider', { name: 'Window background opacity' });
  await expect(opacity).toHaveValue('92');
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBeNull();

  await opacity.focus();
  await page.keyboard.press('Home');
  const focusTreatment = await opacity.evaluate(slider => ({
    inputOutline: getComputedStyle(slider).outlineStyle,
    thumbStyles: slider.getRootNode().host.shadowRoot.querySelector('style').textContent,
  }));
  expect(focusTreatment.inputOutline).toBe('none');
  expect(focusTreatment.thumbStyles).toContain(':focus-visible::-webkit-slider-thumb');
  expect(focusTreatment.thumbStyles).toContain('var(--focus-color)');
  await expect(opacity).toHaveValue('0');
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--window-background-opacity').trim(),
  )).toBe('0%');
  await expect.poll(() => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key))
    .toMatchObject({ backgroundOpacity: 0 });

  await settings.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(settings.getByRole('slider', { name: 'Window background opacity' })).toHaveValue('92');
  await expect.poll(() => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key))
    .toEqual({
      darkTint: 'blue',
      darkLightness: 25,
      lightTint: 'none',
      lightLightness: 100,
      backgroundOpacity: 92,
      topbar: {
        mode: 'matching-window',
        backgroundOpacity: null,
        darkBackground: { tint: 'blue', lightness: 25 },
        darkForeground: { tint: 'none', lightness: 100 },
        lightBackground: { tint: 'none', lightness: 100 },
        lightForeground: { tint: 'blue', lightness: 25 },
      },
    });
});

test('top bar tinting follows or overrides the window theme and exposes role-specific custom ranges', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  await expect(settings.locator('.settings-appearance-card > .settings-card-eyebrow')).toHaveText('SYSTEM');
  await expect(settings.locator('.settings-animations-card > .settings-card-eyebrow')).toHaveText('WINDOW');
  const supports = await page.evaluate(() =>
    CSS.supports('color', 'oklch(from #006699 calc(l + 0.1) c h)'),
  );
  if (!supports) return;

  await settings.locator('.settings-theme-choice[data-theme="light"]').click();
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-topbar-theme', 'light');
  const topbarOpacity = settings.getByRole('slider', { name: 'Top bar background opacity' });
  await expect(topbarOpacity).toBeVisible();
  await expect(topbarOpacity).toHaveValue('82');
  const resetIsAfterTopbar = await settings.locator('.settings-window-tints').evaluate(section => {
    const children = [...section.children];
    const topbar = section.querySelector('.settings-topbar-tints');
    const reset = section.querySelector('.settings-tint-reset');
    return Boolean(topbar && reset?.closest('app-button')
      && children.at(-2) === topbar
      && children.at(-1) === reset.closest('app-button'));
  });
  expect(resetIsAfterTopbar).toBe(true);
  await topbarOpacity.focus();
  await page.keyboard.press('Home');
  await expect(settings.getByRole('slider', { name: 'Top bar background opacity' })).toHaveValue('0');
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--topbar-background-opacity').trim(),
  )).toBe('0%');
  await expect.poll(() => page.evaluate(key =>
    JSON.parse(localStorage.getItem(key))?.topbar?.backgroundOpacity, 'desktop-window-tints-v3',
  )).toBe(0);

  const mode = settings.getByRole('combobox', { name: 'Top bar appearance' });
  await mode.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(mode).toHaveAttribute('aria-expanded', 'false');
  await expect(root).toHaveAttribute('data-topbar-theme', 'dark');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key))?.topbar?.mode, 'desktop-window-tints-v3'))
    .toBe('reverse-window');
  await settings.locator('.settings-theme-choice[data-theme="dark"]').click();
  await expect(root).toHaveAttribute('data-topbar-theme', 'light');
  await settings.locator('.settings-theme-choice[data-theme="light"]').click();
  await expect(root).toHaveAttribute('data-topbar-theme', 'dark');

  await settings.getByRole('combobox', { name: 'Top bar appearance' }).click();
  await page.getByRole('option', { name: 'Light', exact: true }).click();
  await expect(root).toHaveAttribute('data-topbar-theme', 'light');
  await settings.getByRole('combobox', { name: 'Top bar appearance' }).click();
  await page.getByRole('option', { name: 'Dark', exact: true }).click();
  await expect(root).toHaveAttribute('data-topbar-theme', 'dark');
  await settings.getByRole('combobox', { name: 'Top bar appearance' }).click();
  await page.getByRole('option', { name: 'Custom Dark' }).click();
  await expect(root).toHaveAttribute('data-topbar-theme', 'custom-dark');
  await expect(settings.getByRole('slider', { name: 'Background lightness' })).toHaveAttribute('min', '5');
  await expect(settings.getByRole('slider', { name: 'Background lightness' })).toHaveAttribute('max', '25');
  await expect(settings.getByRole('slider', { name: 'Foreground lightness' })).toHaveAttribute('min', '75');
  await expect(settings.getByRole('slider', { name: 'Foreground lightness' })).toHaveAttribute('max', '100');
  await settings.getByRole('group', { name: 'Light top bar foreground tint' })
    .getByRole('button', { name: 'Purple Light top bar foreground tint' }).click();
  await expect(settings.getByRole('slider', { name: 'Foreground lightness' })).toHaveAttribute('max', '95');
  await settings.getByRole('group', { name: 'Dark top bar background tint' })
    .getByRole('button', { name: 'None Dark top bar background tint' }).click();
  await expect(settings.getByRole('slider', { name: 'Background lightness' })).toHaveAttribute('min', '0');

  await settings.getByRole('combobox', { name: 'Top bar appearance' }).click();
  await page.getByRole('option', { name: 'Custom Light' }).click();
  await expect(root).toHaveAttribute('data-topbar-theme', 'custom-light');
  await expect(settings.getByRole('slider', { name: 'Top bar background opacity' })).toBeVisible();
  await expect(settings.getByRole('slider', { name: 'Background lightness' })).toHaveAttribute('min', '75');
  await expect(settings.getByRole('slider', { name: 'Background lightness' })).toHaveAttribute('max', '100');
  await expect(settings.getByRole('slider', { name: 'Foreground lightness' })).toHaveAttribute('min', '5');
  await expect(settings.getByRole('slider', { name: 'Foreground lightness' })).toHaveAttribute('max', '25');
  await settings.getByRole('group', { name: 'Dark top bar foreground tint' })
    .getByRole('button', { name: 'None Dark top bar foreground tint' }).click();
  await expect(settings.getByRole('slider', { name: 'Foreground lightness' })).toHaveAttribute('min', '0');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'desktop-window-tints-v3');
  expect(saved.topbar).toMatchObject({
    mode: 'custom-light',
    darkBackground: { tint: 'none' },
  });
  const customTopbarColors = await root.evaluate(element => ({
    background: getComputedStyle(element).getPropertyValue('--topbar-custom-background').trim(),
    foreground: getComputedStyle(element).getPropertyValue('--topbar-custom-foreground').trim(),
  }));
  expect(customTopbarColors.background).toBe('oklch(100% 0 0)');
  expect(customTopbarColors.foreground).toContain('oklch(');
});

test('Ctrl arrows or Vim keys move between windows', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  await expect(settings.locator('.settings-layout')).toBeVisible();
  const calculator = await openUtility(page, 'calculator');
  await expect(calculator.locator('.calc')).toBeVisible();

  const targetDirection = await page.evaluate(() => {
    const current = document.querySelector('.app-window.focused');
    const target = [...document.querySelectorAll('.app-window')].find(window => window !== current);
    if (!current || !target) return null;
    const currentRect = current.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const dx = targetRect.left + targetRect.width / 2 - currentRect.left - currentRect.width / 2;
    const dy = targetRect.top + targetRect.height / 2 - currentRect.top - currentRect.height / 2;
    const direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up' : 'down');
    return { direction, target: target.dataset.type };
  });
  expect(targetDirection).not.toBeNull();
  const arrowKey = {
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  }[targetDirection.direction];
  const reverseVimKey = {
    left: 'l', right: 'h', up: 'j', down: 'k',
  }[targetDirection.direction];
  await page.keyboard.press(`Control+${arrowKey}`);
  await expect(page.locator('.app-window.focused')).toHaveAttribute('data-type', targetDirection.target);
  await expect.poll(() => page.evaluate(() =>
    Boolean(document.activeElement.closest('.app-window.focused')),
  )).toBe(true);

  await page.keyboard.press(`Control+${reverseVimKey}`);
  await expect(page.locator('.app-window.focused')).toHaveAttribute('data-type', 'calculator');
});

test('desktop window shortcuts do not interfere with calculator expression editing', async ({ page }) => {
  await openUtility(page, 'settings');
  const calculator = await openUtility(page, 'calculator');
  const expression = calculator.locator('.calc-expression');
  await expression.fill('12+3');
  await expression.focus();

  await page.keyboard.press('Control+ArrowLeft');
  await expect(calculator).toHaveClass(/focused/);
  await expect(expression).toBeFocused();
  await page.keyboard.press('[');
  await expect(page.locator('.app-col')).toHaveCount(2);
  await page.keyboard.press('Control+Shift+Comma');
  await expect(page.locator('.app-col').last()).toHaveAttribute('data-width', 'full');
});

test('version-two tint settings keep their light tint and use the new dark default', async ({ page }) => {
  const oldKey = 'desktop-window-tints-v2';
  const currentKey = 'desktop-window-tints-v3';
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
    darkTint: 'purple',
    lightTint: 'teal',
    lightness: 88,
  })), oldKey);
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const settings = await openUtility(page, 'settings');
  await expect(settings.getByRole('group', { name: 'Dark window tint' }).getByRole('button', { name: 'Purple dark tint' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('group', { name: 'Light window tint' }).getByRole('button', { name: 'Teal light tint' })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('slider', { name: 'Dark tint lightness' })).toHaveValue('25');
  await expect(settings.getByRole('slider', { name: 'Light tint lightness' })).toHaveValue('88');
  expect(await page.evaluate(key => localStorage.getItem(key), oldKey)).toContain('"lightness":88');
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
});

test('older white tint preferences stay white until changed by the user', async ({ page }) => {
  const legacyKey = 'desktop-window-tints-v1';
  const currentKey = 'desktop-window-tints-v3';
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
    darkTint: 'blue',
    lightTint: 'none',
    lightness: 95,
  })), legacyKey);
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const settings = await openUtility(page, 'settings');
  const lightness = settings.getByRole('slider', { name: 'Light tint lightness' });
  await expect(lightness).toHaveValue('100');
  await expect(lightness).toHaveAttribute('max', '100');
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toContain('"lightness":95');
  expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBeNull();
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--window-lightness').trim(),
  )).toBe('100%');
});

test('wallpaper startup does not overwrite saved preferences when the manifest has no matches', async ({ page }) => {
  const key = 'desktop-wallpaper-settings-v1';
  const saved = {
    selected: ['/pictures/keep-this-wallpaper.jpg'],
    mode: 'cycle',
    rotation: 'interval',
    intervalMinutes: 15,
    transition: ['zoom'],
    currentUrl: '/pictures/keep-this-wallpaper.jpg',
    nextUrl: '',
    nextChangeAt: 0,
  };
  await page.route('**/files/manifest.json', route => route.fulfill({ json: { wallpapers: [] } }));
  await page.addInitScript(storageKey => {
    window.__wallpaperPreferenceWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === storageKey) window.__wallpaperPreferenceWrites += 1;
      return original.call(this, name, value);
    };
  }, key);
  await page.evaluate(({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)), { key, saved });

  await page.reload();

  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).toEqual(saved);
  expect(await page.evaluate(() => window.__wallpaperPreferenceWrites)).toBe(0);
});

test('shared data handler keeps a last-good copy without repairing data during reads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { readJSON, writeJSON, removeData } = await import('/data-handler.js');
    const key = 'data-handler-test-record';
    const backupKey = `desktop-data-backup-v1:${encodeURIComponent(key)}`;
    localStorage.removeItem(key);
    localStorage.removeItem(backupKey);
    writeJSON(key, { revision: 1 });
    writeJSON(key, { revision: 2 });
    localStorage.setItem(key, '{broken json');
    const recovered = readJSON(key, { revision: 0 });
    const preservedInvalidPrimary = localStorage.getItem(key);
    const unreadableKey = 'data-handler-test-write-without-read';
    const originalGetItem = Storage.prototype.getItem;
    let writeSucceededWithoutRead = false;
    try {
      Storage.prototype.getItem = function (requestedKey) {
        if (requestedKey === unreadableKey) throw new DOMException('Read blocked', 'SecurityError');
        return originalGetItem.call(this, requestedKey);
      };
      writeSucceededWithoutRead = writeJSON(unreadableKey, { saved: true });
    } finally {
      Storage.prototype.getItem = originalGetItem;
    }
    const savedWithoutRead = localStorage.getItem(unreadableKey);
    removeData(unreadableKey);
    return { key, backupKey, recovered, preservedInvalidPrimary, writeSucceededWithoutRead, savedWithoutRead };
  });
  expect(result).toEqual({
    key: 'data-handler-test-record',
    backupKey: `desktop-data-backup-v1:${encodeURIComponent('data-handler-test-record')}`,
    recovered: { revision: 1 },
    preservedInvalidPrimary: '{broken json',
    writeSucceededWithoutRead: true,
    savedWithoutRead: JSON.stringify({ saved: true }),
  });

  const notice = page.locator('[data-data-handler-recovery="data-handler-test-record"]');
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice).toContainText('The current stored value is unchanged');
  const restore = notice.getByRole('button', { name: 'Restore previous copy for data handler test record' });
  await page.keyboard.press('Tab');
  await restore.focus();
  await expect.poll(() => restore.evaluate(button => ({
    visible: button.matches(':focus-visible'),
    outline: getComputedStyle(button).outlineStyle,
  }))).toEqual({ visible: true, outline: 'solid' });
  await page.keyboard.press('Enter');
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toContainText('Previous saved copy restored');
  expect(await page.evaluate(key => localStorage.getItem(key), result.key))
    .toBe(JSON.stringify({ revision: 1 }));

  const afterRemove = await page.evaluate(async key => {
    const { readJSON, writeJSON, removeData } = await import('/data-handler.js');
    writeJSON(key, { revision: 1 });
    writeJSON(key, { revision: 2 });
    removeData(key);
    const backup = localStorage.getItem(`desktop-data-backup-v1:${encodeURIComponent(key)}`);
    localStorage.setItem(key, '{broken json');
    const fallback = readJSON(key, { revision: 0 });
    return { backup, fallback, primary: localStorage.getItem(key) };
  }, result.key);
  expect(afterRemove).toEqual({
    backup: null,
    fallback: { revision: 0 },
    primary: '{broken json',
  });
});

test('failed data recovery is announced and can be retried', async ({ page }) => {
  const key = 'data-handler-restore-failure';
  await page.evaluate(async storageKey => {
    const { readJSON, writeJSON } = await import('/data-handler.js');
    const backupKey = `desktop-data-backup-v1:${encodeURIComponent(storageKey)}`;
    localStorage.removeItem(storageKey);
    localStorage.removeItem(backupKey);
    writeJSON(storageKey, { revision: 1 });
    writeJSON(storageKey, { revision: 2 });
    localStorage.setItem(storageKey, '{broken json');
    readJSON(storageKey, { revision: 0 });

    window.__restoreDataOriginalSetItem = Storage.prototype.setItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === storageKey) throw new DOMException('Storage is blocked', 'SecurityError');
      return originalSetItem.call(this, name, value);
    };
  }, key);

  const notice = page.locator(`[data-data-handler-recovery="${key}"]`);
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: /Restore previous copy/ }).click();
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice).toContainText('Browser storage blocked recovery');
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe('{broken json');

  await page.evaluate(() => {
    Storage.prototype.setItem = window.__restoreDataOriginalSetItem;
    delete window.__restoreDataOriginalSetItem;
  });
  await notice.getByRole('button', { name: /Restore previous copy/ }).click();
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toContainText('Previous saved copy restored');
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key))
    .toBe(JSON.stringify({ revision: 1 }));
});

test('Appearance settings support independent multi-select animation preferences', async ({ page }) => {
  await page.evaluate(async () => {
    const { buildSettings } = await import('/apps/settings.js');
    window.__animationPreferences = {
      windowOpen: ['fade'],
      windowClose: ['fade'],
      showDesktop: ['zoom'],
      overview: ['zoom'],
    };
    const ctx = {
      settings: {
        getSnapshot: () => ({ theme: 'dark', animationPreferences: window.__animationPreferences }),
        setAnimationPreferences: (event, value) => { window.__animationPreferences[event] = value; },
      },
    };
    const app = buildSettings('window-animation-test', ctx, {});
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:4rem 0 0;';
    host.append(app);
    document.body.append(host);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const settings = page.locator('.settings-app').last();
  const openPicker = settings.getByRole('button', { name: /Opening windows/ });
  await openPicker.evaluate(button => button.click());
  const openPanel = settings.getByRole('dialog', { name: 'Opening windows options' });
  await openPanel.getByRole('checkbox', { name: 'Flip' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => window.__animationPreferences.windowOpen)).toEqual(['fade', 'flip']);
  await expect(openPicker).toContainText('2 selected');
  await openPanel.getByRole('checkbox', { name: 'No animation' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => window.__animationPreferences.windowOpen)).toEqual([]);
  await openPanel.getByRole('checkbox', { name: 'No animation' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => window.__animationPreferences.windowOpen.length)).toBe(5);
  await openPanel.getByRole('button', { name: 'Done' }).click();

  const overviewPicker = settings.getByRole('button', { name: /Show overview/ });
  await overviewPicker.evaluate(button => button.click());
  const overviewPanel = settings.getByRole('dialog', { name: 'Show overview options' });
  await expect(overviewPanel.getByRole('checkbox', { name: 'Zoom' })).toBeChecked();
  await expect(overviewPanel.getByRole('checkbox', { name: 'Rubber Band' })).not.toBeChecked();
  await overviewPanel.getByRole('checkbox', { name: 'Rubber Band' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => window.__animationPreferences.overview)).toEqual(['zoom', 'rubber-band']);
});

test('Window appearance setting animates window lifecycle and respects reduced motion', async ({ page }) => {
  const settings = await openUtility(page, 'settings');
  const openPicker = settings.getByRole('button', { name: /Opening windows/ });
  await openPicker.click();
  const openPanel = settings.getByRole('dialog', { name: 'Opening windows options' });
  await expect(openPanel).toHaveAttribute('aria-hidden', 'false');
  await openPanel.getByRole('checkbox', { name: 'No animation' }).evaluate(input => input.click());
  await openPanel.getByRole('checkbox', { name: 'Slide Up' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('desktop-animation-preferences-v1') || '{}').windowOpen)).toEqual(['slide-up']);
  await openPanel.getByRole('button', { name: 'Done' }).click();
  const closePicker = settings.getByRole('button', { name: /Closing windows/ });
  await closePicker.click();
  const closePanel = settings.getByRole('dialog', { name: 'Closing windows options' });
  await expect(closePanel).toHaveAttribute('aria-hidden', 'false');
  await closePanel.getByRole('checkbox', { name: 'No animation' }).evaluate(input => input.click());
  await closePanel.getByRole('checkbox', { name: 'Slide Up' }).evaluate(input => input.click());
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('desktop-animation-preferences-v1') || '{}').windowClose)).toEqual(['slide-up']);
  await closePanel.getByRole('button', { name: 'Done' }).click();
  await page.locator('#close-btn').click();
  await expect(settings).toHaveClass(/window-closing/);
  await expect(settings).toHaveCount(0);

  const calculator = await openUtility(page, 'calculator');
  await expect(calculator).toHaveAttribute('data-window-animation', 'slide-up');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#close-btn').click();
  await expect(calculator).toHaveCount(0);
});

test('Show desktop and overview use independently selected animations', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  let settings = await openUtility(page, 'settings');
  let picker = settings.getByRole('button', { name: /Show desktop/ });
  await picker.click();
  let panel = settings.getByRole('dialog', { name: 'Show desktop options' });
  await panel.getByRole('checkbox', { name: 'No animation' }).evaluate(input => input.click());
  await panel.getByRole('checkbox', { name: 'Tilt Up' }).evaluate(input => input.click());
  await panel.getByRole('button', { name: 'Done' }).click();
  await page.locator('#close-btn').click();
  await expect(settings).toHaveCount(0);

  await page.locator('#show-desktop-btn').click();
  await expect(calculator).toHaveAttribute('data-desktop-animation', 'tilt-up');
  await expect(calculator).toHaveAttribute('data-desktop-direction', 'out');
  await expect(page.locator('body')).toHaveClass(/mod-show-desktop/);
  await page.locator('#show-desktop-btn').click();
  await expect(calculator).toHaveAttribute('data-desktop-direction', 'in');
  await expect(page.locator('body')).toHaveClass(/desktop-returning/);
  await expect(page.locator('body')).not.toHaveClass(/mod-show-desktop/);
  await expect.poll(() => page.locator('body').evaluate(body => body.classList.contains('desktop-returning'))).toBe(false);

  settings = await openUtility(page, 'settings');
  picker = settings.getByRole('button', { name: /Show overview/ });
  await picker.click();
  panel = settings.getByRole('dialog', { name: 'Show overview options' });
  await panel.getByRole('checkbox', { name: 'No animation' }).evaluate(input => input.click());
  await panel.getByRole('checkbox', { name: 'Rubber Band' }).evaluate(input => input.click());
  await panel.getByRole('button', { name: 'Done' }).click();
  await page.locator('#close-btn').click();
  await expect(settings).toHaveCount(0);

  await page.locator('#overview-btn').click();
  await expect(page.locator('body')).toHaveClass(/mod-overview/);
  await expect(calculator).toHaveAttribute('data-overview-animation', 'rubber-band');
  await expect(calculator).toHaveClass(/overview-window-entering/);
  await page.locator('#overview-btn').click();
  await expect(page.locator('body')).not.toHaveClass(/mod-overview/);
});

async function chooseCalculatorMode(calculator, mode) {
  const select = calculator.locator('.calc-mode-select-field');
  if (await select.inputValue() === mode.toLowerCase()) return;
  const trigger = calculator.getByRole('combobox', { name: 'Calculator mode' });
  await trigger.click();
  const popupId = await trigger.getAttribute('aria-controls');
  await calculator.locator('xpath=ancestor::body').locator(`#${popupId}`)
    .getByRole('option', { name: mode, exact: true }).click();
}

async function clickGraphMenuAction(calculator, menu, action) {
  await calculator.getByRole('button', { name: menu, exact: true }).click();
  await calculator.getByRole('button', { name: action, exact: true }).click();
}

async function openGraphInfo(calculator) {
  const panel = calculator.getByRole('dialog', { name: 'Current graph view' });
  if (!(await panel.isVisible())) await calculator.getByRole('button', { name: 'Graph information' }).click();
  await expect(panel).toBeVisible();
  return panel;
}

async function closeGraphInfo(page, calculator) {
  const panel = calculator.getByRole('dialog', { name: 'Current graph view' });
  if (await panel.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  }
}

async function setGraphPlotMode(page, calculator, mode) {
  if (await calculator.locator('.calc-mode-label').textContent() === mode.toUpperCase()) return;
  await closeGraphInfo(page, calculator);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: new RegExp(mode, 'i') }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText(mode.toUpperCase());
}

test('calculator, calendar, and weather controls follow shared theme tokens', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await expectFamilyStylesheet(page, 'calculator.css');
  await expect(calculator.locator('.calc-mode-select')).toHaveCount(1);
  await expect.poll(() => calculator.locator('.calc').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const calculatorMode = calculator.getByRole('combobox', { name: 'Calculator mode' });
  await expect(calculatorMode).toHaveAttribute('aria-haspopup', 'listbox');
  const calculatorModeRadius = await calculatorMode.evaluate(element => getComputedStyle(element).borderRadius);
  await expect(calculator.locator('.calc-mode-select-field')).toHaveClass(/standard-select-native/);
  await expect(calculator.getByText('DESK / 04')).toHaveCount(0);
  const calculatorColors = {};
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    calculatorColors[theme] = await calculator.locator('.calc').evaluate(element => ({
      color: getComputedStyle(element).color,
      keyRadius: getComputedStyle(element.querySelector('.calc-key')).borderRadius,
    }));
  }
  expect(calculatorColors.dark.color).not.toBe(calculatorColors.light.color);
  expect(calculatorColors.dark.keyRadius).toBe(calculatorColors.light.keyRadius);

  const calendar = await openUtility(page, 'calendar');
  await expectFamilyStylesheet(page, 'utility-apps.css');
  await expect(calendar.locator('.cal-nav-button')).toHaveCount(2);
  const calendarStyle = await calendar.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    buttonRadius: getComputedStyle(element.querySelector('.cal-nav-button')).borderRadius,
    viewButtonHeight: element.querySelector('.cal-view-button').getBoundingClientRect().height,
  }));
  expect(calendarStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(calendarStyle.buttonRadius).toBe('10.4px');
  expect(calendarStyle.viewButtonHeight).toBeGreaterThanOrEqual(38);

  const weather = await openUtility(page, 'weather');
  await expectFamilyStylesheet(page, 'utility-apps.css');
  await expect(weather.locator('app-select').first()).toBeAttached();
  const fields = weather.locator('.weather-setup .util-field');
  await expect(fields).toHaveCount(2);
  const weatherFieldStyle = await fields.first().evaluate(element => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, border: style.borderTopWidth, background: style.backgroundColor };
  });
  expect(weatherFieldStyle.radius).toBe('10.4px');
  expect(weatherFieldStyle.border).toBe('1px');
  expect(weatherFieldStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  const weatherSelect = weather.locator('.weather-unit');
  await expect(weatherSelect).toHaveClass(/standard-select-native/);
  const trigger = weather.getByRole('combobox', { name: 'Temperature units', exact: true });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  const selectStyle = await trigger.evaluate(element => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, border: style.borderTopWidth, transform: style.transform, textTransform: style.textTransform };
  });
  expect(selectStyle.radius).toBe('10.4px');
  expect(selectStyle.border).toBe('1px');
  expect(selectStyle.transform).toBe('none');
  expect(calculatorModeRadius).toBe(selectStyle.radius);
  expect(selectStyle.textTransform).toBe('capitalize');

  await trigger.click();
  const popupId = await trigger.getAttribute('aria-controls');
  const popup = page.locator(`[id="${popupId}"]`);
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute('role', 'listbox');
  const popupStyles = await popup.evaluate(element => {
    const style = getComputedStyle(element);
    return { blur: style.backdropFilter, background: style.backgroundColor };
  });
  expect(popupStyles.blur).toContain('blur(');
  expect(popupStyles.background).not.toBe('rgba(0, 0, 0, 0)');
  const [triggerBox, popupBox] = await Promise.all([trigger.boundingBox(), popup.boundingBox()]);
  expect(Math.abs(popupBox.x - triggerBox.x)).toBeLessThan(2);
});

test('lazy app style families load after the shell and retain their layout selectors', async ({ page }) => {
  const inspectSelector = (selector, properties) => page.evaluate(({ selector, properties }) => {
    const probe = document.createElement('div');
    probe.className = selector;
    document.body.append(probe);
    const computed = getComputedStyle(probe);
    const result = Object.fromEntries(properties.map(property => [property, computed[property]]));
    probe.remove();
    return result;
  }, { selector, properties });

  const clock = await openUtility(page, 'world-clock');
  await expectFamilyStylesheet(page, 'utility-apps.css');
  expect((await inspectSelector('clock-app', ['display'])).display).toBe('flex');

  const notes = await openUtility(page, 'sticky-notes');
  await expectFamilyStylesheet(page, 'utility-apps.css');
  expect((await inspectSelector('notes-app', ['display'])).display).toBe('grid');

  const documentViewer = await openUtility(page, 'doc-viewer');
  await expectFamilyStylesheet(page, 'viewer-apps.css');
  expect((await inspectSelector('doc-scroll', ['overflowY', 'paddingTop'])))
    .toEqual({ overflowY: 'auto', paddingTop: '32px' });

  await openUtility(page, 'img-viewer');
  expect((await inspectSelector('img-viewport', ['display', 'cursor'])))
    .toEqual({ display: 'flex', cursor: 'grab' });

  await openUtility(page, 'media-player');
  expect((await inspectSelector('media-player-wrapper', ['display', 'backgroundColor'])))
    .toEqual({ display: 'flex', backgroundColor: 'rgb(0, 0, 0)' });

  const fileManager = await openUtility(page, 'file-manager');
  await expectFamilyStylesheet(page, 'file-manager.css');
  expect((await inspectSelector('fm-layout', ['display', 'containerType'])))
    .toEqual({ display: 'flex', containerType: 'inline-size' });
  await expect(clock).toBeAttached();
  await expect(notes).toBeAttached();
  await expect(documentViewer).toBeAttached();
  await expect(fileManager).toBeAttached();
});

test('calculator supports scientific calculations, reusable history, and graphing', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  const output = calculator.locator('.calc-value');

  await expect(calculator.locator('.calc-header h2')).toHaveCount(0);
  await expect(calculator.locator('.calc-header .calc-memory')).toBeVisible();
  await calculator.getByRole('button', { name: '7', exact: true }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: '3', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('10');
  const historyEntry = calculator.getByRole('button', { name: 'Reuse result 10 from 7+3' });
  await expect(historyEntry).toBeVisible();
  await historyEntry.click();
  await expect(calculator.getByRole('textbox', { name: 'Expression' })).toHaveValue('10');

  await chooseCalculatorMode(calculator, 'Scientific');
  await calculator.locator('.calc-science-key').filter({ hasText: '√(' }).click();
  await calculator.getByRole('button', { name: '9', exact: true }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: ')' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('3');

  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-header .calc-memory')).toBeHidden();
  await expect(calculator.locator('.calc-header-graph-actions')).toBeVisible();
  await expect(calculator.locator('.calc-open-editor')).toHaveText('y = f(x)');
  await expect(calculator.locator('.calc-open-settings')).toHaveText('Settings');
  await expect(calculator.locator('.calc-graph-tools').getByRole('button', { name: 'Edit functions' })).toHaveCount(0);
  await expect(calculator.locator('.calc-graph-tools').getByRole('button', { name: 'Graph settings' })).toHaveCount(0);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await calculator.getByLabel('Function expression').fill('sin(x)');
  await calculator.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot' }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveAttribute('d', /M/);
  await expect(calculator.locator('.calc-graph-status')).toContainText('Plotted');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await calculator.getByLabel('Function expression').fill('window.alert(1)');
  await calculator.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-editor-error')).toContainText('Unknown function or name');
  await calculator.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator restores history and memory after restart and persists clear actions', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  const expression = calculator.getByRole('textbox', { name: 'Expression' });
  await expression.fill('7+3');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.getByRole('button', { name: 'Reuse result 10 from 7+3' })).toBeVisible();
  await calculator.getByRole('button', { name: 'Memory store' }).click();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeEnabled();

  await page.reload();
  const welcome = page.locator('#welcome-win-close');
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  calculator = await openUtility(page, 'calculator');
  await expect(calculator.getByRole('button', { name: 'Reuse result 10 from 7+3' })).toBeVisible();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeEnabled();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(calculator.getByRole('textbox', { name: 'Expression' })).toHaveValue('10');
  await expect(calculator.locator('.calc-value')).toHaveText('10');

  await calculator.locator('.calc-history-clear').click();
  await calculator.getByRole('button', { name: 'Clear memory' }).click();
  await expect(calculator.locator('.calc-history-empty')).toBeVisible();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeDisabled();
  await expect(calculator.getByRole('button', { name: 'Clear memory' })).toBeDisabled();

  await page.reload();
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  calculator = await openUtility(page, 'calculator');
  await expect(calculator.locator('.calc-history-empty')).toBeVisible();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeDisabled();
  await expect(calculator.getByRole('button', { name: 'Clear memory' })).toBeDisabled();
});

test('calculator ignores malformed saved session data and remains usable when writes fail', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('personal-desktop-calculator-history-v1', '{broken');
    localStorage.setItem('personal-desktop-calculator-memory-v1', JSON.stringify({ value: 42 }));
  });
  const calculator = await openUtility(page, 'calculator');
  await expect(calculator.locator('.calc-history-empty')).toBeVisible();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeDisabled();
  await expect(calculator.getByRole('button', { name: 'Clear memory' })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => [
    localStorage.getItem('personal-desktop-calculator-history-v1'),
    localStorage.getItem('personal-desktop-calculator-memory-v1'),
  ])).toEqual(['{broken', '{"value":42}']);

  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    window.__originalCalculatorStorageSetItem = originalSetItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'personal-desktop-calculator-history-v1' || key === 'personal-desktop-calculator-memory-v1') {
        throw new DOMException('Storage writes are blocked', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await calculator.getByRole('textbox', { name: 'Expression' }).fill('8+1');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.getByRole('button', { name: 'Reuse result 9 from 8+1' })).toBeVisible();
  await calculator.getByRole('button', { name: 'Memory store' }).click();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeEnabled();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(calculator.getByRole('textbox', { name: 'Expression' })).toHaveValue('9');
  await expect.poll(() => page.evaluate(() => [
    localStorage.getItem('personal-desktop-calculator-history-v1'),
    localStorage.getItem('personal-desktop-calculator-memory-v1'),
  ])).toEqual(['{broken', '{"value":42}']);
});

test('calculator supports selectable bases, memory, constants, backspace, and compact scientific keys', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  const expression = calculator.getByRole('textbox', { name: 'Expression' });
  const output = calculator.locator('.calc-value');

  const basicLayout = await calculator.locator('.calc-keypad-columns').evaluate(element => {
    const keypad = element.querySelector('.calc-keys').getBoundingClientRect();
    const columns = element.getBoundingClientRect();
    const wrapper = element.closest('.calc-wrap');
      const calc = wrapper.querySelector('.calc');
      const header = calc.querySelector('.calc-header');
      const history = calc.querySelector('.calc-history');
      const workspace = calc.querySelector('.calc-workspace');
      const main = calc.querySelector('.calc-main');
    return {
      keypadWidth: keypad.width,
      columnsWidth: columns.width,
      supportDisplay: getComputedStyle(element.querySelector('.calc-keypad-support')).display,
      padding: getComputedStyle(wrapper).padding,
        mainPaddingTop: Number.parseFloat(getComputedStyle(main).paddingTop),
        headerLeftInset: header.getBoundingClientRect().left - calc.getBoundingClientRect().left,
        headerRightInset: calc.getBoundingClientRect().right - header.getBoundingClientRect().right,
        toolbarBorder: getComputedStyle(header).borderBottomWidth,
        historyTopGap: history.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        historyRightGap: calc.getBoundingClientRect().right - history.getBoundingClientRect().right,
        historyBottomGap: calc.getBoundingClientRect().bottom - history.getBoundingClientRect().bottom,
        workspaceTopGap: workspace.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
    };
  });
  expect(Math.abs(basicLayout.keypadWidth - basicLayout.columnsWidth)).toBeLessThanOrEqual(2);
  expect(basicLayout.supportDisplay).toBe('none');
  expect(basicLayout.padding).toBe('0px');
  expect(basicLayout.mainPaddingTop).toBeGreaterThan(0);
  expect(basicLayout.headerLeftInset).toBeLessThanOrEqual(1);
  expect(basicLayout.headerRightInset).toBeLessThanOrEqual(1);
  expect(basicLayout.toolbarBorder).toBe('1px');
  expect(basicLayout.historyTopGap).toBeLessThanOrEqual(1);
  expect(basicLayout.historyRightGap).toBeLessThanOrEqual(1);
  expect(basicLayout.historyBottomGap).toBeLessThanOrEqual(1);
  expect(basicLayout.workspaceTopGap).toBeLessThanOrEqual(1);
  const backspaceGeometry = async () => calculator.locator('.calc-expression-input-wrap').evaluate(wrapper => {
    const buttonElement = wrapper.querySelector('.calc-backspace');
    const button = buttonElement.getBoundingClientRect();
    const input = wrapper.querySelector('.calc-expression');
    const inputBounds = input.getBoundingClientRect();
    return {
      buttonInsideInputRow: wrapper.contains(buttonElement) &&
        button.left >= inputBounds.left && button.right <= inputBounds.right,
      rightGap: inputBounds.right - button.right,
      verticalCenterOffset: Math.abs((button.top + button.bottom) / 2 - (inputBounds.top + inputBounds.bottom) / 2),
      rightPadding: parseFloat(getComputedStyle(input).paddingRight),
    };
  });
  const basicBackspace = await backspaceGeometry();
  expect(basicBackspace.buttonInsideInputRow).toBe(true);
  expect(basicBackspace.rightGap).toBe(0);
  expect(basicBackspace.verticalCenterOffset).toBeLessThanOrEqual(2);
  expect(basicBackspace.rightPadding).toBeGreaterThanOrEqual(32);

  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeHidden();
  await expect(calculator.getByRole('button', { name: '÷', exact: true })).toHaveAttribute('title', 'Divide · type /');
  await chooseCalculatorMode(calculator, 'Scientific');
  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeVisible();
  const scientificBackspace = await backspaceGeometry();
  expect(scientificBackspace.buttonInsideInputRow).toBe(true);
  expect(scientificBackspace.rightPadding).toBeGreaterThanOrEqual(32);
  await expect(calculator.getByRole('button', { name: 'Square root' })).toHaveAttribute('title', 'Square root · type sqrt(');
  await expect(calculator.getByRole('button', { name: 'Pi' })).toHaveAttribute('title', 'Pi constant · type pi');
  await expect(calculator.getByRole('button', { name: 'Euler’s number' })).toHaveAttribute('title', 'Euler’s number · type e');
  await expression.fill('7+3');
  await calculator.getByRole('button', { name: 'Base 2' }).click();
  await expect(expression).toHaveValue('0b111+0b11');
  await expect(output).toHaveText('0b1010');
  await calculator.getByRole('button', { name: 'Base 8' }).click();
  await expect(expression).toHaveValue('0o7+0o3');
  await expect(output).toHaveText('0o12');
  await calculator.getByRole('button', { name: 'Base 16' }).click();
  await expect(expression).toHaveValue('0x7+0x3');
  await expect(output).toHaveText('0xa');

  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await expression.press('F');
  await expect(expression).toHaveValue('0xF');
  await expect(output).toHaveText('0xf');
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Hex digit A' }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: '1', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('0xb');

  await expression.fill('123');
  await expression.evaluate(element => element.setSelectionRange(2, 2));
  await calculator.getByRole('button', { name: 'Backspace' }).click();
  await expect(expression).toHaveValue('13');
  await expect(output).toHaveText('0x13');

  await calculator.getByRole('button', { name: 'Base 10' }).click();
  await calculator.getByRole('button', { name: 'Base 16' }).click();
  await chooseCalculatorMode(calculator, 'Basic');
  await expect(calculator.getByRole('button', { name: 'Base 2' })).toBeHidden();
  await expect(expression).toHaveValue('19');
  await expect(output).toHaveText('19');
  await expression.fill('12');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory store' }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(output).toHaveText('12');
  await calculator.getByRole('button', { name: 'Add to memory' }).click();
  await expression.fill('3');
  await calculator.getByRole('button', { name: 'Subtract from memory' }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(output).toHaveText('21');
  await calculator.getByRole('button', { name: 'Clear memory' }).click();
  await expect(calculator.getByRole('button', { name: 'Memory recall' })).toBeDisabled();
  await expect(calculator.getByRole('button', { name: 'Clear memory' })).toBeDisabled();
  await expect(output).toHaveText('21');
  await expression.fill('9');
  await calculator.getByRole('button', { name: 'Memory store' }).click();
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Memory recall' }).click();
  await expect(output).toHaveText('9');

  await chooseCalculatorMode(calculator, 'Scientific');
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: 'Pi' }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: 'Euler’s number' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('5.85987448205');
  await expression.fill('√(π)');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('1.77245385091');
  await expression.fill('sqrt(pi)');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('1.77245385091');
  await expression.fill('2×3');
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(output).toHaveText('6');

  await calculator.evaluate(element => {
    const appWindow = element.closest('.app-window');
    appWindow.style.width = '960px';
    appWindow.style.height = '680px';
  });
  const keypadColumns = calculator.locator('.calc-keypad-columns');
  const wideColumns = await keypadColumns.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(wideColumns).toBe(2);
  const widePlacement = await keypadColumns.evaluate(element => {
    const keys = element.querySelector('.calc-keys').getBoundingClientRect();
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    return { keysRight: keys.right, supportLeft: support.left, supportWidth: support.width };
  });
  expect(widePlacement.supportLeft).toBeGreaterThanOrEqual(widePlacement.keysRight);
  expect(widePlacement.supportWidth).toBeGreaterThan(180);
  expect(await calculator.locator('.calc-keys').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-keypad-support').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-memory').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-base-control').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-scientific').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const scientificFill = await keypadColumns.evaluate(element => {
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    const scientific = element.querySelector('.calc-scientific').getBoundingClientRect();
    return support.bottom - scientific.bottom;
  });
  expect(scientificFill).toBeLessThanOrEqual(16);
  await calculator.getByRole('button', { name: 'Base 16' }).click();
  expect(await calculator.locator('.calc-hex-keys').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const hexOrdering = await keypadColumns.evaluate(element => {
    const hex = element.querySelector('.calc-hex-keys').getBoundingClientRect();
    const scientific = element.querySelector('.calc-scientific').getBoundingClientRect();
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    return { hexBottom: hex.bottom, scienceTop: scientific.top, supportBottom: support.bottom, scienceBottom: scientific.bottom };
  });
  expect(hexOrdering.hexBottom).toBeLessThanOrEqual(hexOrdering.scienceTop + 1);
  expect(hexOrdering.supportBottom - hexOrdering.scienceBottom).toBeLessThanOrEqual(16);
  await calculator.evaluate(element => {
    const appWindow = element.closest('.app-window');
    appWindow.style.width = '480px';
    appWindow.style.height = '760px';
  });
  const narrowColumns = await keypadColumns.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(narrowColumns).toBe(2);
  const mediumPlacement = await keypadColumns.evaluate(element => {
    const keys = element.querySelector('.calc-keys').getBoundingClientRect();
    const support = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    return { keysRight: keys.right, supportLeft: support.left };
  });
  expect(mediumPlacement.supportLeft).toBeGreaterThanOrEqual(mediumPlacement.keysRight);
  const mediumHistory = await calculator.locator('.calc-workspace').evaluate(workspace => {
    const main = workspace.querySelector('.calc-main').getBoundingClientRect();
    const history = workspace.querySelector('.calc-history').getBoundingClientRect();
    return {
      columns: getComputedStyle(workspace).gridTemplateColumns.split(' ').length,
      gap: history.top - main.bottom,
      bottomGap: workspace.getBoundingClientRect().bottom - history.bottom,
      height: history.height,
    };
  });
  expect(mediumHistory.columns).toBe(1);
  expect(mediumHistory.gap).toBeGreaterThanOrEqual(0);
  expect(mediumHistory.bottomGap).toBeLessThanOrEqual(1);
  expect(mediumHistory.height).toBeGreaterThanOrEqual(128);
  await calculator.evaluate(element => {
    const appWindow = element.closest('.app-window');
    appWindow.style.width = '360px';
    appWindow.style.height = '760px';
  });
  const compactColumns = await keypadColumns.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(compactColumns).toBe(1);
  const order = await keypadColumns.evaluate(element => {
    const extra = element.querySelector('.calc-keypad-support').getBoundingClientRect();
    const number = element.querySelector('.calc-keys').getBoundingClientRect();
    const keypad = element.querySelector('.calc-keys');
    const keypadBox = keypad.getBoundingClientRect();
    const lastKeyBox = keypad.lastElementChild.getBoundingClientRect();
    const columnsBox = element.getBoundingClientRect();
    return {
      supportTop: extra.top,
      numberTop: number.top,
      keypadHeight: keypadBox.height,
      lastKeyBottom: lastKeyBox.bottom,
      keypadBottom: keypadBox.bottom,
      keypadWidth: keypadBox.width,
      columnsWidth: columnsBox.width,
    };
  });
  expect(order.supportTop).toBeLessThan(order.numberTop);
  expect(order.keypadHeight).toBeGreaterThan(0);
  expect(Math.abs(order.lastKeyBottom - order.keypadBottom), JSON.stringify(order)).toBeLessThanOrEqual(2);
  expect(Math.abs(order.keypadWidth - order.columnsWidth)).toBeLessThanOrEqual(2);
  const compactHistory = await calculator.locator('.calc-workspace').evaluate(workspace => {
    const main = workspace.querySelector('.calc-main').getBoundingClientRect();
    const history = workspace.querySelector('.calc-history').getBoundingClientRect();
    return {
      columns: getComputedStyle(workspace).gridTemplateColumns.split(' ').length,
      gap: history.top - main.bottom,
      bottomGap: workspace.getBoundingClientRect().bottom - history.bottom,
      height: history.height,
    };
  });
  expect(compactHistory.columns).toBe(1);
  expect(compactHistory.gap).toBeGreaterThanOrEqual(0);
  expect(compactHistory.bottomGap).toBeLessThanOrEqual(1);
  expect(compactHistory.height).toBeGreaterThanOrEqual(128);
  expect(await calculator.locator('.calc').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  expect(await calculator.locator('.calc-main').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const surfaces = await calculator.locator('.calc').evaluate(element => {
    const sidebarProbe = document.createElement('div');
    sidebarProbe.style.cssText = 'position:absolute;visibility:hidden;background:var(--sidebar-bg)';
    element.append(sidebarProbe);
    const sidebarBackground = getComputedStyle(sidebarProbe).backgroundColor;
    sidebarProbe.remove();
    return {
      background: getComputedStyle(element).backgroundColor,
      border: getComputedStyle(element).borderTopWidth,
      shadow: getComputedStyle(element).boxShadow,
      displayBackground: getComputedStyle(element.querySelector('.calc-display')).backgroundColor,
      historyBackground: getComputedStyle(element.querySelector('.calc-history')).backgroundColor,
      sidebarBackground,
    };
  });
  expect(surfaces.background).toBe('rgba(0, 0, 0, 0)');
  expect(surfaces.border).toBe('0px');
  expect(surfaces.shadow).toBe('none');
  expect(surfaces.displayBackground).toBe('rgba(0, 0, 0, 0)');
  expect(surfaces.historyBackground).toBe(surfaces.sidebarBackground);
});

test('calculator graph edits multiple functions in an accessible keypad dialog', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor).toBeVisible();
  await expect(editor.locator('.calc-dialog-close')).toHaveCount(0);
  await expect(editor.locator('app-dialog-actions')).toBeVisible();
  await expect(editor.getByRole('radio')).toHaveCount(6);
  await expect(editor.locator('.calc-editor-expression-label')).toContainText('y =');
  const equationLayout = await editor.locator('.calc-editor-expression-label').evaluate(label => {
    const input = label.querySelector('input').getBoundingClientRect();
    const bounds = label.getBoundingClientRect();
    const style = getComputedStyle(label);
    return {
      display: style.display,
      columns: style.gridTemplateColumns.split(' ').length,
      inputTopOffset: input.top - bounds.top,
    };
  });
  expect(equationLayout.display).toBe('grid');
  expect(equationLayout.columns).toBe(2);
  expect(Math.abs(equationLayout.inputTopOffset)).toBeLessThanOrEqual(2);
  await expect(editor.getByRole('button', { name: 'sin(', exact: true })).toBeVisible();
  for (const [name, symbol, tooltip] of [
    ['sin(', 'sin(', 'Sine function · type sin('],
    ['Theta', 'θ', 'Theta variable · type theta'],
    ['Pi', 'π', 'Pi constant · type pi'],
    ['Square root', '√(', 'Square root · type sqrt('],
    ['e', 'e', 'Euler’s number · type e'],
    ['^', '^', 'Power · type ^'],
    ['×', '×', 'Multiply · type *'],
  ]) {
    const key = editor.getByRole('button', { name, exact: true });
    await expect(key).toHaveText(symbol);
    await expect(key).toHaveAttribute('title', tooltip);
  }
  const functionExpression = editor.getByRole('textbox', { name: 'Function expression' });
  await functionExpression.fill('sin(x)');
  await expect(editor.locator('.calc-editor-select')).toHaveText('sin(x)');
  await expect(editor.locator('.calc-editor-select')).not.toContainText('Function');
  await expect(editor.locator('.calc-editor-nav > .calc-new-function')).toHaveText('New');
  await expect(editor.locator('.calc-dialog-actions .calc-new-function')).toHaveCount(0);
  await editor.getByRole('button', { name: 'New function' }).click();
  await expect(functionExpression).toHaveValue('');
  await expect(editor.locator('.calc-editor-select:not([data-empty="true"])')).toHaveCount(1);
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(1);
  await editor.getByRole('button', { name: 'cos(', exact: true }).click();
  await editor.getByRole('button', { name: '2', exact: true }).click();
  await editor.getByRole('button', { name: '×', exact: true }).click();
  await editor.getByRole('button', { name: 'x', exact: true }).click();
  await editor.getByRole('button', { name: ')', exact: true }).click();
  await expect(functionExpression).toHaveValue('cos(2*x)');
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(0);
  const selectedFunctionBackground = await editor.locator('.calc-editor-select[aria-current="true"]')
    .evaluate(button => ({
      background: getComputedStyle(button).backgroundColor,
      common: getComputedStyle(button).getPropertyValue('--btn-active').trim(),
    }));
  expect(selectedFunctionBackground.background).toBe(selectedFunctionBackground.common);
  await editor.locator('.note-color-choice[data-note-color="orange"]').click();
  await expect(editor.getByRole('radio', { name: 'Orange line color' })).toBeChecked();
  await editor.getByRole('button', { name: '+', exact: true }).click();
  await editor.getByRole('button', { name: '1', exact: true }).click();
  await expect(functionExpression).toHaveValue('cos(2*x)+1');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(2);
  const colors = await calculator.locator('.calc-graph-line').evaluateAll(lines => lines.map(line => line.style.getPropertyValue('--function-color')));
  expect(new Set(colors).size).toBe(2);
  await openGraphInfo(calculator);
  await calculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator function editor underlines empty entries and drops them when applied', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  const expression = editor.getByRole('textbox', { name: 'Function expression' });

  const emptyEntry = editor.locator('.calc-editor-select[data-empty="true"]');
  await expect(emptyEntry).toHaveCount(1);
  const underlineStyle = await emptyEntry.evaluate(button => {
    const style = getComputedStyle(button);
    return { border: style.borderBottomStyle, background: style.backgroundColor };
  });
  expect(underlineStyle).toEqual({ border: 'solid', background: 'rgba(0, 0, 0, 0)' });

  await expression.fill('x');
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(0);
  await expect(editor.locator('.calc-editor-select[aria-current="true"]')).toHaveText('x');
  await editor.getByRole('button', { name: 'New function' }).click();
  await expect(editor.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(1);
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(1);

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editExisting = calculator.getByRole('dialog', { name: 'Edit functions' });
  const existingExpression = editExisting.getByRole('textbox', { name: 'Function expression' });
  await existingExpression.focus();
  await existingExpression.evaluate(field => field.setSelectionRange(field.value.length, field.value.length));
  await editExisting.getByRole('button', { name: 'Backspace expression' }).click();
  await expect(existingExpression).toHaveValue('');
  await expect(editExisting.locator('.calc-editor-select[data-empty="true"]')).toHaveCount(1);
  await editExisting.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  const info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
});

test('calculator allows an empty graph and adding functions afterward', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const info = await openGraphInfo(calculator);
  await expect(calculator.locator('.calc-graph-heading .calc-function-list')).toHaveCount(0);
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
  await expect(calculator.locator('.calc-graph-status')).toContainText('No functions yet');
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(0);

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
  await openGraphInfo(calculator);
  await expect(calculator.locator('.calc-graph-status')).toContainText('No functions yet');

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor.locator('.calc-editor-empty')).toBeHidden();
  await expect(editor.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await expect(editor.locator('.calc-editor-empty')).toBeHidden();
  await editor.getByLabel('Function expression').fill('sin(x)');
  await expect(editor.locator('.calc-editor-select')).toHaveText('sin(x)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(1);
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator keeps functions separate by plot mode and lists them in graph information', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-graph-heading .calc-function-list')).toHaveCount(0);

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  let editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('x^2');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  let info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('y = x^2');

  await setGraphPlotMode(page, calculator, 'polar');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
  await closeGraphInfo(page, calculator);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('r(θ) = sin(theta)');

  await setGraphPlotMode(page, calculator, 'parametric');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');
  await closeGraphInfo(page, calculator);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor.locator('.calc-editor-expression-label')).toBeHidden();
  await expect(editor.locator('.calc-editor-function-fields .calc-editor-function-label')).toHaveText(['x =', 'y =']);
  await editor.getByLabel('x(t)').fill('t');
  await editor.getByLabel('y(t)').fill('t^2');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('x(t)=t · y(t)=t^2');

  await setGraphPlotMode(page, calculator, 'cartesian');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('y = x^2');
  await page.locator('#close-btn').click();

  const reopened = await openUtility(page, 'calculator');
  await chooseCalculatorMode(reopened, 'Graph');
  await expect(reopened.locator('.calc-mode-label')).toHaveText('CARTESIAN');
  info = await openGraphInfo(reopened);
  await expect(info.locator('.calc-function-summary')).toHaveText('y = x^2');
  await closeGraphInfo(page, reopened);
  await setGraphPlotMode(page, reopened, 'polar');
  info = await openGraphInfo(reopened);
  await expect(info.locator('.calc-function-summary')).toHaveText('r(θ) = sin(theta)');
  await closeGraphInfo(page, reopened);
  await setGraphPlotMode(page, reopened, 'parametric');
  info = await openGraphInfo(reopened);
  await expect(info.locator('.calc-function-summary')).toHaveText('x(t)=t · y(t)=t^2');
});

test('calculator migrates saved functions into their existing plot mode', async ({ page }) => {
  const legacy = {
    version: 1,
    graphMode: 'polar',
    ranges: {
      xMin: '-10', xMax: '10', yMin: '-10', yMax: '10',
      thetaMin: '-6.28', thetaMax: '6.28', rMin: '-10', rMax: '10',
      tMin: '-6.28', tMax: '6.28',
    },
    functions: [{
      id: 'fn-1', expression: 'sin(theta)', xExpression: 'cos(t)', yExpression: 'sin(t)',
      color: '#e47b27', visible: true,
    }],
    viewRanges: {},
  };
  await page.evaluate(value => localStorage.setItem('personal-desktop-calculator-graph-v1', JSON.stringify(value)), legacy);
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  let info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-summary')).toHaveText('r(θ) = sin(theta)');
  await setGraphPlotMode(page, calculator, 'cartesian');
  info = await openGraphInfo(calculator);
  await expect(info.locator('.calc-function-empty')).toHaveText('No functions yet');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1')));
  expect(saved.version).toBe(2);
  expect(saved.functionsByMode.cartesian).toHaveLength(0);
  expect(saved.functionsByMode.polar).toHaveLength(1);
});

test('calculator graph settings keep modes and plot ranges independent', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-open-editor')).toHaveText('y = f(x)');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.locator('.calc-dialog-close')).toHaveCount(0);
  await expect(settings.locator('app-dialog-actions button')).toHaveText(['Cancel', 'Apply settings']);
  const graphMode = settings.getByRole('combobox', { name: 'Graph mode' });
  await graphMode.click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await expect(settings.getByLabel('Minimum theta')).toBeVisible();
  await settings.getByLabel('Maximum theta').fill('6.28');
  await settings.getByLabel('Minimum r').fill('0');
  await settings.getByLabel('Maximum r').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(calculator.locator('.calc-open-editor')).toHaveText('r = f(θ)');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await expect(editor.locator('.calc-editor-expression-label')).toContainText('r =');
  const functionExpression = editor.getByLabel('Function expression');
  await editor.getByRole('button', { name: 'Clear expression' }).click();
  await editor.getByRole('button', { name: 'sin(', exact: true }).click();
  await editor.getByRole('button', { name: 'Theta', exact: true }).click();
  await editor.getByRole('button', { name: ')', exact: true }).click();
  await expect(functionExpression).toHaveValue('sin(θ)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-status')).toContainText('polar');
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-line')).toHaveCount(1);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await graphMode.click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await expect(settings.getByLabel('Minimum t')).toBeVisible();
  await settings.getByLabel('Maximum t').fill('6.28');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(calculator.locator('.calc-open-editor')).toHaveText('x(t), y(t)');
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const xExpression = editor.locator('.calc-editor-x');
  const yExpression = editor.locator('.calc-editor-y');
  await expect(xExpression).toBeVisible();
  await expect(yExpression).toBeVisible();
  await expect(editor.locator('.calc-editor-function-fields label').nth(0)).toHaveText('x =');
  await expect(editor.locator('.calc-editor-function-fields label').nth(1)).toHaveText('y =');
  const backspaceWidth = await editor.locator('.calc-editor-backspace').first().evaluate(button => ({
    width: getComputedStyle(button).width,
    right: getComputedStyle(button).right,
    padding: getComputedStyle(button.previousElementSibling).paddingRight,
  }));
  expect(backspaceWidth).toEqual({ width: '32px', right: '0px', padding: '32px' });
  await expect(editor.getByRole('button', { name: 'Move to y expression' })).toBeVisible();
  await xExpression.fill('cos(t)');
  await yExpression.fill('');
  await xExpression.focus();
  await editor.getByRole('button', { name: 'Move to y expression' }).click();
  await expect(yExpression).toBeFocused();
  await editor.getByRole('button', { name: 'sin(', exact: true }).click();
  await editor.getByRole('button', { name: 't', exact: true }).click();
  await editor.getByRole('button', { name: ')', exact: true }).click();
  await expect(yExpression).toHaveValue('sin(t)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await calculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(calculator.locator('.calc-graph-status')).toContainText('parametric');
});

test('calculator fits visible curves in every graph mode without changing configured ranges', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const view = async () => calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  let settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  let editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('4*x+3');
  await editor.getByRole('button', { name: 'New function' }).click();
  await editor.getByLabel('Function expression').fill('100*x');
  await editor.getByLabel('Show 100*x').uncheck();
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  let fitted = await view();
  expect(fitted.xMin).toBe(-4);
  expect(fitted.xMax).toBe(4);
  expect(fitted.yMin).toBeLessThan(-13);
  expect(fitted.yMax).toBeGreaterThan(19);
  await expect(calculator.locator('.calc-graph-status')).toContainText('1 visible curve');
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('CARTESIAN');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
  await openGraphInfo(calculator);
  await calculator.locator('.calc-function-item').last().getByRole('button', { name: /^Remove function/ }).click();

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('1');
  await settings.getByLabel('Maximum theta').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('2+sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  fitted = await view();
  expect(fitted.thetaMin).toBe(1);
  expect(fitted.thetaMax).toBe(5);
  expect(fitted.rMin).toBeLessThanOrEqual(1);
  expect(fitted.rMax).toBeGreaterThanOrEqual(3);
  expect(fitted.rMax).toBeLessThan(10);
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByRole('combobox', { name: 'Graph mode' })).toHaveAttribute('data-value', 'polar');
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('1');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('5');
  await expect(settings.getByLabel('Minimum r')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum r')).toHaveValue('10');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ thetaMin: 1, thetaMax: 5, rMin: 0, rMax: 10 });
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('-2+sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  fitted = await view();
  expect(fitted.rMin).toBe(0);
  expect(fitted.rMax).toBeGreaterThanOrEqual(3);
  expect(fitted.rMax).toBeLessThan(10);
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ thetaMin: 1, thetaMax: 5, rMin: 0, rMax: 10 });

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('x(t)').fill('2*cos(t)');
  await editor.getByLabel('y(t)').fill('3*sin(t)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  fitted = await view();
  expect(fitted.tMin).toBe(0);
  expect(fitted.tMax).toBe(6.283);
  expect(fitted.xMin).toBeLessThanOrEqual(-2);
  expect(fitted.xMax).toBeGreaterThanOrEqual(2);
  expect(fitted.xMin).toBeGreaterThan(-10);
  expect(fitted.xMax).toBeLessThan(10);
  expect(fitted.yMin).toBeLessThanOrEqual(-3);
  expect(fitted.yMax).toBeGreaterThanOrEqual(3);
  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('PARAMETRIC');
  await expect.poll(view).toEqual(fitted);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByRole('combobox', { name: 'Graph mode' })).toHaveAttribute('data-value', 'parametric');
  await expect(settings.getByLabel('Minimum t')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum t')).toHaveValue('6.283');
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ tMin: 0, tMax: 6.283, xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
});

test('calculator keeps each graph mode fitted while fitting and resetting other modes', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const view = () => calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  let settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  let editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('4*x+3');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  const cartesianFitted = await view();

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('1');
  await settings.getByLabel('Maximum theta').fill('5');
  await settings.getByLabel('Minimum r').fill('0');
  await settings.getByLabel('Maximum r').fill('10');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('2+sin(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  const polarFitted = await view();

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await settings.getByLabel('Minimum t').fill('0');
  await settings.getByLabel('Maximum t').fill('6.283');
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('x(t)').fill('2*cos(t)');
  await editor.getByLabel('y(t)').fill('3*sin(t)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');
  const parametricFitted = await view();

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('PARAMETRIC');
  await expect.poll(view).toEqual(parametricFitted);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Cartesian/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(calculator.locator('.calc-mode-label')).toHaveText('CARTESIAN');
  await expect.poll(view).toEqual(cartesianFitted);
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ xMin: -4, xMax: 4, yMin: -5, yMax: 5 });

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect.poll(view).toEqual(polarFitted);
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ thetaMin: 1, thetaMax: 5, rMin: 0, rMax: 10 });

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect.poll(view).toEqual(parametricFitted);
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ tMin: 0, tMax: 6.283, xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
});

test('calculator restores a fitted view after a full page refresh', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('4*x+3');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');

  const fitted = await calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
  expect(fitted.xMin).toBe(-4);
  expect(fitted.xMax).toBe(4);
  expect(fitted.yMin).toBeLessThan(-13);
  expect(fitted.yMax).toBeGreaterThan(19);

  await page.reload();
  const welcome = page.getByRole('button', { name: 'Get started', exact: true });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const view = () => calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
  await expect(calculator.locator('.calc-mode-label')).toHaveText('CARTESIAN');
  await expect.poll(view).toEqual(fitted);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const restoredSettings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(restoredSettings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(restoredSettings.getByLabel('Maximum x')).toHaveValue('4');
  await expect(restoredSettings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(restoredSettings.getByLabel('Maximum y')).toHaveValue('5');
  await restoredSettings.getByRole('button', { name: 'Cancel', exact: true }).click();

  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual({ xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
});

test('calculator Fit curves includes a narrow peak between rendered samples', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('100/(1000000*(x-0.008)^2+1)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');

  const fitted = await calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
  expect(fitted.xMin).toBe(-4);
  expect(fitted.xMax).toBe(4);
  expect(fitted.yMax).toBeGreaterThan(50);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
});

test('calculator Fit curves includes a narrow Polar peak and preserves its angle range', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('0');
  await settings.getByLabel('Maximum theta').fill('6.283');
  await settings.getByLabel('Minimum r').fill('0');
  await settings.getByLabel('Maximum r').fill('10');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('100/(1000000*(theta-1.2342168125)^2+1)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  const curvePath = calculator.locator('.calc-graph-line');
  const ordinaryPointCount = await curvePath.evaluate(element => (element.getAttribute('d').match(/[ML]/g) || []).length);
  expect(ordinaryPointCount).toBeGreaterThan(0);
  expect(ordinaryPointCount).toBeLessThanOrEqual(501);
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');

  const fitted = await calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
  expect(fitted.thetaMin).toBe(0);
  expect(fitted.thetaMax).toBe(6.283);
  expect(fitted.rMax).toBeGreaterThan(50);
  const fittedPointCount = await curvePath.evaluate(element => (element.getAttribute('d').match(/[ML]/g) || []).length);
  expect(fittedPointCount).toBeGreaterThan(7000);
  const curveBounds = await curvePath.evaluate(element => ({ y: element.getBBox().y }));
  expect(curveBounds.y).toBeLessThan(120);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('6.283');
});

test('calculator Fit curves includes a narrow Parametric peak and preserves its parameter range', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await settings.getByLabel('Minimum t').fill('0');
  await settings.getByLabel('Maximum t').fill('6.283');
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('x(t)').fill('t');
  await editor.getByLabel('y(t)').fill('100/(1000000*(t-1.2342168125)^2+1)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  const curvePath = calculator.locator('.calc-graph-line');
  const ordinaryPointCount = await curvePath.evaluate(element => (element.getAttribute('d').match(/[ML]/g) || []).length);
  expect(ordinaryPointCount).toBeGreaterThan(0);
  expect(ordinaryPointCount).toBeLessThanOrEqual(501);
  await clickGraphMenuAction(calculator, 'View', 'Fit curves');

  const fitted = await calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
  expect(fitted.tMin).toBe(0);
  expect(fitted.tMax).toBe(6.283);
  expect(fitted.yMax).toBeGreaterThan(50);
  const fittedPointCount = await curvePath.evaluate(element => (element.getAttribute('d').match(/[ML]/g) || []).length);
  expect(fittedPointCount).toBeGreaterThan(7000);
  const curveBounds = await curvePath.evaluate(element => ({ y: element.getBBox().y }));
  expect(curveBounds.y).toBeLessThan(120);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await expect(settings.getByLabel('Minimum t')).toHaveValue('0');
  await expect(settings.getByLabel('Maximum t')).toHaveValue('6.283');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.reload();
  const welcome = page.getByRole('button', { name: 'Get started', exact: true });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  const reloadedCalculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(reloadedCalculator, 'Graph');
  await expect(reloadedCalculator.locator('.calc-mode-label')).toHaveText('PARAMETRIC');
  const reloadedCurve = reloadedCalculator.locator('.calc-graph-line');
  const reloadedPointCount = await reloadedCurve.evaluate(element => (element.getAttribute('d').match(/[ML]/g) || []).length);
  expect(reloadedPointCount).toBeGreaterThan(7000);
  await expect.poll(() => reloadedCalculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view)))
    .toEqual(fitted);
  const reloadedCurveBounds = await reloadedCurve.evaluate(element => ({ y: element.getBBox().y }));
  expect(reloadedCurveBounds.y).toBeLessThan(120);
});

test('calculator graph functions, colors, visibility, mode, and ranges persist across reopen and refresh', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  let settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Minimum x').fill('-4');
  await settings.getByLabel('Maximum x').fill('4');
  await settings.getByLabel('Minimum y').fill('-5');
  await settings.getByLabel('Maximum y').fill('5');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  const graphMode = settings.getByRole('combobox', { name: 'Graph mode' });
  await graphMode.click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('-1');
  await settings.getByLabel('Maximum theta').fill('7');
  await settings.getByLabel('Minimum r').fill('-2');
  await settings.getByLabel('Maximum r').fill('6');
  await settings.getByRole('button', { name: 'Apply settings' }).click();

  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  let editor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.locator('.note-color-choice[data-note-color="orange"]').click();
  await editor.getByRole('button', { name: 'New function' }).click();
  await editor.getByLabel('Function expression').fill('cos(2*theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await openGraphInfo(calculator);
  await calculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(calculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -1 to 7/);

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await openGraphInfo(calculator);
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(calculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);
  await expect.poll(() => calculator.locator('.calc-function-swatch').first().evaluate(element => element.style.getPropertyValue('--function-color'))).toBe('#e47b27');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('-1');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('7');
  await expect(settings.getByLabel('Minimum r')).toHaveValue('-2');
  await expect(settings.getByLabel('Maximum r')).toHaveValue('6');
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Cartesian/ }).click();
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
  await expect(settings.getByLabel('Minimum y')).toHaveValue('-5');
  await expect(settings.getByLabel('Maximum y')).toHaveValue('5');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.reload();
  const welcome = page.getByRole('button', { name: 'Get started', exact: true });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect(calculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(calculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);
  await expect.poll(() => calculator.locator('.calc-function-swatch').first().evaluate(element => element.style.getPropertyValue('--function-color'))).toBe('#e47b27');
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Minimum theta')).toHaveValue('-1');
  await expect(settings.getByLabel('Maximum theta')).toHaveValue('7');
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Cartesian/ }).click();
  await expect(settings.getByLabel('Minimum x')).toHaveValue('-4');
  await expect(settings.getByLabel('Maximum x')).toHaveValue('4');
});

test('open calculator windows stay in sync when graph settings change', async ({ page }) => {
  const firstCalculator = await openUtility(page, 'calculator');
  const secondCalculator = await openUtility(page, 'calculator');
  await expect(page.locator('.app-window[data-type="calculator"]')).toHaveCount(2);
  await chooseCalculatorMode(firstCalculator, 'Graph');
  await chooseCalculatorMode(secondCalculator, 'Graph');

  await firstCalculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = firstCalculator.getByRole('dialog', { name: 'Graph settings' });
  const graphMode = settings.getByRole('combobox', { name: 'Graph mode' });
  await graphMode.click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByLabel('Minimum theta').fill('-2');
  await settings.getByLabel('Maximum theta').fill('8');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(secondCalculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect(secondCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -2 to 8/);

  await firstCalculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = firstCalculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.locator('.note-color-choice[data-note-color="orange"]').click();
  await editor.getByRole('button', { name: 'New function' }).click();
  await editor.getByLabel('Function expression').fill('cos(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();

  await openGraphInfo(secondCalculator);
  await expect(secondCalculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(secondCalculator.locator('.calc-function-summary').first()).toContainText('sin(theta)');
  await expect.poll(() => secondCalculator.locator('.calc-function-swatch').first()
    .evaluate(element => element.style.getPropertyValue('--function-color'))).toBe('#e47b27');
  await openGraphInfo(firstCalculator);
  await firstCalculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(secondCalculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);

  await secondCalculator.locator('.calc-graph-toolbar').click();
  await page.locator('#close-btn').click();
  const reopenedCalculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(reopenedCalculator, 'Graph');
  await expect(reopenedCalculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await openGraphInfo(reopenedCalculator);
  await expect(reopenedCalculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(reopenedCalculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);
  await expect(reopenedCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -2 to 8/);
});

test('calculator graph changes stay in sync across browser tabs', async ({ page }) => {
  const firstCalculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(firstCalculator, 'Graph');

  const secondPage = await page.context().newPage();
  await secondPage.goto('/');
  await secondPage.locator('#welcome-win-close').click();
  const secondCalculator = await openUtility(secondPage, 'calculator');
  await chooseCalculatorMode(secondCalculator, 'Graph');

  await firstCalculator.getByRole('button', { name: 'Graph settings' }).click();
  const firstSettings = firstCalculator.getByRole('dialog', { name: 'Graph settings' });
  const firstMode = firstSettings.getByRole('combobox', { name: 'Graph mode' });
  await firstMode.click();
  await firstSettings.getByRole('option', { name: /Polar/ }).click();
  await firstSettings.getByLabel('Minimum theta').fill('-2');
  await firstSettings.getByLabel('Maximum theta').fill('8');
  await firstSettings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(secondCalculator.locator('.calc-mode-label')).toHaveText('POLAR');
  await expect(secondCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -2 to 8/);

  await firstCalculator.getByRole('button', { name: 'Edit functions' }).click();
  const editor = firstCalculator.getByRole('dialog', { name: 'Edit functions' });
  await editor.getByLabel('Function expression').fill('sin(theta)');
  await editor.getByRole('button', { name: 'New function' }).click();
  await editor.getByLabel('Function expression').fill('cos(theta)');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();

  await openGraphInfo(secondCalculator);
  await expect(secondCalculator.locator('.calc-function-item')).toHaveCount(2);
  await expect(secondCalculator.locator('.calc-function-summary').first()).toContainText('sin(theta)');
  await openGraphInfo(firstCalculator);
  await firstCalculator.getByRole('button', { name: /Hide function/ }).first().click();
  await expect(secondCalculator.locator('.calc-function-toggle[aria-pressed="false"]')).toHaveCount(1);

  await secondCalculator.getByRole('button', { name: 'Graph settings' }).click();
  const secondSettings = secondCalculator.getByRole('dialog', { name: 'Graph settings' });
  await secondSettings.getByLabel('Minimum theta').fill('-3');
  await secondSettings.getByLabel('Maximum theta').fill('9');
  await secondSettings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(firstCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -3 to 9/);

  await expect(secondCalculator.locator('.calc-plot-area')).toHaveAttribute('aria-valuetext', /theta -3 to 9/);

  await firstCalculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await secondCalculator.getByRole('button', { name: 'Plot', exact: true }).click();
  await expect(firstCalculator.locator('.calc-graph-line')).toHaveCount(1);
  await expect(secondCalculator.locator('.calc-graph-line')).toHaveCount(1);
});

test('calculator function editor blocks stale drafts and can reload a newer graph', async ({ page }) => {
  const firstCalculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(firstCalculator, 'Graph');
  const secondPage = await page.context().newPage();
  await secondPage.goto('/');
  await secondPage.locator('#welcome-win-close').click();
  const secondCalculator = await openUtility(secondPage, 'calculator');
  await chooseCalculatorMode(secondCalculator, 'Graph');

  await firstCalculator.getByRole('button', { name: 'Edit functions' }).click();
  const firstEditor = firstCalculator.getByRole('dialog', { name: 'Edit functions' });
  const firstExpression = firstEditor.getByRole('textbox', { name: 'Function expression' });
  await firstExpression.fill('sin(x)');

  await secondCalculator.getByRole('button', { name: 'Edit functions' }).click();
  const secondEditor = secondCalculator.getByRole('dialog', { name: 'Edit functions' });
  await secondEditor.getByRole('textbox', { name: 'Function expression' }).fill('cos(x)');
  await secondEditor.getByRole('button', { name: 'Apply', exact: true }).click();

  const conflict = firstEditor.locator('.calc-editor-conflict');
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText('A newer graph was saved in another calculator');
  await expect(conflict).toContainText('Reloading the latest graph will discard this unsaved draft');
  await expect(firstExpression).toHaveValue('sin(x)');
  await expect(firstEditor.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1') || 'null');
    return saved?.functionsByMode?.cartesian?.map(fn => fn.expression);
  })).toEqual(['cos(x)']);

  await conflict.getByRole('button', { name: 'Reload latest graph' }).click();
  await expect(conflict).toBeHidden();
  await expect(firstExpression).toHaveValue('cos(x)');
  await expect(firstEditor.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await firstEditor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1') || 'null');
    return saved?.functionsByMode?.cartesian?.map(fn => fn.expression);
  })).toEqual(['cos(x)']);

  await firstCalculator.getByRole('button', { name: 'Edit functions' }).click();
  await expect(firstEditor).toBeVisible();
  await firstExpression.fill('tan(x)');
  await page.evaluate(() => {
    const key = 'personal-desktop-calculator-graph-v1';
    const saved = JSON.parse(localStorage.getItem(key));
    saved.functionsByMode.cartesian[0].expression = 'x^2';
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await firstEditor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(conflict).toBeVisible();
  await expect(firstExpression).toHaveValue('tan(x)');
  await expect(firstEditor.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1') || 'null');
    return saved?.functionsByMode?.cartesian?.map(fn => fn.expression);
  })).toEqual(['x^2']);
  await conflict.getByRole('button', { name: 'Reload latest graph' }).click();
  await expect(firstExpression).toHaveValue('x^2');
});

test('calculator safely resets malformed or outdated saved graph settings', async ({ page }) => {
  for (const saved of ['{broken', JSON.stringify({ version: 0, graphMode: 'cartesian' })]) {
    await page.evaluate(value => localStorage.setItem('personal-desktop-calculator-graph-v1', value), saved);
    const calculator = await openUtility(page, 'calculator');
    await chooseCalculatorMode(calculator, 'Graph');
    const recovery = calculator.locator('.calc-storage-recovery');
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('Defaults are active.');
    await recovery.getByRole('button', { name: 'Reset saved graph' }).click();
    await expect(recovery).toBeHidden();
    await expect(calculator.locator('.calc-function-item')).toHaveCount(0);
    await expect(calculator.locator('.calc-mode-label')).toHaveText('CARTESIAN');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('personal-desktop-calculator-graph-v1'))).toBeNull();
    await page.locator('#close-btn').click();
  }
});

test('calculator keeps graph recovery available when clearing saved settings is blocked', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'personal-desktop-calculator-graph-v1';
    localStorage.setItem(key, '{broken');
    const originalRemoveItem = Storage.prototype.removeItem;
    window.__graphRemoveAccess = { blocked: true, originalRemoveItem };
    Storage.prototype.removeItem = function (name) {
      if (window.__graphRemoveAccess.blocked &&
          (name === key || name.startsWith('desktop-data-backup-v1:'))) {
        throw new DOMException('Storage removal is blocked', 'SecurityError');
      }
      return originalRemoveItem.call(this, name);
    };
  });

  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const recovery = calculator.locator('.calc-storage-recovery');
  const warning = calculator.locator('.calc-storage-warning');
  await expect(recovery).toBeVisible();
  await recovery.getByRole('button', { name: 'Reset saved graph' }).click();

  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('could not be cleared');
  await expect(warning).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem('personal-desktop-calculator-graph-v1')
  )).toBe('{broken');

  await page.evaluate(() => { window.__graphRemoveAccess.blocked = false; });
  await recovery.getByRole('button', { name: 'Reset saved graph' }).click();
  await expect(recovery).toBeHidden();
  await expect(warning).toBeHidden();
  await expect(calculator.locator('.calc-graph-status')).toContainText('Saved graph reset to defaults.');
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem('personal-desktop-calculator-graph-v1')
  )).toBeNull();

  await page.evaluate(() => {
    Storage.prototype.removeItem = window.__graphRemoveAccess.originalRemoveItem;
    delete window.__graphRemoveAccess;
  });
});

test('calculator keeps graph storage warnings visible until settings save successfully', async ({ page }) => {
  await page.evaluate(() => {
    window.__graphStorageAccess = { readBlocked: true, writeBlocked: false };
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'personal-desktop-calculator-graph-v1' && window.__graphStorageAccess.readBlocked) {
        throw new DOMException('Storage access is blocked', 'SecurityError');
      }
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'personal-desktop-calculator-graph-v1' && window.__graphStorageAccess.writeBlocked) {
        throw new DOMException('Storage is full', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const warning = calculator.locator('.calc-storage-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('could not read saved graph settings');

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  await calculator.getByRole('button', { name: 'Apply settings' }).click();
  await expect(warning).toBeHidden();

  await page.evaluate(() => {
    window.__graphStorageAccess.readBlocked = false;
    window.__graphStorageAccess.writeBlocked = true;
  });
  await calculator.getByRole('button', { name: 'Zoom in' }).click();
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('could not be saved');
  await calculator.getByRole('button', { name: 'Plot' }).click();
  await expect(warning).toBeVisible();

  await page.evaluate(() => { window.__graphStorageAccess.writeBlocked = false; });
  await calculator.getByRole('button', { name: 'Zoom in' }).click();
  await expect(warning).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1') || 'null')?.version
  )).toBe(2);
});

test('calculator graph zoom and pan work in every mode without changing configured ranges', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const plot = calculator.locator('.calc-plot-area');
  const view = async () => plot.evaluate(element => JSON.parse(element.dataset.view));
  await expect(plot).toHaveAttribute('aria-valuetext', 'x -10 to 10, y -10 to 10');
  await expect(plot.locator('.calc-graph-grid').first()).toBeVisible();
  await expect(plot.locator('.calc-graph-label').first()).toBeVisible();
  const cartesianInitial = await view();
  const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => {
    const current = await view();
    return current.xMax - current.xMin;
  }).toBeLessThan(cartesianInitial.xMax - cartesianInitial.xMin);

  const beforeDrag = await view();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2 + 18);
  await page.mouse.up();
  await expect.poll(async () => (await view()).xMin).not.toBe(beforeDrag.xMin);

  await plot.focus();
  const beforeKeyboardPan = await view();
  const expression = await calculator.locator('.calc-expression').inputValue();
  await plot.press('ArrowRight');
  await expect.poll(async () => (await view()).xMin).not.toBe(beforeKeyboardPan.xMin);
  const beforeKeyboardZoom = await view();
  await plot.press('Shift+=');
  await expect.poll(async () => (await view()).xMax - (await view()).xMin)
    .toBeLessThan(beforeKeyboardZoom.xMax - beforeKeyboardZoom.xMin);
  await expect(calculator.locator('.calc-expression')).toHaveValue(expression);
  await plot.press('Home');
  await expect.poll(view).toEqual(cartesianInitial);

  await plot.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const fire = (type, id, x, y) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', button: 0,
      clientX: rect.left + x / 640 * rect.width, clientY: rect.top + y / 400 * rect.height,
    }));
    fire('pointerdown', 41, 260, 200);
    fire('pointerdown', 42, 380, 200);
    fire('pointermove', 42, 420, 200);
    fire('pointerup', 41, 260, 200);
    fire('pointerup', 42, 420, 200);
  });
  await expect.poll(async () => (await view()).xMax - (await view()).xMin)
    .toBeLessThan(cartesianInitial.xMax - cartesianInitial.xMin);
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual(cartesianInitial);
  await plot.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const fire = (type, x) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 43, pointerType: 'touch', button: 0,
      clientX: rect.left + x / 640 * rect.width, clientY: rect.top + rect.height / 2,
    }));
    fire('pointerdown', 300);
    fire('pointermove', 340);
    fire('pointerup', 340);
  });
  await expect.poll(async () => (await view()).xMin).not.toBe(cartesianInitial.xMin);
  await clickGraphMenuAction(calculator, 'View', 'Reset view');
  await expect.poll(view).toEqual(cartesianInitial);

  for (const [mode, label, xMin, xMax, yMin, yMax] of [
    ['polar', /Polar/, 'Minimum theta', 'Maximum theta', 'Minimum r', 'Maximum r'],
    ['parametric', /Parametric/, 'Minimum t', 'Maximum t', 'Minimum x', 'Maximum x'],
  ]) {
    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
    await settings.getByRole('combobox', { name: 'Graph mode' }).click();
    await settings.getByRole('option', { name: label }).click();
    await settings.getByRole('button', { name: 'Apply settings' }).click();
    const configured = await view();
    await calculator.getByRole('button', { name: 'Zoom in' }).click();
    const zoomed = await view();
    expect(JSON.stringify(zoomed)).not.toBe(JSON.stringify(configured));
    await clickGraphMenuAction(calculator, 'View', 'Reset view');
    await expect.poll(view).toEqual(configured);
    const beforeWheelZoom = await view();
    const modeBox = await plot.boundingBox();
    await page.mouse.move(modeBox.x + modeBox.width / 2, modeBox.y + modeBox.height / 2);
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => JSON.stringify(await view())).not.toBe(JSON.stringify(beforeWheelZoom));
    await clickGraphMenuAction(calculator, 'View', 'Reset view');
    await expect.poll(view).toEqual(configured);
    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const rangeDialog = calculator.getByRole('dialog', { name: 'Graph settings' });
    await expect(rangeDialog.getByLabel(xMin)).toHaveValue('0');
    await expect(rangeDialog.getByLabel(xMax)).toHaveValue('6.283');
    if (mode === 'polar') {
      await expect(rangeDialog.getByLabel(yMin)).toHaveValue('0');
      await expect(rangeDialog.getByLabel(yMax)).toHaveValue('10');
    } else {
      await expect(rangeDialog.getByLabel(yMin)).toHaveValue('-10');
      await expect(rangeDialog.getByLabel(yMax)).toHaveValue('10');
    }
    await rangeDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('calculator graph settings control axis labels, axis lines, grid styles, and spacing', async ({ page }) => {
  let calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  let plot = calculator.locator('.calc-plot-area');
  const defaultLabelCount = await plot.locator('.calc-graph-label').count();
  const chooseSetting = async (settingsDialog, label, option) => {
    const trigger = settingsDialog.getByRole('combobox', { name: label });
    await trigger.click();
    const popupId = await trigger.getAttribute('aria-controls');
    await page.locator(`#${popupId}`).getByRole('option', { name: option, exact: true }).click();
  };

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  let settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await chooseSetting(settings, 'Grid spacing', 'Fine');
  await chooseSetting(settings, 'Grid style', 'Dotted lines');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(plot).toHaveAttribute('data-grid-style', 'dotted');
  await expect(plot.locator('.calc-graph-grid')).not.toHaveCount(0);
  await expect(plot.locator('.calc-graph-axis-x')).toHaveCount(1);
  await expect(plot.locator('.calc-graph-axis-y')).toHaveCount(1);
  const axisNamePositions = await plot.evaluate(element => ({
    xLabelY: Number(element.querySelector('.calc-graph-axis-name-x').getAttribute('y')),
    xAxisY: Number(element.querySelector('.calc-graph-axis-x').getAttribute('d').match(/M[\d.]+ ([\d.]+)/)[1]),
    yLabelX: Number(element.querySelector('.calc-graph-axis-name-y').getAttribute('x')),
    yAxisX: Number(element.querySelector('.calc-graph-axis-y').getAttribute('d').match(/M([\d.]+)/)[1]),
  }));
  expect(axisNamePositions.xLabelY).toBeLessThan(axisNamePositions.xAxisY);
  expect(axisNamePositions.yLabelX).toBeGreaterThan(axisNamePositions.yAxisX);
  expect(await plot.locator('.calc-graph-label').count()).toBeGreaterThan(defaultLabelCount);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await chooseSetting(settings, 'Grid style', 'No grid');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(plot).toHaveAttribute('data-grid-style', 'none');
  await expect(plot.locator('.calc-graph-grid')).toHaveCount(0);
  expect(await plot.locator('.calc-graph-label').count()).toBeGreaterThan(0);
  await expect(plot.locator('.calc-graph-axis-x')).toHaveCount(1);
  await expect(plot.locator('.calc-graph-axis-y')).toHaveCount(1);

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByLabel('Show axis labels').uncheck();
  await settings.getByLabel('Show X-axis line').uncheck();
  await settings.getByLabel('Show Y-axis line').uncheck();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect(plot).toHaveAttribute('data-grid-style', 'none');
  await expect(plot.locator('.calc-graph-grid')).toHaveCount(0);
  await expect(plot.locator('.calc-graph-label')).toHaveCount(0);
  await expect(plot.locator('.calc-graph-axis')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1')).display
  )).toEqual({
    axisLabels: false,
    xAxisLine: false,
    yAxisLine: false,
    gridStyle: 'none',
    gridSpacing: 'fine',
  });

  await page.locator('#close-btn').click();
  calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  plot = calculator.locator('.calc-plot-area');
  await expect(plot).toHaveAttribute('data-grid-style', 'none');
  await expect(plot.locator('.calc-graph-label')).toHaveCount(0);
  await expect(plot.locator('.calc-graph-axis')).toHaveCount(0);
  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await expect(settings.getByLabel('Show axis labels')).not.toBeChecked();
  await expect(settings.getByRole('combobox', { name: 'Grid style' })).toHaveAttribute('data-value', 'none');
  await expect(settings.getByRole('combobox', { name: 'Grid spacing' })).toHaveAttribute('data-value', 'fine');
});

test('polar graph radial numbers appear below the theta axis', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await setGraphPlotMode(page, calculator, 'polar');
  const plot = calculator.locator('.calc-plot-area');
  const positions = await plot.evaluate(element => ({
    thetaY: Number(element.querySelector('.calc-graph-axis-name-theta').getAttribute('y')),
    radialY: [...element.querySelectorAll('.calc-graph-radial-label')]
      .map(label => Number(label.getAttribute('y'))),
  }));

  expect(positions.radialY.length).toBeGreaterThan(0);
  expect(positions.thetaY).toBeLessThan(200);
  expect(positions.radialY.every(y => y > 200)).toBe(true);
});

test('calculator View controls apply transient graph ratios and keep Polar square', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const plot = calculator.locator('.calc-plot-area');
  const viewTrigger = calculator.getByRole('button', { name: 'View', exact: true });
  const initialView = await plot.evaluate(element => JSON.parse(element.dataset.view));

  await viewTrigger.click();
  const viewPanel = calculator.getByRole('dialog', { name: 'Graph view options' });
  const itemAfterDivider = await viewPanel.locator('.calc-menu-divider').evaluate(element => element.nextElementSibling.textContent);
  expect(itemAfterDivider).toBe('Reset view');
  await expect(viewPanel.getByRole('button').last()).toHaveText('Reset view');
  await viewPanel.getByRole('button', { name: '1:1', exact: true }).click();
  await expect(plot).toHaveAttribute('data-view-ratio', '1:1');
  await expect(plot).toHaveAttribute('data-view', JSON.stringify(initialView));
  await viewPanel.getByRole('button', { name: '2:1', exact: true }).click();
  await expect(plot).toHaveAttribute('data-view-ratio', '2:1');
  await viewPanel.getByRole('button', { name: '2×', exact: true }).click();
  await expect(plot).toHaveAttribute('data-scale-factor', '2');
  await expect(plot).toHaveAttribute('data-view', JSON.stringify(initialView));
  await page.keyboard.press('Escape');
  await expect(viewTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(viewTrigger).toBeFocused();

  const savedSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-desktop-calculator-graph-v1') || '{}'));
  expect(savedSettings).not.toHaveProperty('viewRatio');
  expect(savedSettings).not.toHaveProperty('viewScaleFactor');

  await calculator.getByRole('button', { name: 'Graph settings' }).click();
  const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Polar/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await calculator.getByRole('button', { name: 'Edit functions' }).click();
  const polarEditor = calculator.getByRole('dialog', { name: 'Edit functions' });
  await polarEditor.getByLabel('Function expression').fill('sin(theta)');
  await polarEditor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(plot).toHaveAttribute('preserveAspectRatio', 'none');
  await expect(plot).toHaveAttribute('data-view-ratio', '1:1');

  await viewTrigger.click();
  await expect(viewPanel.getByRole('button', { name: '1:1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewPanel.getByRole('button', { name: '2:1', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');

  const circle = plot.locator('ellipse.calc-graph-grid').last();
  for (const size of [{ width: 940, height: 540 }, { width: 620, height: 680 }]) {
    await calculator.evaluate((element, dimensions) => {
      element.style.width = `${dimensions.width}px`;
      element.style.height = `${dimensions.height}px`;
    }, size);
    await expect.poll(async () => {
      const box = await circle.boundingBox();
      return box ? Math.abs(box.width - box.height) : Number.POSITIVE_INFINITY;
    }).toBeLessThan(1);
  }
});

test('calculator shows and copies the current view ranges in every graph mode', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const plot = calculator.locator('.calc-plot-area');
  const rangesReadout = calculator.locator('.calc-view-ranges-values');
  const copyButton = calculator.getByRole('button', { name: 'Copy ranges' });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copiedGraphRanges = text; } },
    });
  });

  const modes = [
    { name: 'Cartesian', keys: ['xMin', 'xMax', 'yMin', 'yMax'], mins: ['Minimum x', 'Minimum y'], maxes: ['Maximum x', 'Maximum y'] },
    { name: 'Polar', keys: ['thetaMin', 'thetaMax', 'rMin', 'rMax'], mins: ['Minimum theta', 'Minimum r'], maxes: ['Maximum theta', 'Maximum r'] },
    { name: 'Parametric', keys: ['tMin', 'tMax', 'xMin', 'xMax', 'yMin', 'yMax'], mins: ['Minimum t', 'Minimum x', 'Minimum y'], maxes: ['Maximum t', 'Maximum x', 'Maximum y'] },
  ];

  for (const [index, mode] of modes.entries()) {
    if (index > 0) {
      const settings = calculator.getByRole('button', { name: 'Graph settings' });
      await settings.click();
      const dialog = calculator.getByRole('dialog', { name: 'Graph settings' });
      await dialog.getByRole('combobox', { name: 'Graph mode' }).click();
      await dialog.getByRole('option', { name: new RegExp(mode.name) }).click();
      await dialog.getByRole('button', { name: 'Apply settings' }).click();
    }

    const configured = await plot.evaluate(element => JSON.parse(element.dataset.view));
    const initialText = await rangesReadout.inputValue();
    for (const key of mode.keys) expect(initialText).toContain(`${key}: ${configured[key]}`);

    await calculator.getByRole('button', { name: 'Zoom in' }).click();
    const current = await plot.evaluate(element => JSON.parse(element.dataset.view));
    expect(JSON.stringify(current)).not.toBe(JSON.stringify(configured));
    const currentText = await rangesReadout.inputValue();
    for (const key of mode.keys) expect(currentText).toContain(`${key}: ${current[key]}`);

    await calculator.getByRole('button', { name: 'Setup', exact: true }).click();
    if (index === 1) {
      await copyButton.focus();
      await copyButton.press('Enter');
    } else {
      await copyButton.click();
    }
    await expect.poll(() => page.evaluate(() => window.__copiedGraphRanges)).toBe(currentText);
    await expect(calculator.locator('.calc-copy-view-ranges-status')).toHaveText('Current graph ranges copied.');

    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const dialog = calculator.getByRole('dialog', { name: 'Graph settings' });
    for (const [position, label] of mode.mins.entries()) {
      await expect(dialog.getByLabel(label)).toHaveValue(String(configured[mode.keys[position * 2]]));
      await expect(dialog.getByLabel(mode.maxes[position])).toHaveValue(String(configured[mode.keys[position * 2 + 1]]));
    }
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await clickGraphMenuAction(calculator, 'View', 'Reset view');
  }
});

test('calculator copies and explicitly restores complete graph setups in every mode', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copiedGraphSetup = text; } },
    });
  });

  const modes = [
    {
      name: 'Cartesian',
      mode: 'cartesian',
      ranges: { xMin: '-4', xMax: '4', yMin: '-6', yMax: '6' },
      expression: '2*x+1',
      summary: 'y = 2*x+1',
    },
    {
      name: 'Polar',
      mode: 'polar',
      ranges: { thetaMin: '0', thetaMax: '6.2', rMin: '0', rMax: '8' },
      expression: 'sin(theta)',
      summary: 'r(θ) = sin(theta)',
    },
    {
      name: 'Parametric',
      mode: 'parametric',
      ranges: { tMin: '0', tMax: '6.28', xMin: '-2', xMax: '2', yMin: '-3', yMax: '3' },
      xExpression: 'cos(2*t)',
      yExpression: 'sin(2*t)',
      summary: 'x(t)=cos(2*t) · y(t)=sin(2*t)',
    },
  ];

  for (const [index, mode] of modes.entries()) {
    const settingsButton = calculator.getByRole('button', { name: 'Graph settings' });
    await settingsButton.click();
    const settings = calculator.getByRole('dialog', { name: 'Graph settings' });
    await settings.getByRole('combobox', { name: 'Graph mode' }).click();
    await settings.getByRole('option', { name: new RegExp(mode.name) }).click();
    for (const [key, value] of Object.entries(mode.ranges)) {
      const labels = {
        xMin: 'Minimum x', xMax: 'Maximum x', yMin: 'Minimum y', yMax: 'Maximum y',
        thetaMin: 'Minimum theta', thetaMax: 'Maximum theta', rMin: 'Minimum r', rMax: 'Maximum r',
        tMin: 'Minimum t', tMax: 'Maximum t',
      };
      await settings.getByLabel(labels[key]).fill(value);
    }
    await settings.getByRole('button', { name: 'Apply settings' }).click();

    await calculator.getByRole('button', { name: 'Edit functions' }).click();
    const editor = calculator.getByRole('dialog', { name: 'Edit functions' });
    if (mode.mode === 'parametric') {
      await editor.getByLabel('x(t)').fill(mode.xExpression);
      await editor.getByLabel('y(t)').fill(mode.yExpression);
    } else {
      await editor.getByLabel('Function expression').fill(mode.expression);
    }
    await editor.getByRole('button', { name: 'Apply', exact: true }).click();
    await calculator.getByRole('button', { name: 'Zoom in' }).click();

    const currentView = await calculator.locator('.calc-plot-area').evaluate(element => JSON.parse(element.dataset.view));
    const copySetup = calculator.getByRole('button', { name: 'Copy setup' });
    await calculator.getByRole('button', { name: 'Setup', exact: true }).click();
    if (index === 1) {
      await copySetup.focus();
      await copySetup.press('Enter');
    } else {
      await copySetup.click();
    }
    await expect.poll(() => page.evaluate(() => window.__copiedGraphSetup || '')).not.toBe('');
    const snippet = JSON.parse(await page.evaluate(() => window.__copiedGraphSetup));
    expect(snippet.format).toBe('replit-calculator-graph-setup');
    expect(snippet.version).toBe(1);
    expect(snippet.graphMode).toBe(mode.mode);
    expect(snippet.configuredRanges).toEqual(mode.ranges);
    expect(snippet.currentViewRanges).toEqual(currentView);
    expect(snippet.functions).toHaveLength(1);
    if (mode.mode === 'parametric') {
      expect(snippet.functions[0].xExpression).toBe(mode.xExpression);
      expect(snippet.functions[0].yExpression).toBe(mode.yExpression);
    } else {
      expect(snippet.functions[0].expression).toBe(mode.expression);
    }

    const alternateMode = mode.mode === 'polar' ? 'cartesian' : 'polar';
    await settingsButton.click();
    const alternateSettings = calculator.getByRole('dialog', { name: 'Graph settings' });
    await alternateSettings.getByRole('combobox', { name: 'Graph mode' }).click();
    await alternateSettings.getByRole('option', { name: new RegExp(alternateMode === 'polar' ? 'Polar' : 'Cartesian') }).click();
    await alternateSettings.getByRole('button', { name: 'Apply settings' }).click();

    const snapshotBeforeRestore = await calculator.evaluate(element => ({
      mode: element.querySelector('.calc-mode-label').textContent,
      functions: [...element.querySelectorAll('.calc-function-summary')].map(item => item.textContent),
      view: JSON.parse(element.querySelector('.calc-plot-area').dataset.view),
    }));
    await clickGraphMenuAction(calculator, 'Setup', 'Restore setup');
    const restore = calculator.getByRole('dialog', { name: 'Restore graph setup' });
    const snippetField = restore.getByRole('textbox', { name: 'Graph setup snippet' });
    if (index === 0) {
      await snippetField.fill('not a setup');
      await restore.getByRole('button', { name: 'Review setup' }).click();
      await expect(restore.locator('.calc-setup-summary')).toContainText('not valid');
      await expect(restore.getByRole('button', { name: 'Apply setup' })).toBeHidden();
      expect(await calculator.evaluate(element => element.querySelector('.calc-mode-label').textContent)).toBe(snapshotBeforeRestore.mode);
    }
    await snippetField.fill(JSON.stringify(snippet));
    await restore.getByRole('button', { name: 'Review setup' }).click();
    await expect(restore.locator('.calc-setup-summary')).toContainText(`Ready to restore ${mode.mode} setup`);
    await expect(restore.locator('.calc-setup-summary')).toContainText('Applying replaces the active graph');
    const setupPreview = restore.locator('.calc-setup-preview');
    await expect(setupPreview).toBeVisible();
    await expect(setupPreview).toContainText(mode.mode);
    await expect(setupPreview).toContainText(mode.summary.replace('r(θ) = ', '').replace('y = ', '').replace('x(t)=', '').replace(' · y(t)=', '; y(t) = '));
    for (const [key, value] of Object.entries(mode.ranges)) {
      await expect(setupPreview).toContainText(`${key}: ${value}`);
    }
    await expect(restore.getByRole('button', { name: 'Apply setup' })).toBeVisible();
    expect(await calculator.evaluate(element => ({
      mode: element.querySelector('.calc-mode-label').textContent,
      functions: [...element.querySelectorAll('.calc-function-summary')].map(item => item.textContent),
      view: JSON.parse(element.querySelector('.calc-plot-area').dataset.view),
    }))).toEqual(snapshotBeforeRestore);

    await restore.getByRole('button', { name: 'Apply setup' }).click();
    await expect(calculator.locator('.calc-mode-label')).toHaveText(mode.mode.toUpperCase());
    await expect(calculator.locator('.calc-function-summary')).toHaveText(mode.summary);
    await expect(calculator.locator('.calc-plot-area')).toHaveAttribute('data-view', JSON.stringify(currentView));
    await expect(calculator.locator('.calc-graph-status')).toContainText(`Restored ${mode.mode} graph setup`);

    await calculator.getByRole('button', { name: 'Graph settings' }).click();
    const restoredSettings = calculator.getByRole('dialog', { name: 'Graph settings' });
    for (const [key, value] of Object.entries(mode.ranges)) {
      const labels = {
        xMin: 'Minimum x', xMax: 'Maximum x', yMin: 'Minimum y', yMax: 'Maximum y',
        thetaMin: 'Minimum theta', thetaMax: 'Maximum theta', rMin: 'Minimum r', rMax: 'Maximum r',
        tMin: 'Minimum t', tMax: 'Maximum t',
      };
      await expect(restoredSettings.getByLabel(labels[key])).toHaveValue(value);
    }
    await restoredSettings.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});

test('calculator exposes the complete setup for manual copying when clipboard access fails', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('Clipboard denied'); } },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
  });

  await clickGraphMenuAction(calculator, 'Setup', 'Copy setup');
  await expect(calculator.locator('.calc-copy-setup-status'))
    .toHaveText('Could not copy the setup. The snippet is open for manual copying.');
  const restore = calculator.getByRole('dialog', { name: 'Restore graph setup' });
  const setupField = restore.getByRole('textbox', { name: 'Graph setup snippet' });
  await expect(setupField).toHaveValue(/"format": "replit-calculator-graph-setup"/);
  const selected = await setupField.evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd));
  expect(selected).toBe(await setupField.inputValue());
});

test('calculator keeps graph ranges selectable when clipboard access is blocked', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const values = calculator.locator('.calc-view-ranges-values');
  const copyButton = calculator.getByRole('button', { name: 'Copy ranges' });

  for (const clipboardMode of ['rejected', 'unavailable']) {
    await page.evaluate(mode => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: mode === 'rejected' ? { writeText: async () => { throw new Error('Clipboard denied'); } } : undefined,
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: () => false,
      });
    }, clipboardMode);

    await calculator.getByRole('button', { name: 'Setup', exact: true }).click();
    await copyButton.click();
    await expect(calculator.locator('.calc-copy-view-ranges-status'))
      .toHaveText('Could not copy the ranges. Select the values and copy them manually.');
    const selectedAfterFailure = await values.evaluate(element => ({
      value: element.value,
      selected: element.value.slice(element.selectionStart, element.selectionEnd),
      focused: document.activeElement === element,
    }));
    expect(selectedAfterFailure.selected).toBe(selectedAfterFailure.value);
    expect(selectedAfterFailure.focused).toBe(true);

    await values.click({ clickCount: 3 });
    const pointerSelection = await values.evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd));
    expect(pointerSelection.length).toBeGreaterThan(0);

    await values.focus();
    await values.press('Control+A');
    const keyboardSelection = await values.evaluate(element => element.value.slice(element.selectionStart, element.selectionEnd));
    expect(keyboardSelection).toBe(selectedAfterFailure.value);
  }
});

test('graph mode uses the window height without calculator panels or vertical overflow', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-display')).toBeHidden();
  await expect(calculator.locator('.calc-history')).toBeHidden();
  await expect(calculator.locator('.calc-plot-area')).toBeVisible();
  const dimensions = await calculator.locator('.calc').evaluate(element => ({
    client: element.clientHeight, scroll: element.scrollHeight,
    plotHeight: element.querySelector('.calc-plot-area').getBoundingClientRect().height,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 2);
  expect(dimensions.plotHeight).toBeGreaterThan(80);
});

test('scientific calculator controls fit in a short app window', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.evaluate(element => {
    element.style.height = '460px';
    element.style.flex = '0 0 460px';
  });
  await chooseCalculatorMode(calculator, 'Scientific');
  const dimensions = await calculator.locator('.calc-main').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const bottom = Math.max(
      element.querySelector('.calc-keys').getBoundingClientRect().bottom,
      element.querySelector('.calc-scientific').getBoundingClientRect().bottom,
    );
    return { client: element.clientHeight, scroll: element.scrollHeight, bottom, mainBottom: bounds.bottom };
  });
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 2);
  expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.mainBottom + 2);
});

test('basic and scientific calculator modes remain usable after graphing', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await calculator.getByRole('button', { name: '7', exact: true }).click();
  await calculator.getByRole('button', { name: '+', exact: true }).click();
  await calculator.getByRole('button', { name: '3', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('10');
  await chooseCalculatorMode(calculator, 'Scientific');
  await chooseCalculatorMode(calculator, 'Graph');
  await chooseCalculatorMode(calculator, 'Basic');
  await calculator.getByRole('button', { name: 'AC', exact: true }).click();
  await calculator.getByRole('button', { name: '6', exact: true }).click();
  await calculator.getByRole('button', { name: '×', exact: true }).click();
  await calculator.getByRole('button', { name: '7', exact: true }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('42');
  await chooseCalculatorMode(calculator, 'Scientific');
  await calculator.locator('.calc-science-key').filter({ hasText: '√(' }).click();
  await calculator.getByRole('button', { name: '9', exact: true }).click();
  await calculator.locator('.calc-science-key').filter({ hasText: ')' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.locator('.calc-value')).toHaveText('3');
});

test('calculator mode persists and editor fields include caret-aware backspace buttons', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  const backspace = calculator.locator('.calc-backspace');
  const backspaceMetrics = () => backspace.evaluate(button => {
    const input = button.parentElement.querySelector('.calc-expression');
    const style = getComputedStyle(button);
    return {
      width: style.width,
      boxSizing: style.boxSizing,
      inputPaddingRight: getComputedStyle(input).paddingRight,
      rightGap: Number((input.getBoundingClientRect().right - button.getBoundingClientRect().right).toFixed(2)),
      display: style.display,
      alignItems: style.alignItems,
      justifyItems: style.justifyItems,
    };
  });
  const expectedBackspaceMetrics = {
    width: '32px',
    boxSizing: 'border-box',
    inputPaddingRight: '32px',
    rightGap: 0,
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
  };
  await expect.poll(backspaceMetrics).toEqual(expectedBackspaceMetrics);

  await chooseCalculatorMode(calculator, 'Scientific');
  await expect(calculator.locator('.calc-mode-select .standard-select-trigger')).toHaveText('Scientific');
  await expect.poll(backspaceMetrics).toEqual(expectedBackspaceMetrics);

  await page.reload();
  const welcome = page.getByRole('button', { name: 'Get started', exact: true });
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  let restored = page.locator('.app-window[data-type="calculator"]').last();
  if (!await restored.count()) restored = await openUtility(page, 'calculator');
  await expect(restored.locator('.calc-mode-select .standard-select-trigger')).toHaveText('Scientific');

  await chooseCalculatorMode(restored, 'Graph');
  await restored.getByRole('button', { name: 'Graph settings' }).click();
  const settings = restored.getByRole('dialog', { name: 'Graph settings' });
  await settings.getByRole('combobox', { name: 'Graph mode' }).click();
  await settings.getByRole('option', { name: /Parametric/ }).click();
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await restored.getByRole('button', { name: 'Edit functions' }).click();
  const editor = restored.getByRole('dialog', { name: 'Edit functions' });
  const editorBackspaceStyle = await editor.getByRole('button', { name: 'Backspace first coordinate' }).evaluate(button => {
    const style = getComputedStyle(button);
    return {
      width: style.width,
      boxSizing: style.boxSizing,
      display: style.display,
      alignItems: style.alignItems,
      justifyItems: style.justifyItems,
    };
  });
  expect(editorBackspaceStyle).toEqual({
    width: '32px',
    boxSizing: 'border-box',
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
  });
  const xField = editor.getByRole('textbox', { name: 'x(t)' });
  const yField = editor.getByRole('textbox', { name: 'y(t)' });
  await xField.fill('cos(t)');
  await xField.focus();
  await xField.evaluate(element => element.setSelectionRange(element.value.length, element.value.length));
  await editor.getByRole('button', { name: 'Backspace first coordinate' }).click();
  await expect(xField).toHaveValue('cos(t');
  await yField.fill('sin(t)');
  await yField.focus();
  await yField.evaluate(element => element.setSelectionRange(element.value.length, element.value.length));
  await editor.getByRole('button', { name: 'Backspace second coordinate' }).click();
  await expect(yField).toHaveValue('sin(t');
});

test('calculator graph View supports custom axis ratios, scaling, and logarithmic axes', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  const plot = calculator.locator('.calc-plot-area');
  const view = calculator.getByRole('button', { name: 'View', exact: true });
  await view.click();
  const panel = calculator.getByRole('dialog', { name: 'Graph view options' });

  await panel.getByRole('button', { name: 'Custom…' }).first().click();
  await panel.getByLabel('Custom ratio X').fill('3');
  await panel.getByLabel('Custom ratio Y').fill('2');
  await panel.getByRole('button', { name: 'Apply', exact: true }).first().click();
  await expect(plot).toHaveAttribute('data-view-ratio', '3:2');
  const ratioGeometry = await plot.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const range = JSON.parse(element.dataset.renderedView);
    const pixelPerUnitX = (rect.width * 568 / 640) / (range.xMax - range.xMin);
    const pixelPerUnitY = (rect.height * 348 / 400) / (range.yMax - range.yMin);
    return pixelPerUnitX / pixelPerUnitY;
  });
  expect(ratioGeometry).toBeCloseTo(1.5, 2);

  await panel.getByRole('button', { name: 'Custom…' }).last().click();
  await panel.getByLabel('Custom scaling factor').fill('3.5');
  await panel.getByRole('button', { name: 'Apply', exact: true }).last().click();
  await expect(plot).toHaveAttribute('data-scale-factor', '3.5');
  await panel.getByRole('button', { name: 'Log X', exact: true }).click();
  await panel.getByRole('button', { name: 'Log Y', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Log X', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', { name: 'Log Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const logView = await plot.evaluate(element => JSON.parse(element.dataset.renderedView));
  expect(logView.xMin).toBeGreaterThan(0);
  expect(logView.yMin).toBeGreaterThan(0);
  await expect(plot.getByText('0.1', { exact: true })).toBeVisible();
  await expect(plot.locator('.calc-graph-grid')).toBeVisible();
});

test('calculator shows formatted view ranges in a right-anchored information popover', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await chooseCalculatorMode(calculator, 'Graph');
  await expect(calculator.locator('.calc-view-ranges')).toHaveCount(0);

  const trigger = calculator.getByRole('button', { name: 'Graph information' });
  const info = calculator.getByRole('dialog', { name: 'Current graph view' });
  await expect(info).toBeHidden();
  const [toolbarBox, triggerBox] = await Promise.all([
    calculator.locator('.calc-graph-toolbar').boundingBox(),
    trigger.boundingBox(),
  ]);
  expect(triggerBox.x + triggerBox.width / 2).toBeGreaterThan(toolbarBox.x + toolbarBox.width / 2);

  await trigger.click();
  await expect(info).toBeVisible();
  await expect(info.getByRole('heading', { name: 'Current graph view' })).toBeVisible();
  await expect(info.locator('.calc-info-mode')).toHaveText('Cartesian');
  await expect(info.locator('.calc-info-range')).toHaveCount(2);
  await expect(info.locator('[data-axis="xMin"] dd')).toHaveText('-10 – 10');
  await expect(info.locator('[data-axis="yMin"] dd')).toHaveText('-10 – 10');
  await expect(info.locator('.calc-info-ratio')).toHaveText('Auto');
  await expect(info.locator('.calc-info-scale')).toHaveText('1×');
  const [buttonBox, infoBox] = await Promise.all([trigger.boundingBox(), info.boundingBox()]);
  expect(Math.abs(buttonBox.x + buttonBox.width - infoBox.x - infoBox.width)).toBeLessThan(2);

  await page.keyboard.press('Escape');
  await expect(info).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('utility app layouts respond to their own narrow window width', async ({ page }) => {
  const calculator = await openUtility(page, 'calculator');
  await expect(calculator.locator('.calc-workspace')).toBeAttached();
  await calculator.evaluate(element => {
    element.style.width = '360px';
    element.style.flex = '0 0 360px';
  });
  await expect.poll(() => calculator.locator('.calc-workspace').evaluate(element => {
    const history = element.querySelector('.calc-history').getBoundingClientRect();
    const main = element.querySelector('.calc-main').getBoundingClientRect();
    return history.top > main.top;
  })).toBe(true);

  const calendar = await openUtility(page, 'calendar');
  await expect(calendar.locator('.cal-nav-button')).toHaveCount(2);
  await calendar.evaluate(element => {
    element.style.width = '320px';
    element.style.flex = '0 0 320px';
  });
  await expectFamilyStylesheet(page, 'utility-apps.css');
  await calendar.getByRole('button', { name: 'Week', exact: true }).click();
  await calendar.locator('.cal-weekend-control input').check();
  const columns = await calendar.locator('.cal-week-grid').evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
});

test('document viewer content and primary controls fit narrow windows', async ({ page }) => {
  const app = await openUtility(page, 'doc-viewer');
  await expectFamilyStylesheet(page, 'viewer-apps.css');
  const content = app.locator('.doc-scroll');
  const documentBody = app.locator('.doc-body');
  const browse = app.locator('.doc-toolbar [data-action="open"]');
  const zoomIn = app.locator('.doc-toolbar [data-action="zoom-in"]');
  await expect(content).toBeVisible();
  await expect(documentBody).toBeVisible();

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await setAppWindowWidth(app, 320);
    await expectInsideAppWindow(app, content);
    await expectInsideAppWindow(app, documentBody);
    await expectInsideAppWindow(app, browse);
    await expectInsideAppWindow(app, zoomIn);
  }
});

test('image viewer viewport and fit controls remain reachable in narrow windows', async ({ page }) => {
  const app = await openUtility(page, 'img-viewer');
  await expectFamilyStylesheet(page, 'viewer-apps.css');
  const viewport = app.locator('.img-viewport');
  const browse = app.locator('.img-toolbar [data-action="open"]');
  const fit = app.locator('.img-toolbar [data-action="fit"]');
  await expect(viewport).toBeVisible();

  for (const screen of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(screen);
    await setAppWindowWidth(app, 320);
    await expectInsideAppWindow(app, viewport);
    await expectInsideAppWindow(app, browse);
    await expectInsideAppWindow(app, fit);
  }
});

test('media player remains visible and video browsing stays reachable in narrow windows', async ({ page }) => {
  const app = await openUtility(page, 'media-player');
  await expectFamilyStylesheet(page, 'viewer-apps.css');
  const content = app.locator('.media-player-wrapper');
  const browse = app.locator('.media-toolbar [data-action="open"]');
  await expect(content).toBeVisible();
  await expect.poll(() => Promise.all([
    app.locator('.media-player-empty').isVisible(),
    app.locator('.media-video').isVisible(),
  ]).then(states => states.some(Boolean))).toBe(true);

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await setAppWindowWidth(app, 320);
    await expectInsideAppWindow(app, content);
    await expectInsideAppWindow(app, browse);
  }
});

test('Document Viewer can open and close a file from its compact browse list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockCompactViewerFiles(page);
  const app = await openUtility(page, 'doc-viewer');
  const browse = app.locator('.doc-toolbar [data-action="open"]');
  const zoomIn = app.locator('.doc-toolbar [data-action="zoom-in"]');
  const sidebar = app.locator('.doc-sidebar');
  await expect(sidebar.locator('.doc-sidebar-item')).toHaveCount(2);
  await expect(app.locator('.doc-body h1')).toHaveText('Compact First Document');
  await setAppWindowWidth(app, 320);

  await browse.click();
  await expect(sidebar).toBeVisible();
  const secondDocument = sidebar.locator('.doc-sidebar-item').filter({ hasText: 'Compact Second Document' });
  await expect(secondDocument).toBeVisible();
  await secondDocument.click();
  await expect(app.locator('.doc-body h1')).toHaveText('Compact Second Document');
  await expect(secondDocument).toHaveClass(/active/);
  await expect(secondDocument).toHaveAttribute('aria-current', 'true');
  await expect(sidebar.locator('.doc-sidebar-item').filter({ hasText: 'Compact First Document' }))
    .not.toHaveAttribute('aria-current', 'true');
  await expect(app.locator('.viewer-selection-status')).toHaveText('Selected document: Compact Second Document');
  await expectInsideAppWindow(app, browse);
  await expectInsideAppWindow(app, zoomIn);

  await browse.click();
  await expect(sidebar).toBeHidden();
  await expectInsideAppWindow(app, app.locator('.doc-scroll'));
  await expectInsideAppWindow(app, browse);
});

test('Image Viewer can select a photo from its compact browse list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockCompactViewerFiles(page);
  const app = await openUtility(page, 'img-viewer');
  const browse = app.locator('.img-toolbar [data-action="open"]');
  const fit = app.locator('.img-toolbar [data-action="fit"]');
  const sidebar = app.locator('.doc-sidebar');
  const viewport = app.locator('.img-viewport');
  const image = viewport.locator('img');
  await expect(sidebar.locator('.doc-sidebar-item')).toHaveCount(2);
  await expect(image).toHaveAttribute('src', '/files/pictures/compact-list-first.svg');
  await setAppWindowWidth(app, 320);

  await browse.click();
  await expect(sidebar).toBeVisible();
  const secondPhoto = sidebar.locator('.doc-sidebar-item').filter({ hasText: 'Compact Second Photo' });
  await expect(secondPhoto).toBeVisible();
  await secondPhoto.click();
  await expect(image).toHaveAttribute('src', '/files/pictures/compact-list-second.svg');
  await expect(image).toHaveAttribute('alt', 'Compact Second Photo');
  await expect(secondPhoto).toHaveClass(/active/);
  await expect(secondPhoto).toHaveAttribute('aria-current', 'true');
  await expect(sidebar.locator('.doc-sidebar-item').filter({ hasText: 'Compact First Photo' }))
    .not.toHaveAttribute('aria-current', 'true');
  await expect(app.locator('.img-thumbnail:has(img[src="/files/pictures/compact-list-second.svg"])'))
    .toHaveAttribute('aria-current', 'true');
  await expect(app.locator('.viewer-selection-status')).toHaveText('Selected picture: Compact Second Photo');
  await expectInsideAppWindow(app, viewport);
  await expectInsideAppWindow(app, browse);
  await expectInsideAppWindow(app, fit);

  await browse.click();
  await expect(sidebar).toBeHidden();
  await expectInsideAppWindow(app, viewport);
  await expectInsideAppWindow(app, browse);
  await expectInsideAppWindow(app, fit);
});

test('Media Player can select a video from its compact browse list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockCompactViewerFiles(page);
  const app = await openUtility(page, 'media-player');
  const browse = app.locator('.media-toolbar [data-action="open"]');
  const external = app.locator('.media-toolbar [data-action="external"]');
  const sidebar = app.locator('.doc-sidebar');
  const player = app.locator('.media-player-wrapper');
  const video = app.locator('.media-video');
  await expect(sidebar.locator('.doc-sidebar-item')).toHaveCount(2);
  await expect(video).toHaveAttribute('src', '/files/videos/compact-list-first.mp4');
  await setAppWindowWidth(app, 320);

  await browse.click();
  await expect(sidebar).toBeVisible();
  const secondVideo = sidebar.locator('.doc-sidebar-item').filter({ hasText: 'Compact Second Video' });
  await expect(secondVideo).toBeVisible();
  await secondVideo.click();
  await expect(video).toHaveAttribute('src', '/files/videos/compact-list-second.mp4');
  await expect(secondVideo).toHaveClass(/active/);
  await expect(secondVideo).toHaveAttribute('aria-current', 'true');
  await expect(sidebar.locator('.doc-sidebar-item').filter({ hasText: 'Compact First Video' }))
    .not.toHaveAttribute('aria-current', 'true');
  await expect(app.locator('.viewer-selection-status')).toHaveText('Selected video: Compact Second Video');
  await expectInsideAppWindow(app, player);
  await expectInsideAppWindow(app, browse);
  await expectInsideAppWindow(app, external);

  await browse.click();
  await expect(sidebar).toBeHidden();
  await expectInsideAppWindow(app, player);
  await expectInsideAppWindow(app, browse);
  await expectInsideAppWindow(app, external);
});

test.describe('compact viewer controls support keyboard and touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('Document Viewer browse and zoom controls work without page scrolling', async ({ page }) => {
    await mockCompactViewerFiles(page);
    const app = await openUtility(page, 'doc-viewer');
    await expect(app.locator('.doc-body h1')).toHaveText('Compact First Document');
    const browse = app.locator('.doc-toolbar [data-action="open"]');
    const zoomOut = app.locator('.doc-toolbar [data-action="zoom-out"]');
    const zoomIn = app.locator('.doc-toolbar [data-action="zoom-in"]');
    const sidebar = app.locator('.doc-sidebar');
    const zoomReadout = app.locator('.zoom-readout');

    await browse.focus();
    await page.keyboard.press('Space');
    await expect(sidebar).toBeVisible();
    await page.keyboard.press('Tab');
    await expectKeyboardFocus(zoomOut);
    await page.keyboard.press('Enter');
    await expect(zoomReadout).toHaveText('90%');
    await expectNoHorizontalPageScroll(page);

    await tapControl(page, browse);
    await expect(sidebar).toBeHidden();
    await tapControl(page, zoomIn);
    await expect(zoomReadout).toHaveText('100%');
    await expectNoHorizontalPageScroll(page);
  });

  test('Image Viewer browse and zoom controls work without page scrolling', async ({ page }) => {
    await mockCompactViewerFiles(page);
    const app = await openUtility(page, 'img-viewer');
    const image = app.locator('.img-viewport img');
    await expect(image).toHaveAttribute('src', '/files/pictures/compact-list-first.svg');
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);

    const browse = app.locator('.img-toolbar [data-action="open"]');
    const zoomIn = app.locator('.img-toolbar [data-action="zoom-in"]');
    const fit = app.locator('.img-toolbar [data-action="fit"]');
    const sidebar = app.locator('.doc-sidebar');
    const transform = app.locator('.img-transform');

    await browse.focus();
    await page.keyboard.press('Space');
    await expect(sidebar).toBeVisible();
    for (let index = 0; index < 6; index += 1) await page.keyboard.press('Tab');
    await expectKeyboardFocus(zoomIn);
    const keyboardTransform = await transform.getAttribute('style');
    await page.keyboard.press('Space');
    await expect.poll(() => transform.getAttribute('style')).not.toBe(keyboardTransform);
    await expectNoHorizontalPageScroll(page);

    await tapControl(page, browse);
    await expect(sidebar).toBeHidden();
    const touchTransform = await transform.getAttribute('style');
    await tapControl(page, fit);
    const fittedTouchTransform = await transform.getAttribute('style');
    expect(fittedTouchTransform).not.toBe(touchTransform);
    await tapControl(page, zoomIn);
    await expect.poll(() => transform.getAttribute('style')).not.toBe(fittedTouchTransform);
    await expectNoHorizontalPageScroll(page);
  });

  test('Media Player browse controls work with keyboard and touch without page scrolling', async ({ page }) => {
    await mockCompactViewerFiles(page);
    const app = await openUtility(page, 'media-player');
    await expect(app.locator('.media-video')).toHaveAttribute('src', '/files/videos/compact-list-first.mp4');
    const browse = app.locator('.media-toolbar [data-action="open"]');
    const external = app.locator('.media-toolbar [data-action="external"]');
    const sidebar = app.locator('.doc-sidebar');

    await browse.focus();
    await page.keyboard.press('Space');
    await expect(sidebar).toBeVisible();
    await page.keyboard.press('Tab');
    await expectKeyboardFocus(external);
    await page.keyboard.press('Shift+Tab');
    await expectKeyboardFocus(browse);
    await page.keyboard.press('Space');
    await expect(sidebar).toBeHidden();
    await expectNoHorizontalPageScroll(page);

    await tapControl(page, browse);
    await expect(sidebar).toBeVisible();
    await tapControl(page, browse);
    await expect(sidebar).toBeHidden();
    await expectNoHorizontalPageScroll(page);
  });

  test('File Manager view and refresh controls work with keyboard and touch without page scrolling', async ({ page }) => {
    await mockCompactViewerFiles(page);
    const app = await openUtility(page, 'file-manager');
    const tileView = app.locator('.fm-view-btn[data-view="tile"]');
    const listView = app.locator('.fm-view-btn[data-view="list"]');
    const refresh = app.locator('.fm-refresh-btn');
    const refreshStatus = app.locator('.fm-refresh-status');

    await listView.focus();
    await page.keyboard.press('Space');
    await expect(listView).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await expectKeyboardFocus(refresh);
    await page.keyboard.press('Enter');
    await expect(refreshStatus).toHaveText('Folder refreshed.');
    await expectNoHorizontalPageScroll(page);

    await tapControl(page, tileView);
    await expect(tileView).toHaveAttribute('aria-pressed', 'true');
    await tapControl(page, refresh);
    await expect(refreshStatus).toHaveText('Folder refreshed.');
    await expectNoHorizontalPageScroll(page);
  });
});

test('File Manager navigation, views, and refresh fit narrow windows', async ({ page }) => {
  const app = await openUtility(page, 'file-manager');
  await expectFamilyStylesheet(page, 'file-manager.css');
  const sidebar = app.locator('.fm-sidebar');
  const main = app.locator('.fm-main');
  const scroll = app.locator('.fm-scroll');
  const listView = app.locator('.fm-view-btn[data-view="list"]');
  const refresh = app.locator('.fm-refresh-btn');
  await expect(main).toBeVisible();
  await expect(scroll).toBeVisible();
  await expect(scroll.locator('.fm-tile').first()).toBeVisible();

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await setAppWindowWidth(app, 320);
    await expectInsideAppWindow(app, sidebar);
    await expectInsideAppWindow(app, main);
    await expectInsideAppWindow(app, listView);
    await expectInsideAppWindow(app, refresh);
    expect(await sidebar.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(60);
    await listView.click();
    await expect(listView).toHaveAttribute('aria-pressed', 'true');
    await expect(scroll.locator('.fm-list-row').first()).toBeVisible();
    expect(await scroll.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test('custom dropdown keeps working without Popover or CSS Anchor support', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: undefined });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: undefined });
    Object.defineProperty(CSS, 'supports', { configurable: true, value: () => false });
  });
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const weather = await openUtility(page, 'weather');
  const select = weather.locator('.weather-unit');
  const trigger = weather.getByRole('combobox', { name: 'Temperature units', exact: true });
  const popupId = await select.getAttribute('data-custom-select-popup');
  const popup = page.locator(`[id="${popupId}"]`);

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(popup).toBeVisible();
  await expect(popup).not.toHaveAttribute('popover');
  expect(await popup.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('data-value', 'fahrenheit');
  await expect(select).toHaveValue('fahrenheit');
});

test('top-bar menu and view toggles share the same active appearance', async ({ page }) => {
  const activeStyles = await page.evaluate(() => {
    const states = [
      ['app-menu-btn', 'aria-expanded'],
      ['win-menu-btn', 'aria-expanded'],
      ['show-desktop-btn', 'aria-pressed'],
      ['overview-btn', 'aria-pressed'],
    ];
    return states.map(([id, attribute]) => {
      const button = document.getElementById(id);
      button.setAttribute(attribute, 'true');
      const style = getComputedStyle(button);
      return { background: style.backgroundColor, color: style.color };
    });
  });
  expect(new Set(activeStyles.map(style => style.background)).size).toBe(1);
  expect(new Set(activeStyles.map(style => style.color)).size).toBe(1);
  expect(activeStyles[0].color).toBe('rgb(255, 255, 255)');
});

test('World Clock search suggestions remain attached and fit a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://geocoding-api.open-meteo.com/v1/search**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      results: [{
        name: 'Springfield',
        admin1: 'Illinois',
        country: 'United States',
        timezone: 'America/Chicago',
      }],
    }),
  }));
  const clock = await openUtility(page, 'world-clock');
  const search = clock.getByLabel('City or time zone');
  const suggestions = clock.getByRole('listbox', { name: 'Place suggestions' });
  await search.fill('Springfield');
  await expect(suggestions.getByRole('option')).toHaveCount(1);
  await expect(suggestions).toHaveClass(/menu-popover/);
  const panelStyles = await suggestions.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      backdrop: style.backdropFilter,
      border: style.borderColor,
      radius: style.borderRadius,
      shadow: style.boxShadow,
    };
  });
  expect(panelStyles.backdrop).toContain('blur(');
  expect(panelStyles.background).not.toBe('rgba(0, 0, 0, 0)');

  const [inputBox, popupBox] = await Promise.all([search.boundingBox(), suggestions.boundingBox()]);
  expect(Math.abs(popupBox.x - inputBox.x)).toBeLessThan(2);
  expect(popupBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(390);
});

test('sticky notes expose accessible color choices that adapt to the system theme', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('desktop-theme'));
  await page.emulateMedia({ colorScheme: 'light' });
  const notes = await openUtility(page, 'sticky-notes');
  await notes.locator('.note-create').click();

  const editor = notes.locator('.note-editor');
  const picker = editor.locator('.note-color-picker');
  const radios = picker.getByRole('radio');
  await expect(picker.locator('legend')).toHaveText('Background color');
  await expect(radios).toHaveCount(6);
  const yellow = picker.getByRole('radio', { name: 'Yellow note background' });
  await expect(yellow).toBeChecked();
  await yellow.focus();
  await page.keyboard.press('ArrowRight');
  await expect(picker.getByRole('radio', { name: 'Orange note background' })).toBeChecked();
  await notes.locator('.note-color-choice[data-note-color="purple"]').click();
  await expect(picker.getByRole('radio', { name: 'Purple note background' })).toBeChecked();
  await expect(editor).toHaveAttribute('data-note-color', 'purple');

  await notes.getByRole('textbox', { name: 'Note title' }).fill('Theme note');
  await notes.locator('.note-desktop-toggle input').check();
  const widget = page.locator('.desktop-note-widget');
  await expect(widget).toHaveAttribute('data-note-color', 'purple');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('personal-desktop-sticky-notes-v1') || '[]');
    return saved[0]?.color;
  })).toBe('purple');

  const lightColors = await editor.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  const lightWidgetBackground = await widget.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => editor.evaluate(element => getComputedStyle(element).backgroundColor))
    .not.toBe(lightColors.background);
  await expect.poll(() => widget.evaluate(element => getComputedStyle(element).backgroundColor))
    .not.toBe(lightWidgetBackground);
  const darkColors = await editor.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  expect(darkColors.text).not.toBe(lightColors.text);
  await expect(notes.locator('.note-select.active')).toHaveAttribute('aria-pressed', 'true');
});

test('desktop shell appearance baselines cover both themes at narrow and wide sizes', async ({ page }) => {
  await page.route('https://jeffreytackett.us/ssl/resources/scripts/random_picture.php', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#25485a"/></svg>',
    }),
  );
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const calculator = await openUtility(page, 'calculator');
  await expect(calculator.locator('.calc-keys')).toBeVisible();

  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      caret-color: transparent !important;
    }
    #system-time-btn { visibility: hidden !important; }
  ` });
  await page.evaluate(() => {
    document.body.style.backgroundImage = 'linear-gradient(135deg, #10283b 0%, #2e6473 100%)';
    document.body.style.backgroundColor = '#10283b';
    document.body.classList.remove('mod-overview', 'overview-exiting');
  });

  for (const viewport of [
    { name: 'wide', width: 1280, height: 800 },
    { name: 'narrow', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.evaluate(value => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await page.mouse.move(0, 0);
      await expect(calculator).toBeVisible();
      await expect(page).toHaveScreenshot(`desktop-shell-${viewport.name}-${theme}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      });
    }
  }
});
