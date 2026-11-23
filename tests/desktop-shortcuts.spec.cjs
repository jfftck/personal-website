const { test, expect } = require('@playwright/test');

async function openSettingsKeyboard(page) {
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="settings"]').click();
  const settings = page.locator('.app-window[data-type="settings"]').last();
  await settings.locator('.settings-nav-item[data-page="keyboard"]').click();
  return settings;
}

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

test('shortcut editor adds combinations without replacing them and persists them for Help', async ({ page }) => {
  const settings = await openSettingsKeyboard(page);
  const row = settings.locator('.settings-shortcut-action')
    .filter({ hasText: 'Open the app menu' });
  const capture = row.locator('.shortcut-capture-input');
  await capture.focus();
  await capture.press('Alt+g');
  await expect(row.locator('.shortcut-binding-chip')).toHaveCount(2);
  await expect(settings.locator('.settings-shortcut-status')).toHaveText('Shortcut added to Open the app menu.');

  await page.locator('#app-menu-btn').focus();
  await page.keyboard.press('Alt+g');
  await expect(page.locator('#app-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.locator('#app-menu')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await page.locator('#welcome-win-close').click();
  const restoredSettings = await openSettingsKeyboard(page);
  const restoredRow = restoredSettings.locator('.settings-shortcut-action')
    .filter({ hasText: 'Open the app menu' });
  await expect(restoredRow.locator('.shortcut-binding-chip')).toHaveCount(2);
  await expect(restoredSettings.locator('.settings-shortcut-reference'))
    .toContainText('Alt+G');
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-menu-help-btn').click();
  await expect(page.locator('#help-shortcut-reference')).toContainText('Alt+G');
  await page.locator('#help-close-btn').click();

  const removeAltG = restoredRow.getByRole('button', { name: 'Remove Alt plus G from Open the app menu' });
  await expect(removeAltG).toBeVisible();
  await removeAltG.click();
  await expect(restoredRow.locator('.shortcut-binding-chip')).toHaveCount(1);
});

test('shortcut conflicts can be canceled or moved with both actions identified', async ({ page }) => {
  const settings = await openSettingsKeyboard(page);
  const menuRow = settings.locator('.settings-shortcut-action')
    .filter({ hasText: 'Open the app menu' });
  const capture = menuRow.locator('.shortcut-capture-input');
  await capture.focus();
  await capture.press('Control+Alt+1');

  const conflict = page.getByRole('dialog', { name: 'Shortcut already assigned' });
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText('Open the app menu');
  await expect(conflict).toContainText('Focus app 1');
  await conflict.getByRole('button', { name: 'Cancel' }).click();
  await expect(conflict).toBeHidden();
  await expect(menuRow.locator('.shortcut-binding-chip')).toHaveCount(1);

  await capture.focus();
  await capture.press('Control+Alt+1');
  await expect(conflict).toBeVisible();
  await conflict.getByRole('button', { name: 'Move Shortcut' }).click();
  await expect(conflict).toBeHidden();
  await expect(menuRow.locator('.shortcut-binding-chip')).toHaveCount(2);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('desktop-keyboard-shortcuts-v1')));
  expect(stored['desktop.focusApp1']).toEqual([]);
  expect(stored['desktop.openAppMenu']).toHaveLength(2);

  await page.locator('#app-menu-btn').focus();
  await page.keyboard.press('Control+Alt+1');
  await expect(page.locator('#app-menu')).toBeVisible();
});

test('calculator shortcuts respect expression editing and native button activation', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  await page.locator('#app-list .app-launcher[data-type="calculator"]').click();
  const calculator = page.locator('.app-window[data-type="calculator"]').last();
  const expression = calculator.getByRole('textbox', { name: 'Expression' });
  await expression.fill('7+3');
  await expression.press('Enter');
  await expect(calculator.locator('.calc-value')).toHaveText('10');

  await expression.fill('12+');
  await expression.press('Backspace');
  await expect(expression).toHaveValue('12');

  const seven = calculator.getByRole('button', { name: '7', exact: true });
  await seven.focus();
  await page.keyboard.press('Space');
  await expect(expression).toHaveValue('127');
});

test('Minesweeper flag shortcut is editable and still works on focused board cells', async ({ page }) => {
  await page.locator('#app-menu-btn').click();
  await page.locator('#game-center-entry').click();
  await page.locator('[data-game="minesweeper"]').click();
  const game = page.locator('.app-window[data-type="minesweeper"]').last();
  await expect(game.locator('.mine-cell').first()).toBeVisible();

  const settings = await openSettingsKeyboard(page);
  const row = settings.locator('.settings-shortcut-action')
    .filter({ hasText: 'Flag or unflag a Minesweeper cell' });
  await row.locator('.shortcut-capture-input').focus();
  await row.locator('.shortcut-capture-input').press('Shift+g');
  await expect(row.locator('.shortcut-binding-chip')).toHaveCount(2);

  await page.locator('#open-apps-bar .app-tab-btn[aria-label="Minesweeper"]').click();
  const cell = game.locator('.mine-cell').first();
  await cell.focus();
  await page.keyboard.press('Shift+g');
  await expect(cell).toHaveClass(/flagged/);
  await cell.focus();
  await page.keyboard.press('f');
  await expect(cell).not.toHaveClass(/flagged/);
});
