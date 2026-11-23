import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const websiteRoot = path.join(workspaceRoot, 'artifacts/personal-website');
const publicRoot = path.join(websiteRoot, 'public');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sourceFiles(directory, extensions) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(absolutePath, extensions)
      : extensions.has(path.extname(entry.name)) ? [absolutePath] : [];
  });
}

function isReactSpecifier(specifier) {
  return /(?:^|[/@])react(?:-dom)?(?:$|[./?@#])/i.test(specifier);
}

function reactImports(source) {
  const specifiers = [];
  const importPattern = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\b(?:importScripts|require)\s*\(\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] || match[2] || match[3];
    if (isReactSpecifier(specifier)) specifiers.push(specifier);
  }
  return specifiers;
}

function runtimeDependencies(manifest) {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  });
}

function assertReactDependencies(manifest, expected, appName) {
  const dependencies = runtimeDependencies(manifest);
  for (const packageName of ['react', 'react-dom']) {
    assert.equal(
      dependencies.includes(packageName),
      expected,
      `${appName} should ${expected ? 'retain' : 'not declare'} ${packageName}`,
    );
  }
}

test('desktop release excludes React while React apps keep their dependencies', () => {
  const desktopManifest = readJson(path.join(websiteRoot, 'package.json'));
  const adminManifest = readJson(path.join(workspaceRoot, 'artifacts/admin-console/package.json'));
  const mockupManifest = readJson(path.join(workspaceRoot, 'artifacts/mockup-sandbox/package.json'));

  assertReactDependencies(desktopManifest, false, 'personal website');
  assertReactDependencies(adminManifest, true, 'admin console');
  assertReactDependencies(mockupManifest, true, 'mockup sandbox');

  const buildScript = fs.readFileSync(path.join(websiteRoot, 'scripts/build-static.cjs'), 'utf8');
  const desktopScripts = JSON.stringify(desktopManifest.scripts || {});
  assert.deepEqual(reactImports(buildScript), [], 'desktop build script must not import React or ReactDOM');
  assert.deepEqual(reactImports(desktopScripts), [], 'desktop package scripts must not load React or ReactDOM');
  assert.doesNotMatch(buildScript, /\breact(?:-dom)?\b/i, 'desktop build script must not add React to the payload');
  assert.doesNotMatch(desktopScripts, /\breact(?:-dom)?\b/i, 'desktop package scripts must not add React to the payload');
});

test('desktop public entry files and modules do not load React or ReactDOM', () => {
  const publicFiles = sourceFiles(publicRoot, new Set(['.html', '.js', '.mjs']));

  assert.ok(publicFiles.includes(path.join(publicRoot, 'index.html')), 'desktop entry HTML should be present');
  assert.ok(publicFiles.includes(path.join(publicRoot, 'desktop.js')), 'desktop JavaScript entry should be present');

  for (const file of publicFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(publicRoot, file);
    assert.deepEqual(reactImports(source), [], `${relativePath} must not import React or ReactDOM`);
    assert.doesNotMatch(
      source,
      /\b(?:ReactDOM|React)\b|\breact(?:-dom)?(?:\/|\.|@|['"`])/i,
      `${relativePath} must not load or use React`,
    );

    if (path.extname(file) === '.html') {
      const scriptSources = [...source.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
        .map(match => match[1])
        .filter(isReactSpecifier);
      assert.deepEqual(scriptSources, [], `${relativePath} must not load React from a script tag`);

      for (const [, importMap] of source.matchAll(/<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        const mappedSources = Object.entries(JSON.parse(importMap).imports || {})
          .flatMap(([specifier, address]) => [specifier, address])
          .filter(isReactSpecifier);
        assert.deepEqual(mappedSources, [], `${relativePath} must not map React imports`);
      }
    }
  }
});

test('the standard test command includes the desktop React boundary check', () => {
  const rootManifest = readJson(path.join(workspaceRoot, 'package.json'));
  const testCommand = rootManifest.scripts?.test || '';
  const focusedCommand = rootManifest.scripts?.['test:desktop-no-react'] || '';
  assert.match(testCommand, /tests\/\*\.test\.(?:js|mjs)/, 'pnpm test should include the test-file glob');
  assert.match(testCommand, /tests\/\*\.test\.mjs/, 'pnpm test should include this .mjs regression check');
  assert.match(focusedCommand, /tests\/desktop-no-react\.test\.mjs/, 'the focused command should run this check directly');
});
