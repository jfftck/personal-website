const { test, expect } = require('@playwright/test');

test('welcome preference controls startup and offers a notification when hidden', async ({ page }) => {
  await page.goto('/');
  const preference = page.locator('#welcome-show-on-startup');
  await expect(preference).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('desktop-welcome-show-on-startup'))).toBeNull();

  await preference.uncheck();
  await page.locator('#welcome-win-close').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('desktop-welcome-show-on-startup'))).toBe('false');
  await page.reload();

  await expect(page.locator('#welcome-overlay')).toBeHidden();
  const notificationButton = page.locator('#notifications-btn');
  await expect(notificationButton).toHaveAttribute('aria-label', 'Notifications, 1 unseen');
  await expect(page.locator('#notification-unseen-dot')).toBeVisible();
  await notificationButton.click();
  await expect(page.locator('#notification-panel')).toBeVisible();
  await expect(page.locator('#notification-list')).toContainText('Welcome is available');
  await expect(page.locator('#notification-list')).toContainText('You can open the Welcome dialog from the Apps menu');
  await expect(page.locator('#notification-unseen-dot')).toBeHidden();

  await page.getByRole('button', { name: 'Open Welcome' }).click();
  await expect(page.locator('#welcome-overlay')).toBeVisible();
  await expect(page.locator('#notification-panel')).toBeHidden();
});

test('saved unseen notifications show a dot and become seen when the panel opens', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('desktop-notifications-v1', JSON.stringify([{
      id: 'test-unseen',
      type: 'test',
      title: 'Saved notification',
      message: 'This notification was already in the local inbox.',
      createdAt: new Date().toISOString(),
      seen: false,
      dismissed: false,
    }]));
  });
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  const button = page.locator('#notifications-btn');
  await expect(button).toHaveAttribute('aria-label', 'Notifications, 1 unseen');
  await button.click();
  await expect(page.locator('#notification-panel')).toBeVisible();
  await expect(page.locator('#notification-list')).toContainText('Saved notification');
  await expect(button).toHaveAttribute('aria-label', 'Notifications');

  await page.keyboard.press('Escape');
  await expect(page.locator('#notification-panel')).toBeHidden();
  await expect(button).toBeFocused();
});

test('page-open reminders appear in the notification center without background delivery', async ({ page }) => {
  await page.addInitScript(() => {
    const when = new Date(Date.now() - 1000).toISOString();
    localStorage.setItem('desktop-reminders', JSON.stringify([{
      id: 'saved-reminder',
      text: 'Review the project notes',
      when,
      dueAt: when,
    }]));
  });
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  const button = page.locator('#notifications-btn');
  await expect(button).toHaveAttribute('aria-label', 'Notifications, 1 unseen');
  await button.click();
  await expect(page.locator('#notification-list')).toContainText('Reminder');
  await expect(page.locator('#notification-list')).toContainText('Review the project notes');
});

test('launcher tabs share search across apps, files, and links while Game Center stays nested', async ({ page }) => {
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();
  await expect(page.getByRole('tab', { name: 'Apps' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#launcher-links-list')).toContainText('Information Meltdown');
  await expect(page.locator('#app-list .app-launcher[data-type="welcome"]')).toBeVisible();

  await page.getByRole('tab', { name: 'Documents' }).click();
  await expect(page.locator('#launcher-panel-documents')).toBeVisible();
  await expect(page.locator('#doc-files-list')).toContainText('Welcome');

  const search = page.locator('#launcher-file-search');
  await search.fill('Questionable Content');
  await expect(page.locator('#launcher-panel-apps')).toBeVisible();
  await expect(page.locator('#launcher-links-list .launcher-link:visible')).toHaveCount(1);
  await expect(page.locator('#launcher-links-list')).toContainText('Questionable Content');

  await search.fill('');
  await page.locator('#game-center-entry').click();
  await expect(page.locator('#app-menu-title')).toHaveText('Game Center');
  await expect(page.locator('#launcher-tabs')).toBeHidden();
  await expect(page.locator('#game-list .app-launcher')).toHaveCount(9);
  await page.locator('#game-menu-back').click();
  await expect(page.locator('#launcher-tabs')).toBeVisible();
  await expect(page.locator('#app-menu-title')).toBeHidden();
});

test('launcher links and apps reflow to one content column on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  await page.locator('#app-menu-btn').click();
  await expect(page.locator('#launcher-links-list')).toContainText('Information Meltdown');
  const columns = await page.locator('.launcher-apps-links').evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  await expect(page.getByRole('tab', { name: 'Videos' })).toBeVisible();
});
