const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
});

test('shortcut modifiers use Command on Apple platforms and Control elsewhere', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { getPrimaryModifier, getPrimaryModifierLabel, hasPrimaryModifier } =
      await import(new URL('shared/desktop-shortcuts.js', document.baseURI).href);
    return {
      apple: getPrimaryModifier('MacIntel'),
      appleLabel: getPrimaryModifierLabel('MacIntel'),
      windows: getPrimaryModifier('Win32'),
      linux: getPrimaryModifier('Linux x86_64'),
      acceptsMacCommand: hasPrimaryModifier({ metaKey: true, ctrlKey: false }, 'MacIntel'),
      rejectsMacControl: hasPrimaryModifier({ metaKey: false, ctrlKey: true }, 'MacIntel'),
      acceptsLinuxControl: hasPrimaryModifier({ metaKey: false, ctrlKey: true }, 'Linux x86_64'),
      rejectsLinuxCommand: hasPrimaryModifier({ metaKey: true, ctrlKey: false }, 'Linux x86_64'),
    };
  });
  expect(result).toEqual({
    apple: 'meta',
    appleLabel: '⌘',
    windows: 'ctrl',
    linux: 'ctrl',
    acceptsMacCommand: true,
    rejectsMacControl: false,
    acceptsLinuxControl: true,
    rejectsLinuxCommand: false,
  });
});

test('platform-primary shortcuts open the launcher and focus windows without browser conflicts', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('desktop-session-v2', JSON.stringify({
    v: 2,
    focused: { columnIndex: 0, appIndex: 0 },
    columns: [
      { widthPreset: 'full', apps: [{ type: 'doc-viewer' }] },
      { widthPreset: 'full', apps: [{ type: 'img-viewer' }] },
    ],
  })));
  await page.reload();
  await page.locator('#welcome-win-close').click();
  const documentWindow = page.locator('.app-window[data-type="doc-viewer"]');
  const imageWindow = page.locator('.app-window[data-type="img-viewer"]');
  await expect(documentWindow).toHaveClass(/focused/);
  await documentWindow.locator('.doc-body').click();
  await expect(documentWindow).toHaveClass(/focused/);

  await page.keyboard.press('Control+Shift+ArrowRight');
  await expect(documentWindow).toHaveClass(/focused/);
  await page.keyboard.press('Control+Alt+Shift+ArrowRight');
  await expect(imageWindow).toHaveClass(/focused/);
  await page.keyboard.press('Control+Alt+Shift+h');
  await expect(documentWindow).toHaveClass(/focused/);

  await page.keyboard.press('Control+Shift+Space');
  await expect(page.locator('#app-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+2');
  await expect(imageWindow).toHaveClass(/focused/);
});

test('Help and Settings render the same complete shortcut reference', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  const helpButton = page.locator('#app-menu-help-btn');
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  await expect(page.locator('#help-overlay')).toBeVisible();
  const helpReference = page.locator('#help-shortcut-reference');
  const helpText = await helpReference.innerText();
  expect(helpText).toContain('CALCULATOR');
  expect(helpText).toContain('GAME BOARDS');
  expect(helpText).toContain('FILE MANAGER');
  expect(helpText).toContain('SUGGESTIONS');
  expect(helpText).toContain('Shift');

  await page.locator('#help-close-btn').click();
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="settings"]').click();
  const settings = page.locator('.app-window[data-type="settings"]').last();
  await settings.locator('.settings-nav-item[data-page="keyboard"]').click();
  const settingsReference = settings.locator('.settings-shortcut-reference');
  await expect(settingsReference).toBeVisible();
  await expect(settingsReference).toHaveText(await helpReference.innerText());
});

test('Help stays beside launcher search and remains usable on a phone-width menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#app-menu-btn').click();
  const search = page.locator('#launcher-file-search');
  const helpButton = page.locator('#app-menu-help-btn');
  await expect(search).toBeVisible();
  await expect(helpButton).toBeVisible();
  const geometry = await page.evaluate(() => {
    const menu = document.querySelector('#app-menu').getBoundingClientRect();
    const search = document.querySelector('#launcher-file-search').getBoundingClientRect();
    const help = document.querySelector('#app-menu-help-btn').getBoundingClientRect();
    return { menu, search, help };
  });
  expect(geometry.search.right).toBeLessThan(geometry.help.left);
  expect(geometry.help.right).toBeLessThanOrEqual(geometry.menu.right);
  await helpButton.click();
  await expect(page.locator('#help-overlay')).toBeVisible();
});
