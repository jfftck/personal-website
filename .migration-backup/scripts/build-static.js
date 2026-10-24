'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const publicFiles = [
  'index.html',
  'desktop.html',
  'desktop.css',
  'desktop.js',
  'desktop-state.js',
  'favicon.png',
  'jmt.svg',
];
const publicDirectories = [
  'apps',
  'shared',
  'pictures',
  'documents',
  'videos',
  'posts',
  'welcome',
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of publicFiles) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

for (const directory of publicDirectories) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), { recursive: true });
}

console.log(`Static site built in ${output}`);