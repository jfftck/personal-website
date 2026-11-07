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
const FOCUSABLE_CONTROL_SELECTOR = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
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

async function dragOverviewWindow(page, appId, dropSelector) {
  const handle = page.locator(`.ov-drag-handle[data-app-id="${appId}"]`);
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();

  const dropZone = page.locator(dropSelector);
  await expect(dropZone).toBeVisible();
  const dropBox = await dropZone.boundingBox();
  expect(dropBox).not.toBeNull();
  await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 8 });
  await expect(dropZone).toHaveClass(/active/);
  await page.mouse.up();
  await expect(page.locator('#overview-controls')).not.toHaveClass(/ov-dragging/);
}

test('browsing documents and photos saves the new selection and reloads both', async ({ page }) => {
  await seed(page, [{ type: 'doc-viewer' }, { type: 'img-viewer' }]);
  const doc = page.locator('[data-type="doc-viewer"].app-window');
  const image = page.locator('[data-type="img-viewer"].app-window');
  await expect(doc.locator('.doc-body')).toContainText('First document');
  await expect(page.getByRole('dialog', { name: 'First', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'One', exact: true })).toBeVisible();
  await doc.locator('[data-action="open"]').click();
  await doc.locator('.doc-sidebar-item').filter({ hasText: 'Second' }).click();
  await expect(doc.locator('.doc-body')).toContainText('Second document');
  await expect(page.getByRole('dialog', { name: 'Second', exact: true })).toBeVisible();
  await image.locator('[data-action="next"]').click();
  await expect(image.locator('.img-counter')).toHaveText('2 / 3');
  await expect(page.getByRole('dialog', { name: 'Two', exact: true })).toBeVisible();
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

test('document stylesheets are scoped to the document body', async ({ page }) => {
  await page.unroute('**/documents/manifest.json');
  await page.route('**/documents/manifest.json', route => route.fulfill({
    json: [{ ...docs[0], stylesheetUrl: '/documents/session-style.css' }],
  }));
  await page.route('**/documents/session-style.css', route => route.fulfill({
    contentType: 'text/css',
    body: 'html body { color: #123456; } h1, .note { color: #abcdef; } @media (min-width: 1px) { p { padding: 1rem; } }',
  }));
  await seed(page, [{ type: 'doc-viewer' }]);

  const stylesheet = page.locator('.doc-body style[data-document-stylesheet="true"]');
  await expect(stylesheet).toHaveCount(1);
  const scopedCss = await stylesheet.textContent();
  expect(scopedCss).toContain('.doc-body {');
  expect(scopedCss).toContain('.doc-body h1');
  expect(scopedCss).toContain('.doc-body .note');
  expect(scopedCss).toContain('.doc-body p');
});

test('the selected window remains focused after a page refresh', async ({ page }) => {
  await seed(page, [{ type: 'doc-viewer' }, { type: 'img-viewer' }]);
  const doc = page.locator('.app-window[data-type="doc-viewer"]');
  const image = page.locator('.app-window[data-type="img-viewer"]');
  await expect(doc.locator('.doc-body')).toContainText('First document');
  await doc.locator('.doc-body').click();
  await expect(doc).toHaveClass(/focused/);
  await expect(image).not.toHaveClass(/focused/);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).focused, KEY))
    .toEqual({ columnIndex: 0, appIndex: 0 });

  await page.reload();
  await page.locator('#welcome-win-close').click();
  const restoredDoc = page.locator('.app-window[data-type="doc-viewer"]');
  const restoredImage = page.locator('.app-window[data-type="img-viewer"]');
  await expect(restoredDoc).toHaveClass(/focused/);
  await expect(restoredImage).not.toHaveClass(/focused/);
});

test('Ctrl+D opens the app menu and Ctrl+number focuses windows at desktop and phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const session = {
      v: 2,
      focused: { columnIndex: 0, appIndex: 0 },
      columns: [{
        widthPreset: 'half',
        apps: [{ type: 'doc-viewer' }, { type: 'img-viewer' }],
      }],
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: KEY,
      value: session,
    });
    await page.reload();
    await page.locator('#welcome-win-close').click();
    const image = page.locator('.app-window[data-type="img-viewer"]');
    await page.locator('#overview-btn').focus();

    await page.keyboard.press('Control+d');
    await expect(page.locator('#app-menu-btn')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#app-menu-btn')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#app-menu-btn')).toBeFocused();

    await page.keyboard.press('Control+2');
    await expect(image).toHaveClass(/focused/);
    await expect.poll(async () => (
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
    )?.focused).toEqual({ columnIndex: 0, appIndex: 1 });
  }
});

test('Tab wraps within the focused window at desktop and phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const session = {
      v: 2,
      focused: { columnIndex: 0, appIndex: 0 },
      columns: [{ widthPreset: 'half', apps: [{ type: 'doc-viewer' }] }],
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: KEY,
      value: session,
    });
    await page.reload();
    await page.locator('#welcome-win-close').click();

    const doc = page.locator('.app-window[data-type="doc-viewer"]');
    await expect(doc.locator('.doc-body')).toContainText('First document');
    const controlCount = await doc.evaluate((app, selector) => {
      const controls = [...app.querySelectorAll(selector)].filter(element => (
        !element.disabled
        && !element.closest('[hidden], [inert], [aria-hidden="true"]')
        && getComputedStyle(element).visibility !== 'hidden'
        && element.getClientRects().length > 0
      ));
      controls.at(-1)?.focus();
      return controls.length;
    }, FOCUSABLE_CONTROL_SELECTOR);
    expect(controlCount).toBeGreaterThan(1);

    await page.keyboard.press('Tab');
    await expect.poll(() => doc.evaluate((app, selector) => {
      const controls = [...app.querySelectorAll(selector)].filter(element => (
        !element.disabled
        && !element.closest('[hidden], [inert], [aria-hidden="true"]')
        && getComputedStyle(element).visibility !== 'hidden'
        && element.getClientRects().length > 0
      ));
      return controls[0] === document.activeElement;
    }, FOCUSABLE_CONTROL_SELECTOR)).toBe(true);

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => doc.evaluate((app, selector) => {
      const controls = [...app.querySelectorAll(selector)].filter(element => (
        !element.disabled
        && !element.closest('[hidden], [inert], [aria-hidden="true"]')
        && getComputedStyle(element).visibility !== 'hidden'
        && element.getClientRects().length > 0
      ));
      return controls.at(-1) === document.activeElement;
    }, FOCUSABLE_CONTROL_SELECTOR)).toBe(true);
  }
});

test('closing the focused window focuses and saves the remaining window', async ({ page }) => {
  await seed(page, [{ type: 'doc-viewer' }, { type: 'img-viewer' }]);
  const doc = page.locator('.app-window[data-type="doc-viewer"]');
  const image = page.locator('.app-window[data-type="img-viewer"]');
  await expect(image.locator('.img-viewport img')).toHaveAttribute('src', pictures[0].url);
  await image.locator('.img-viewport img').click();
  await expect(image).toHaveClass(/focused/);

  await page.locator('#close-btn').click();
  await expect(image).toHaveCount(0);
  await expect(doc).toHaveClass(/focused/);
  await expect.poll(async () => (await savedApps(page)).map(app => app.type)).toEqual(['doc-viewer']);

  await page.reload();
  await page.locator('#welcome-win-close').click();
  await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveClass(/focused/);
  await expect(page.locator('.app-window[data-type="img-viewer"]')).toHaveCount(0);
});

test('window width presets persist on desktop and phone layouts', async ({ page }) => {
  await seed(page, [{ type: 'doc-viewer' }]);
  const column = page.locator('.app-col');

  for (const scenario of [
    { viewport: { width: 1280, height: 800 }, preset: 'third', label: '⅓ Width' },
    { viewport: { width: 390, height: 844 }, preset: 'half', label: '½ Width' },
    { viewport: { width: 1280, height: 800 }, preset: 'full', label: 'Full Width' },
  ]) {
    await page.setViewportSize(scenario.viewport);
    await page.getByRole('button', { name: 'Window options' }).click();
    await page.locator('#win-menu-open').getByRole('button', { name: scenario.label }).click();

    await expect(column).toHaveAttribute('data-width', scenario.preset);
    await expect(column).not.toHaveClass(/width-shrink|width-grow/);
    await expect.poll(async () => (
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
    )?.columns?.[0]?.widthPreset).toBe(scenario.preset);

    const geometry = await column.evaluate(element => ({
      width: element.getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
    }));
    if (scenario.viewport.width < 640) {
      expect(geometry.width).toBeGreaterThan(scenario.viewport.width - 16);
      expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    } else {
      expect(geometry.width).toBeGreaterThan(160);
      expect(geometry.width).toBeLessThan(geometry.viewportWidth);
    }
  }
});

test('Ctrl width shortcuts cycle presets and persist at desktop and phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const session = {
      v: 2,
      focused: { columnIndex: 0, appIndex: 0 },
      columns: [{ widthPreset: 'half', apps: [{ type: 'doc-viewer' }] }],
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: KEY,
      value: session,
    });
    await page.reload();
    await page.locator('#welcome-win-close').click();
    const column = page.locator('.app-col');
    await page.locator('#overview-btn').focus();

    await page.keyboard.press('Control+Shift+Comma');
    await expect(column).toHaveAttribute('data-width', 'third');
    await page.keyboard.press('Control+Shift+Period');
    await expect(column).toHaveAttribute('data-width', 'half');
    await page.keyboard.press('Control+Shift+Period');
    await expect(column).toHaveAttribute('data-width', 'full');

    await expect.poll(async () => (
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
    )?.columns?.[0]?.widthPreset).toBe('full');
    await page.reload();
    await page.locator('#welcome-win-close').click();
    await expect(page.locator('.app-col')).toHaveAttribute('data-width', 'full');
  }
});

test('splitting and merging windows between columns persists the same order at desktop and phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const session = {
      v: 2,
      focused: { columnIndex: 0, appIndex: 0 },
      columns: [{
        widthPreset: 'half',
        apps: [{ type: 'doc-viewer' }, { type: 'img-viewer' }],
      }],
    };
    await page.evaluate(({ key, value }) => {
      localStorage.removeItem('desktop-session-v1');
      localStorage.setItem(key, JSON.stringify(value));
    }, { key: KEY, value: session });
    await page.reload();
    await page.locator('#welcome-win-close').click();
    await expect(page.locator('.app-window[data-type="doc-viewer"] .doc-body')).toContainText('First document');
    await expect(page.locator('.app-window[data-type="img-viewer"] .img-viewport img')).toHaveAttribute('src', pictures[0].url);
    await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveClass(/focused/);

    await page.keyboard.press(']');
    await expect.poll(async () => (
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
    )?.columns?.map(column => column.apps.map(app => app.type))).toEqual([
      ['img-viewer'],
      ['doc-viewer'],
    ]);

    await page.keyboard.press('[');
    await expect.poll(async () => (
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
    )?.columns?.map(column => column.apps.map(app => app.type))).toEqual([
      ['doc-viewer', 'img-viewer'],
    ]);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.columns[0].widthPreset).toBe('half');
    expect(saved.focused).toEqual({ columnIndex: 0, appIndex: 0 });
    await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveClass(/focused/);
  }
});

test('ArrowUp and ArrowDown reorder shared-column windows at desktop and phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const session = {
      v: 2,
      focused: { columnIndex: 0, appIndex: 0 },
      columns: [{
        widthPreset: 'half',
        apps: [{ type: 'doc-viewer' }, { type: 'img-viewer' }],
      }],
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: KEY,
      value: session,
    });
    await page.reload();
    await page.locator('#welcome-win-close').click();
    await expect(page.locator('.app-window[data-type="doc-viewer"] .doc-body'))
      .toContainText('First document');
    await expect(page.locator('.app-window[data-type="img-viewer"] .img-viewport img'))
      .toHaveAttribute('src', pictures[0].url);
    await page.locator('#overview-btn').focus();

    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
    )?.columns?.[0]?.apps?.map(app => app.type)).toEqual(['img-viewer', 'doc-viewer']);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY).then(saved => saved.focused))
      .toEqual({ columnIndex: 0, appIndex: 1 });
    await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveClass(/focused/);

    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
    )?.columns?.[0]?.apps?.map(app => app.type)).toEqual(['doc-viewer', 'img-viewer']);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY).then(saved => saved.focused))
      .toEqual({ columnIndex: 0, appIndex: 0 });
    await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveClass(/focused/);
  }
});

test('overview drag between columns preserves order, widths, and focus after refresh', async ({ page }) => {
  const session = {
    v: 2,
    focused: { columnIndex: 0, appIndex: 1 },
    columns: [
      {
        widthPreset: 'half',
        apps: [{ type: 'doc-viewer' }, { type: 'img-viewer' }],
      },
      {
        widthPreset: 'third',
        apps: [{ type: 'doc-viewer', state: { url: docs[1].url } }],
      },
    ],
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: KEY,
    value: session,
  });
  await page.reload();
  await page.locator('#welcome-win-close').click();

  const image = page.locator('.app-window[data-type="img-viewer"]');
  const imageId = await image.getAttribute('data-id');
  const destinationId = await page.locator('.app-col').nth(1).getAttribute('data-col-id');
  await expect(page.locator('.app-window[data-type="doc-viewer"]').nth(0).locator('.doc-body'))
    .toContainText('First document');
  await expect(page.locator('.app-window[data-type="doc-viewer"]').nth(1).locator('.doc-body'))
    .toContainText('Second document');
  await expect(image).toHaveClass(/focused/);

  await page.locator('#overview-btn').click();
  await expect(page.locator('.ov-drag-handle')).toHaveCount(3);
  await dragOverviewWindow(
    page,
    imageId,
    `.ov-drop-zone--within[data-col-id="${destinationId}"][data-insert-at="0"]`,
  );

  await expect.poll(async () => (
    await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)
  )).toMatchObject({
    columns: [
      { widthPreset: 'half', apps: [{ type: 'doc-viewer' }] },
      {
        widthPreset: 'third',
        apps: [{ type: 'img-viewer' }, { type: 'doc-viewer', state: { url: docs[1].url } }],
      },
    ],
    focused: { columnIndex: 1, appIndex: 0 },
  });

  await page.getByRole('button', { name: 'Move column left' }).click();
  const reordered = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  expect(reordered.columns.map(column => column.apps.map(app => app.type))).toEqual([
    ['img-viewer', 'doc-viewer'],
    ['doc-viewer'],
  ]);
  expect(reordered.columns.map(column => column.widthPreset)).toEqual(['third', 'half']);
  expect(reordered.focused).toEqual({ columnIndex: 0, appIndex: 0 });

  await page.reload();
  await page.locator('#welcome-win-close').click();
  const columns = page.locator('.app-col');
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0)).toHaveAttribute('data-width', 'third');
  await expect(columns.nth(1)).toHaveAttribute('data-width', 'half');
  await expect.poll(() => page.locator('.app-window').evaluateAll(windows => (
    windows.map(window => window.dataset.type)
  ))).toEqual(['img-viewer', 'doc-viewer', 'doc-viewer']);
  await expect(page.locator('.app-window[data-type="img-viewer"]')).toHaveClass(/focused/);
  await expect(page.locator('.app-window[data-type="doc-viewer"]').nth(0).locator('.doc-body'))
    .toContainText('Second document');
  await expect(page.locator('.app-window[data-type="doc-viewer"]').nth(1).locator('.doc-body'))
    .toContainText('First document');
});

test('overview drag into a new column preserves the source width and focused window after refresh', async ({ page }) => {
  const session = {
    v: 2,
    focused: { columnIndex: 0, appIndex: 1 },
    columns: [{
      widthPreset: 'half',
      apps: [{ type: 'doc-viewer' }, { type: 'img-viewer' }],
    }],
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: KEY,
    value: session,
  });
  await page.reload();
  await page.locator('#welcome-win-close').click();

  const image = page.locator('.app-window[data-type="img-viewer"]');
  const imageId = await image.getAttribute('data-id');
  await expect(image).toHaveClass(/focused/);
  await page.locator('#overview-btn').click();
  await expect(page.locator('.ov-drag-handle')).toHaveCount(2);
  await dragOverviewWindow(
    page,
    imageId,
    '.ov-drop-zone--new-col[data-insert-at="1"]',
  );

  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  expect(saved.columns.map(column => column.apps.map(app => app.type))).toEqual([
    ['doc-viewer'],
    ['img-viewer'],
  ]);
  expect(saved.columns.map(column => column.widthPreset)).toEqual(['half', 'half']);
  expect(saved.focused).toEqual({ columnIndex: 1, appIndex: 0 });

  await page.reload();
  await page.locator('#welcome-win-close').click();
  await expect(page.locator('.app-col')).toHaveCount(2);
  await expect(page.locator('.app-col').nth(0)).toHaveAttribute('data-width', 'half');
  await expect(page.locator('.app-col').nth(1)).toHaveAttribute('data-width', 'half');
  await expect(page.locator('.app-window[data-type="img-viewer"]')).toHaveClass(/focused/);
  await expect.poll(() => page.locator('.app-window').evaluateAll(windows => (
    windows.map(window => window.dataset.type)
  ))).toEqual(['doc-viewer', 'img-viewer']);
});

test('directional window focus follows geometry and Vim keys at desktop and phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const session = {
      v: 2,
      focused: { columnIndex: 0, appIndex: 0 },
      columns: [
        { widthPreset: 'full', apps: [{ type: 'doc-viewer' }] },
        { widthPreset: 'full', apps: [{ type: 'img-viewer' }] },
      ],
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: KEY,
      value: session,
    });
    await page.reload();
    await page.locator('#welcome-win-close').click();
    await expect(page.locator('.app-window[data-type="doc-viewer"] .doc-body')).toContainText('First document');
    await expect(page.locator('.app-window[data-type="img-viewer"] .img-viewport img')).toHaveAttribute('src', pictures[0].url);
    await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveClass(/focused/);

    await page.locator('.app-window[data-type="doc-viewer"] .doc-body').click();
    await page.keyboard.press('Control+ArrowRight');
    const image = page.locator('.app-window[data-type="img-viewer"]');
    await expect(image).toHaveClass(/focused/);
    await expect.poll(() => page.evaluate(() => Boolean(
      document.activeElement.closest('.app-window.focused'),
    ))).toBe(true);

    await page.keyboard.press('Control+h');
    await expect(page.locator('.app-window[data-type="doc-viewer"]')).toHaveClass(/focused/);
    await expect(page.locator('.app-window[data-type="img-viewer"]')).not.toHaveClass(/focused/);
  }
});

test('refreshing restores saved app state without rewriting the session before user input', async ({ page }) => {
  const session = {
    v: 2,
    focused: { columnIndex: 0, appIndex: 0 },
    columns: [{
      widthPreset: 'half',
      apps: [{ type: 'doc-viewer', state: { url: docs[1].url } }],
    }],
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: KEY,
    value: session,
  });

  await page.reload();

  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)).toEqual(session);
  await expect(page.locator('.app-window[data-type="doc-viewer"] .doc-body')).toContainText('Second document');
});

test('refreshing does not delete an unreadable saved session', async ({ page }) => {
  const malformed = '{"v":2,"columns":';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: KEY, value: malformed });

  await page.reload();

  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(malformed);
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
