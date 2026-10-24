const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Run the production editing, rendering, tab-switch and unload code in an
// isolated DOM. No authentication changes or real manifest writes are needed.
const source = readFileSync(join(__dirname, '../admin/admin.js'), 'utf8');
function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing admin source boundary: ${start}`);
  return source.slice(from, to);
}
const schemas = between('const SECTIONS =', '// ── API base');
const editing = between('function makeEditable(', '// ── Rename a file');
const rendering = between('function renderList(', '// ── Delete');
const navigation = between('// ── Tab switching', '// ── Keyboard');

async function setup(page, section) {
  await page.route('https://inline-edit.test/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<button class="tab-btn" data-section="posts">Posts</button>
      <button class="tab-btn" data-section="documents">Documents</button>
      <h1 id="section-title"></h1><div id="list-pane"><div id="manifest-list"></div></div>
      <div id="welcome-pane" hidden></div>`,
  }));
  await page.goto('https://inline-edit.test/');
  await page.addScriptTag({ content: `
    ${schemas}
    let activeSection = ${JSON.stringify(section)};
    const entry = { filename: 'sample.md', size: '1 MB', url: '', poster: '' };
    const manifests = { [activeSection]: [entry] };
    const tabBtns = document.querySelectorAll('.tab-btn');
    const sectionTitle = document.getElementById('section-title');
    const manifestList = document.getElementById('manifest-list');
    const listPane = document.getElementById('list-pane');
    const welcomePane = document.getElementById('welcome-pane');
    const SVG_DRAG = '', SVG_RENAME = '', SVG_EDIT = '', SVG_TRASH = '';
    let inlineEditPromise = null, dragSrcIdx = -1;
    let editorDirty = false, welcomeDirty = false;
    let saveCount = 0, loadCount = 0, releaseSave, saved;
    const messages = [];
    function toast(message) { messages.push(message); }
    function closeEditor() {}
    function hideAddForm() {}
    async function loadManifest(dir) { loadCount++; manifests[dir] ||= []; }
    async function saveManifest(dir) {
      saveCount++;
      await new Promise(resolve => { releaseSave = resolve; });
      saved = { dir, entry: { ...entry } };
    }
    ${editing}
    ${rendering}
    ${navigation}
    renderList();
  ` });
}

async function guarded(page) {
  return page.evaluate(() =>
    !window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
}

const fields = [
  ['posts', 'size'], ['documents', 'size'],
  ['pictures', 'size'], ['videos', 'size'],
  ['pictures', 'url'], ['videos', 'poster'],
];

for (const [section, key] of fields) {
  test(`${section} ${key}: navigation warns during editing and saving`, async ({ page }) => {
    await setup(page, section);
    expect(await guarded(page)).toBe(false);
    await page.locator(`[title="Click to edit ${key}"]`).click();
    await page.locator('.inline-edit-input').fill('changed');
    const dialogPromise = page.waitForEvent('dialog');
    const navigationPromise = page.goto('https://inline-edit.test/leave').catch(() => {});
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    await navigationPromise;
    await expect(page.locator('.inline-edit-input')).toHaveValue('changed');
    expect(await guarded(page)).toBe(true);
    await page.locator('.inline-edit-input').press('Enter');
    expect(await page.evaluate(() => saveCount)).toBe(1);
    expect(await guarded(page)).toBe(true);
    await page.evaluate(() => releaseSave());
    await expect(page.locator('.inline-edit-input')).toHaveCount(0);
    expect(await guarded(page)).toBe(false);
    expect(await page.evaluate(key => saved.entry[key], key)).toBe('changed');
  });

  test(`${section} ${key}: section switch auto-commits and waits for saving`, async ({ page }) => {
    await setup(page, section);
    await page.locator(`[title="Click to edit ${key}"]`).click();
    await page.locator('.inline-edit-input').fill('  changed  ');
    const target = section === 'documents' ? 'posts' : 'documents';
    // Invoke the actual handler with the input focused to exercise its explicit
    // blur, not just the browser's automatic blur when clicking a button.
    await page.evaluate(target => { window.tabSwitch = switchTab(target); }, target);
    expect(await page.evaluate(() => ({ saveCount, loadCount, activeSection })))
      .toEqual({ saveCount: 1, loadCount: 0, activeSection: section });
    expect(await guarded(page)).toBe(true);
    await page.evaluate(async () => { releaseSave(); await window.tabSwitch; });
    expect(await page.evaluate(key => ({
      saveCount, loadCount, activeSection, savedDir: saved.dir, value: saved.entry[key],
    }), key)).toEqual({
      saveCount: 1, loadCount: 1, activeSection: target, savedDir: section, value: 'changed',
    });
    expect(await guarded(page)).toBe(false);
  });

  test(`${section} ${key}: Escape and unchanged edits clear protection without saving`, async ({ page }) => {
    await setup(page, section);
    const original = await page.evaluate(key => entry[key], key);
    await page.locator(`[title="Click to edit ${key}"]`).click();
    await page.locator('.inline-edit-input').fill('cancelled');
    await page.locator('.inline-edit-input').press('Escape');
    expect(await guarded(page)).toBe(false);
    await page.locator(`[title="Click to edit ${key}"]`).click();
    await page.locator('.inline-edit-input').press('Enter');
    await expect(page.locator('.inline-edit-input')).toHaveCount(0);
    expect(await page.evaluate(key => ({ saveCount, value: entry[key] }), key))
      .toEqual({ saveCount: 0, value: original });
    expect(await guarded(page)).toBe(false);
  });
}
