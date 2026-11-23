import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  APP_DESCRIPTORS,
  APP_LAUNCHERS,
  APP_REGISTRY,
} from '../artifacts/personal-website/public/apps/app-registry.js';
import { GAMES } from '../artifacts/personal-website/public/apps/games/catalog.js';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(workspaceRoot, 'artifacts/personal-website/public');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(absolutePath)
      : entry.name.endsWith('.js') ? [absolutePath] : [];
  });
}

function ownerFor(relativePath) {
  const owners = new Set();
  for (const descriptor of APP_DESCRIPTORS) {
    if (descriptor.modules.some(modulePath => (
      modulePath.endsWith('/**')
        ? relativePath.startsWith(modulePath.slice(0, -2))
        : relativePath === modulePath
    ))) owners.add(descriptor.group === 'game-center' ? 'game-center' : descriptor.type);
  }
  return owners;
}

test('each window app has one descriptor with valid entry, styles, state, and ownership metadata', () => {
  const types = APP_DESCRIPTORS.map(descriptor => descriptor.type);
  assert.equal(new Set(types).size, types.length);
  assert.deepEqual(Object.keys(APP_REGISTRY).sort(), [...types].sort());

  for (const descriptor of APP_DESCRIPTORS) {
    assert.equal(typeof descriptor.title, 'string');
    assert.equal(typeof descriptor.iconSvg, 'string');
    assert.equal(typeof descriptor.loadModule, 'function');
    assert.equal(typeof descriptor.build, 'function');
    assert.equal(typeof descriptor.state.persistence, 'string');
    assert.ok(descriptor.modules.length > 0, `${descriptor.type} should declare its implementation boundary`);
    assert.ok(fs.existsSync(fileURLToPath(descriptor.entryUrl)), `${descriptor.type} entry module should exist`);
    assert.ok(fs.existsSync(path.join(publicRoot, descriptor.modulePath.slice(2))), `${descriptor.type} module path should exist`);
    for (const stylesheet of descriptor.styles) {
      assert.ok(fs.existsSync(path.join(publicRoot, stylesheet.slice(2))), `${descriptor.type} stylesheet ${stylesheet} should exist`);
    }
    for (const modulePath of descriptor.modules) {
      if (modulePath.endsWith('/**')) {
        assert.ok(fs.existsSync(path.join(publicRoot, modulePath.slice(0, -3))), `${modulePath} directory should exist`);
      } else {
        assert.ok(fs.existsSync(path.join(publicRoot, modulePath)), `${modulePath} should exist`);
      }
    }
  }
});

test('the launcher exposes each app once and keeps games inside the Game Center submenu', () => {
  const launchers = APP_LAUNCHERS.map(descriptor => descriptor.type);
  assert.equal(new Set(launchers).size, launchers.length);
  const desktopHtml = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
  assert.match(desktopHtml, /id="game-center-entry"[^>]*aria-controls="game-submenu"/);
  assert.ok(!launchers.includes('game-center'));
  assert.ok(!launchers.includes('chess'));
  assert.ok(!launchers.includes('minesweeper'));
  assert.ok(!launchers.includes('reversi'));
  assert.ok(APP_REGISTRY.chess && APP_REGISTRY.minesweeper && APP_REGISTRY.reversi);
  assert.ok(APP_REGISTRY.klondike && APP_REGISTRY.spider && APP_REGISTRY.freecell);
  assert.ok(APP_REGISTRY.pyramid && APP_REGISTRY.tripeaks && APP_REGISTRY.golf);
  assert.deepEqual(
    APP_DESCRIPTORS.filter(descriptor => descriptor.group === 'game-center')
      .map(({ type, title }) => ({ type, title })),
    GAMES.map(({ type, title }) => ({ type, title })),
  );
});

test('app implementations stay inside their owner and use shared libraries across app boundaries', () => {
  const appsRoot = path.join(publicRoot, 'apps');
  const sharedRoot = path.join(publicRoot, 'shared');

  for (const file of sourceFiles(sharedRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*['"][^'"]*\/apps\//, `${path.basename(file)} must not depend on an app`);
  }

  for (const file of sourceFiles(appsRoot)) {
    const relativePath = path.relative(publicRoot, file).replaceAll(path.sep, '/');
    if (relativePath === 'apps/app-registry.js' || relativePath.endsWith('.app.js')) continue;
    const owners = ownerFor(relativePath);
    if (!owners.size) continue;
    assert.equal(owners.size, 1, `${relativePath} should have one owning app`);
    const owner = [...owners][0];
    const source = fs.readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), specifier);
      if (!target.startsWith(`${appsRoot}${path.sep}`) || !fs.existsSync(target)) continue;
      const targetPath = path.relative(publicRoot, target).replaceAll(path.sep, '/');
      const targetOwners = ownerFor(targetPath);
      if (targetOwners.size) {
        assert.deepEqual([...targetOwners], [owner], `${relativePath} must not import another app's internals (${specifier})`);
      }
    }
  }
});

test('the desktop shell registry stays metadata-only instead of importing app entry code', () => {
  const source = fs.readFileSync(path.join(publicRoot, 'desktop.js'), 'utf8');
  assert.match(source, /from\s+['"]\.\/apps\/app-registry\.js['"]/);
  assert.doesNotMatch(source, /from\s+['"]\.\/apps\/(?:doc-viewer|img-viewer|file-manager|media-player|calendar|world-clock|calculator|sticky-notes|weather|settings|game-center)\.js['"]/);
});
