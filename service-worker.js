'use strict';

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* malformed push */ }
  const id = String(data.id || 'reminder');
  const isSetup = data.type === 'setup';
  event.waitUntil(self.registration.showNotification(isSetup ? 'Notifications enabled' : 'Reminder', {
    body: String(data.text || (isSetup ? 'Background reminders are ready.' : 'A reminder is due.')),
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: isSetup ? 'desktop-reminder-setup' : `desktop-reminder-${id}`,
    renotify: false,
    data: { id, url: '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      return;
    }
    await clients.openWindow(event.notification.data?.url || '/');
  })());
});