import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDesktopWallpaperController } from '../artifacts/personal-website/public/shared/desktop-wallpaper.js';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(workspaceRoot, 'artifacts/personal-website/public');

function collectStaticModules(entry) {
  const modules = new Set();
  const visit = file => {
    const absolutePath = path.resolve(file);
    if (!absolutePath.startsWith(`${publicRoot}${path.sep}`) || modules.has(absolutePath)) return;
    modules.add(absolutePath);
    const source = fs.readFileSync(absolutePath, 'utf8');
    for (const [, specifier] of source.matchAll(
      /^\s*import\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"];?/gm,
    )) {
      if (specifier.startsWith('.')) visit(path.resolve(path.dirname(absolutePath), specifier));
    }
  };
  visit(path.join(publicRoot, entry));
  return modules;
}

function makeWallpaperController({ stored = {}, files = [], manifestError = false } = {}) {
  const changes = { removed: [], set: [], saved: [], notifications: 0 };
  const document = {
    body: {
      style: {
        removeProperty: name => changes.removed.push(name),
        setProperty: (name, value) => changes.set.push([name, value]),
      },
    },
  };
  const window = {
    location: { href: 'https://example.test/' },
    clearTimeout() {},
    setTimeout() { return 1; },
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame(callback) { callback(); },
    Image: class {},
  };
  const controller = createDesktopWallpaperController({
    document,
    window,
    readJSON: () => structuredClone(stored),
    writeJSON: (key, value, options) => {
      assert.equal(options.validate(value), true);
      changes.saved.push([key, structuredClone(value)]);
      return true;
    },
    ensureManifest: async () => files,
    hasManifestError: () => manifestError,
    normalizeAnimationChoices: (value, effects, fallback) => (
      Array.isArray(value) ? value.filter(effect => effects.includes(effect)) : [...fallback]
    ),
    chooseAnimation: choices => choices[0] || 'none',
    notifySettingsChanged: () => { changes.notifications += 1; },
  });
  return { controller, changes };
}

test('desktop startup keeps app-only controls and optional shell modules out of its static graph', () => {
  const modules = collectStaticModules('desktop.js');
  const modulePaths = [...modules].map(file => path.relative(publicRoot, file).replaceAll(path.sep, '/'));
  const sourceBytes = [...modules].reduce((total, file) => total + fs.statSync(file).size, 0);

  // Include the small cross-tab manifest invalidation bridge, while keeping app-only code out of startup.
  assert.ok(sourceBytes < 174_500, `Expected the initial graph below 174.5 KB, received ${sourceBytes} bytes`);
  assert.ok(!modulePaths.includes('shared/app-toolbar.js'));
  assert.ok(!modulePaths.includes('shared/app-controls.js'));
  assert.ok(!modulePaths.includes('shared/desktop-help.js'));
  assert.ok(!modulePaths.includes('shared/desktop-wallpaper.js'));
  assert.ok(modulePaths.includes('shared/app-icons.js'));
});

test('wallpaper settings load only eligible wallpapers and keep valid selections', async () => {
  const { controller, changes } = makeWallpaperController({
    stored: {
      selected: ['/wallpaper.jpg', '/removed.jpg'],
      mode: 'cycle',
      rotation: 'interval',
      intervalMinutes: 15,
      transition: ['zoom'],
      currentUrl: '/wallpaper.jpg',
      nextUrl: '',
      nextChangeAt: 0,
    },
    files: [
      { type: 'image', isWallpaper: true, url: '/wallpaper.jpg', title: 'Preferred', displayName: 'wallpaper.jpg' },
      { type: 'image', isWallpaper: false, url: '/not-a-wallpaper.jpg', title: 'Other', displayName: 'other.jpg' },
      { type: 'video', isWallpaper: true, url: '/video.mp4', title: 'Video', displayName: 'video.mp4' },
    ],
  });

  const result = await controller.loadForSettings();

  assert.deepEqual(result.files, [{
    url: '/wallpaper.jpg',
    title: 'Preferred',
    displayName: 'wallpaper.jpg',
  }]);
  assert.deepEqual(result.settings.selected, ['/wallpaper.jpg']);
  assert.equal(result.settings.mode, 'cycle');
  assert.equal(result.settings.intervalMinutes, 15);
  assert.deepEqual(changes.saved, []);
});

test('resetting wallpaper uses the default background without altering other settings', async () => {
  const { controller, changes } = makeWallpaperController({
    stored: { selected: ['/wallpaper.jpg'], mode: 'cycle' },
  });

  await controller.useDefault();

  assert.deepEqual(changes.removed, ['--desktop-wallpaper-image']);
  assert.equal(changes.saved.length, 1);
  assert.equal(changes.saved[0][0], 'desktop-wallpaper-settings-v1');
  assert.deepEqual(changes.saved[0][1], {
    selected: [],
    mode: 'random',
    rotation: 'visit',
    intervalMinutes: 60,
    transition: ['fade'],
    currentUrl: '',
    nextUrl: '',
    nextChangeAt: 0,
  });
  assert.equal(changes.notifications, 1);
});
