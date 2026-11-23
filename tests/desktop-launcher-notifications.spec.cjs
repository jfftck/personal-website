const { test, expect } = require('@playwright/test');

const savedReminderHistory = {
  id: 'saved-reminder-history',
  type: 'reminder',
  title: 'Saved reminder history',
  message: 'This previously saved reminder stays in history.',
  createdAt: new Date().toISOString(),
  seen: true,
  dismissed: false,
};

async function seedDueSystemReminder(page, reminderEnabled) {
  await page.clock.install();
  await page.addInitScript(({ reminderEnabled, savedHistory }) => {
    const dueAt = new Date(Date.now() + 1000).toISOString();
    localStorage.setItem('desktop-reminders', JSON.stringify([{
      id: 'due-system-reminder',
      text: 'Check the deployment status',
      when: dueAt,
      dueAt,
    }]));
    localStorage.setItem('desktop-reminder-background', 'true');
    localStorage.setItem('desktop-notification-preferences-v1', JSON.stringify({
      enabledTypes: { reminder: reminderEnabled },
      retentionDays: 90,
    }));
    localStorage.setItem('desktop-notifications-v1', JSON.stringify([savedHistory]));

    window.__systemNotifications = [];
    class TestNotification extends EventTarget {
      static permission = 'granted';

      constructor(title, options = {}) {
        super();
        window.__systemNotifications.push({ title, body: options.body || '' });
      }
    }
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: TestNotification,
    });
  }, { reminderEnabled, savedHistory: savedReminderHistory });
}

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

test('notification categories can be muted and remain saved across reloads', async ({ page }) => {
  await page.addInitScript(() => {
    const createdAt = new Date().toISOString();
    localStorage.setItem('desktop-notifications-v1', JSON.stringify([
      {
        id: 'category-reminder',
        type: 'reminder',
        title: 'Saved reminder',
        message: 'A reminder remains available.',
        createdAt,
        seen: false,
        dismissed: false,
      },
      {
        id: 'category-welcome',
        type: 'welcome',
        title: 'Saved welcome tip',
        message: 'A welcome tip remains available.',
        createdAt,
        seen: false,
        dismissed: false,
      },
    ]));
  });
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  await page.locator('#notifications-btn').click();

  expect(await page.evaluate(() =>
    localStorage.getItem('desktop-notification-preferences-v1'),
  )).toBeNull();
  const welcomeToggle = page.locator('[data-notification-category="welcome"]');
  const reminderToggle = page.locator('[data-notification-category="reminder"]');
  await expect(welcomeToggle).toBeChecked();
  await expect(reminderToggle).toBeChecked();
  await welcomeToggle.uncheck();
  await reminderToggle.uncheck();
  await expect(page.locator('#notification-list')).not.toContainText('Saved reminder');
  await expect(page.locator('#notification-list')).not.toContainText('Saved welcome tip');
  await expect(page.locator('#notifications-btn')).toHaveAttribute('aria-label', 'Notifications');
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('desktop-notification-preferences-v1'),
  ).enabledTypes)).toEqual({ welcome: false, reminder: false });

  await page.reload();
  await page.locator('#welcome-win-close').click();
  await page.locator('#notifications-btn').click();
  await expect(page.locator('[data-notification-category="welcome"]')).not.toBeChecked();
  await expect(page.locator('[data-notification-category="reminder"]')).not.toBeChecked();
  await expect(page.locator('#notification-list')).not.toContainText('Saved reminder');
  await expect(page.locator('#notification-list')).not.toContainText('Saved welcome tip');
  await page.locator('[data-notification-category="welcome"]').check();
  await page.locator('[data-notification-category="reminder"]').check();
  await expect(page.locator('#notification-list')).toContainText('Saved reminder');
  await expect(page.locator('#notification-list')).toContainText('Saved welcome tip');
});

test('muted due reminders do not alert and preserve saved history', async ({ page }) => {
  await seedDueSystemReminder(page, true);
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  await page.locator('#notifications-btn').click();

  const reminderToggle = page.locator('[data-notification-category="reminder"]');
  await reminderToggle.uncheck();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('desktop-notifications-v1'))
      .find(item => item.id === 'saved-reminder-history'),
  )).toEqual(savedReminderHistory);

  await page.clock.runFor(1100);
  await expect.poll(() => page.evaluate(() => window.__systemNotifications)).toEqual([]);
  await expect(page.locator('#notification-list')).not.toContainText('Check the deployment status');
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('desktop-notifications-v1'))
      .find(item => item.id === 'saved-reminder-history'),
  )).toEqual(savedReminderHistory);
});

test('enabled due reminders can show an operating-system notification', async ({ page }) => {
  await seedDueSystemReminder(page, true);
  await page.goto('/');
  await page.locator('#welcome-win-close').click();

  await page.clock.runFor(1100);
  await expect.poll(() => page.evaluate(() => window.__systemNotifications)).toEqual([{
    title: 'Reminder',
    body: 'Check the deployment status',
  }]);
});

test('read and dismissed notifications follow the selected retention period', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('retention-test-seeded')) return;
    sessionStorage.setItem('retention-test-seeded', 'true');
    const ago = days => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('desktop-notification-preferences-v1', JSON.stringify({
      enabledTypes: {},
      retentionDays: 365,
    }));
    localStorage.setItem('desktop-notifications-v1', JSON.stringify([
      {
        id: 'old-read-notice',
        type: 'reminder',
        title: 'Older read item',
        message: 'This item is kept by the one-year setting.',
        createdAt: ago(120),
        seen: true,
        dismissed: false,
      },
      {
        id: 'old-dismissed-notice',
        type: 'welcome',
        title: 'Older dismissed item',
        message: 'This dismissed item is kept by the one-year setting.',
        createdAt: ago(120),
        seen: true,
        dismissed: true,
      },
      {
        id: 'recent-read-notice',
        type: 'reminder',
        title: 'Recent read item',
        message: 'This recent item remains available.',
        createdAt: ago(20),
        seen: true,
        dismissed: false,
      },
    ]));
  });
  await page.goto('/');
  await page.locator('#welcome-win-close').click();
  await page.locator('#notifications-btn').click();
  await expect(page.locator('#notification-list')).toContainText('Older read item');
  await expect(page.locator('#notification-list')).toContainText('Recent read item');
  await expect(page.locator('#notification-retention')).toHaveValue('365');
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('desktop-notifications-v1'),
  ).map(item => item.id))).toEqual(['old-read-notice', 'old-dismissed-notice', 'recent-read-notice']);

  await page.locator('#notification-retention').selectOption('30');
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('desktop-notifications-v1'),
  ).map(item => item.id))).toEqual(['recent-read-notice']);
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('desktop-notification-preferences-v1'),
  ).retentionDays)).toBe(30);

  await page.reload();
  await page.locator('#welcome-win-close').click();
  await page.locator('#notifications-btn').click();
  await expect(page.locator('#notification-retention')).toHaveValue('30');
  await expect(page.locator('#notification-list')).toContainText('Recent read item');
  await expect(page.locator('#notification-list')).not.toContainText('Older read item');
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
