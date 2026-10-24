const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Exercise the real list/editor functions in an isolated DOM, without changing
// the admin's authentication or writing to any on-disk manifests.
const source = readFileSync(join(__dirname, '../artifacts/api-server/legacy/admin/admin.js'), 'utf8');
const schemas = source.slice(source.indexOf('const SECTIONS ='), source.indexOf('// ── API base'));
const editing = source.slice(source.indexOf('function makeEditable('), source.indexOf('// ── Rename a file'));
const rendering = source.slice(source.indexOf('function renderList('), source.indexOf('// ── Delete'));
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

async function setup(page, section) {
  await page.route('https://thumb.test/**', route => {
    if (route.request().url().endsWith('/broken')) {
      return route.fulfill({ status: 404, body: 'Not an image' });
    }
    return route.fulfill({ contentType: 'image/png', body: pixel });
  });
  await page.setContent('<h1 id="section-title"></h1><div id="manifest-list"></div>');
  await page.addScriptTag({ content: `
    ${schemas}
    let activeSection = ${JSON.stringify(section)};
    const entry = { filename: 'sample', size: '1 MB',
      url: 'https://thumb.test/original', poster: 'https://thumb.test/original' };
    const manifests = { [activeSection]: [entry] };
    const sectionTitle = document.getElementById('section-title');
    const manifestList = document.getElementById('manifest-list');
    const SVG_DRAG = '', SVG_RENAME = '', SVG_EDIT = '', SVG_TRASH = '';
    let inlineEditPromise = null;
    let dragSrcIdx = -1;
    let saveCount = 0, renderCount = 0, failSave = false;
    let releaseSave;
    const messages = [];
    function toast(message) { messages.push(message); }
    async function saveManifest() {
      saveCount++;
      await new Promise(resolve => { releaseSave = resolve; });
      if (failSave) throw new Error('Test save failure');
    }
    ${editing}
    ${rendering}
    const actualRender = renderList;
    renderList = () => { renderCount++; actualRender(); };
    renderList();
    window.originalThumb = document.querySelector('.item-thumb');
    window.originalRow = document.querySelector('.manifest-item');
  ` });
  await expect(page.locator('.item-thumb')).toHaveJSProperty('naturalWidth', 1);
}

async function edit(page, key, value) {
  await page.locator(`[title="Click to edit ${key}"]`).click();
  await page.locator('.inline-edit-input').fill(value);
  await page.locator('.inline-edit-input').press('Enter');
  await expect.poll(() => page.evaluate(() => saveCount)).toBeGreaterThan(0);
}

async function finishSave(page) {
  await page.evaluate(() => releaseSave());
  await expect(page.locator('.inline-edit-input')).toHaveCount(0);
  expect(await page.evaluate(() => ({
    sameThumb: originalThumb === document.querySelector('.item-thumb'),
    sameRow: originalRow === document.querySelector('.manifest-item'),
    renderCount,
    settled: inlineEditPromise === null,
  }))).toEqual({ sameThumb: true, sameRow: true, renderCount: 1, settled: true });
}

for (const [section, key] of [['pictures', 'url'], ['videos', 'poster']]) {
  test(`${section}: commit updates the existing thumbnail only after saving`, async ({ page }) => {
    await setup(page, section);
    await edit(page, key, '  https://thumb.test/new  ');
    await expect(page.locator('.item-thumb')).toHaveAttribute('src', 'https://thumb.test/original');
    await finishSave(page);
    await expect(page.locator('.item-thumb')).toHaveAttribute('src', 'https://thumb.test/new');
    await expect(page.locator(`[title="Click to edit ${key}"]`)).toHaveText('https://thumb.test/new');
    expect(await page.evaluate(() => saveCount)).toBe(1);
  });

  test(`${section}: broken and cleared URLs show a placeholder and can recover`, async ({ page }) => {
    await setup(page, section);
    await edit(page, key, 'https://thumb.test/broken');
    await finishSave(page);
    await expect(page.locator('.item-thumb')).toHaveClass(/item-thumb--empty/);
    await expect(page.locator('.item-thumb')).not.toHaveAttribute('src');
    await edit(page, key, 'https://thumb.test/recovered');
    await finishSave(page);
    await expect(page.locator('.item-thumb')).not.toHaveClass(/item-thumb--empty/);
    await expect(page.locator('.item-thumb')).toHaveJSProperty('naturalWidth', 1);
    await edit(page, key, '');
    await finishSave(page);
    await expect(page.locator('.item-thumb')).toHaveClass(/item-thumb--empty/);
    await expect(page.locator('.item-thumb')).not.toHaveAttribute('src');
    await expect(page.locator(`[title="Click to edit ${key}"]`)).toHaveText('—');
  });
}

test('failed save retains the saved URL and thumbnail', async ({ page }) => {
  await setup(page, 'pictures');
  await page.evaluate(() => { failSave = true; });
  await edit(page, 'url', 'https://thumb.test/new');
  await finishSave(page);
  await expect(page.locator('.item-thumb')).toHaveAttribute('src', 'https://thumb.test/original');
  await expect(page.locator('[title="Click to edit url"]')).toHaveText('https://thumb.test/original');
  expect(await page.evaluate(() => entry.url)).toBe('https://thumb.test/original');
  expect(await page.evaluate(() => messages)).toEqual(['Save failed: Test save failure']);
});

test('Escape and unchanged edits do not save, refresh or rebuild thumbnails', async ({ page }) => {
  await setup(page, 'pictures');
  await page.locator('[title="Click to edit url"]').click();
  await page.locator('.inline-edit-input').fill('https://thumb.test/cancelled');
  await page.locator('.inline-edit-input').press('Escape');
  await page.locator('[title="Click to edit url"]').click();
  await page.locator('.inline-edit-input').press('Tab');
  await expect(page.locator('.inline-edit-input')).toHaveCount(0);
  expect(await page.evaluate(() => ({ saveCount, renderCount, url: entry.url })))
    .toEqual({ saveCount: 0, renderCount: 1, url: 'https://thumb.test/original' });
});

test('editing the video URL leaves its poster thumbnail alone', async ({ page }) => {
  await setup(page, 'videos');
  await edit(page, 'url', 'https://thumb.test/movie.mp4');
  await finishSave(page);
  await expect(page.locator('.item-thumb')).toHaveAttribute('src', 'https://thumb.test/original');
  expect(await page.evaluate(() => entry.url)).toBe('https://thumb.test/movie.mp4');
});
