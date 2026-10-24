'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The original website is already browser-ready; preserve its URLs and bytes.
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist/public');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), output, { recursive: true });
