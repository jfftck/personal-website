const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ['game-center.spec.cjs', 'admin-thumbnail.spec.cjs'],
  outputDir: '../generated-artifacts/browser-tests',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.TEST_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`,
    headless: true,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', args: ['--no-sandbox'] },
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
  },
});
