import { readJSON, restoreDataBackup, writeJSON } from '../data-handler.js';

const STORAGE_KEY = 'desktop-notifications-v1';
const PREFERENCES_KEY = 'desktop-notification-preferences-v1';
const MAX_NOTIFICATIONS = 500;
const DEFAULT_PREFERENCES = { enabledTypes: {}, retentionDays: 90 };
const RETENTION_OPTIONS = new Set([30, 90, 365, 0]);
const DATA_EVENTS = new Set([
  'desktop-data-error',
  'desktop-data-recovery-available',
  'desktop-data-recovery-restored',
  'desktop-data-recovery-saved',
  'desktop-data-recovery-error',
  'desktop-data-recovery-cleared',
]);

function validRecord(record) {
  return Boolean(
    record
    && typeof record.id === 'string'
    && record.id.length > 0
    && record.id.length <= 180
    && typeof record.type === 'string'
    && record.type.length > 0
    && record.type.length <= 48
    && typeof record.title === 'string'
    && record.title.length <= 180
    && typeof record.message === 'string'
    && record.message.length <= 2000
    && typeof record.createdAt === 'string'
    && Number.isFinite(Date.parse(record.createdAt))
    && typeof record.seen === 'boolean'
    && typeof record.dismissed === 'boolean'
    && (record.action === undefined || record.action === 'open-welcome')
    && (record.actionLabel === undefined || typeof record.actionLabel === 'string')
  );
}

function validateStore(value) {
  return Array.isArray(value)
    && value.length <= MAX_NOTIFICATIONS
    && value.every(validRecord);
}

function validPreferences(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.enabledTypes
    && typeof value.enabledTypes === 'object'
    && !Array.isArray(value.enabledTypes)
    && Object.entries(value.enabledTypes).every(([type, enabled]) =>
      type.length > 0 && type.length <= 48 && typeof enabled === 'boolean')
    && RETENTION_OPTIONS.has(value.retentionDays),
  );
}

function makeId() {
  return `notice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createNotificationCenter({
  button,
  panel,
  list,
  emptyState,
  clearButton,
  status,
  toastContainer,
  onAction = () => {},
  closeOtherPanels = () => {},
}) {
  let notifications = readJSON(STORAGE_KEY, [], { validate: validateStore });
  if (!Array.isArray(notifications)) notifications = [];
  const savedPreferences = readJSON(PREFERENCES_KEY, DEFAULT_PREFERENCES, { validate: validPreferences });
  let preferences = {
    enabledTypes: { ...savedPreferences.enabledTypes },
    retentionDays: savedPreferences.retentionDays,
  };

  function categoryEnabled(type) {
    return preferences.enabledTypes[type] !== false;
  }

  function getPreferences() {
    return {
      enabledTypes: { ...preferences.enabledTypes },
      retentionDays: preferences.retentionDays,
    };
  }

  function notifyPreferencesChanged() {
    window.dispatchEvent(new CustomEvent('desktop-notification-preferences-change', {
      detail: getPreferences(),
    }));
  }

  function setCategoryEnabled(type, enabled) {
    if (typeof type !== 'string' || !type || type.length > 48 || typeof enabled !== 'boolean') {
      throw new TypeError('A notification category and enabled state are required.');
    }
    const next = {
      enabledTypes: { ...preferences.enabledTypes, [type]: enabled },
      retentionDays: preferences.retentionDays,
    };
    if (!writeJSON(PREFERENCES_KEY, next, { validate: validPreferences })) {
      throw new Error('The notification preference could not be saved in this browser.');
    }
    preferences = next;
    render();
    notifyPreferencesChanged();
    return getPreferences();
  }

  function setRetentionDays(days) {
    const retentionDays = Number(days);
    if (!RETENTION_OPTIONS.has(retentionDays)) {
      throw new TypeError('Choose a valid notification retention period.');
    }
    const next = {
      enabledTypes: { ...preferences.enabledTypes },
      retentionDays,
    };
    if (!writeJSON(PREFERENCES_KEY, next, { validate: validPreferences })) {
      throw new Error('The notification preference could not be saved in this browser.');
    }
    preferences = next;
    pruneExpiredNotifications();
    render();
    notifyPreferencesChanged();
    return getPreferences();
  }

  function pruneExpiredNotifications() {
    if (preferences.retentionDays === 0) return false;
    const cutoff = Date.now() - preferences.retentionDays * 24 * 60 * 60 * 1000;
    const retained = notifications.filter(record =>
      !(record.seen || record.dismissed) || Date.parse(record.createdAt) >= cutoff);
    if (retained.length === notifications.length) return false;
    notifications = retained;
    persist();
    return true;
  }

  function persist() {
    const valid = notifications.filter(validRecord).slice(0, MAX_NOTIFICATIONS);
    notifications = valid;
    const saved = writeJSON(STORAGE_KEY, notifications, { validate: validateStore });
    if (!saved && status) status.textContent = 'The notification change could not be saved in this browser.';
    return saved;
  }

  function render() {
    const visible = notifications.filter(record => !record.dismissed && categoryEnabled(record.type));
    const unread = visible.filter(item => !item.seen).length;
    button.setAttribute('aria-label', unread ? `Notifications, ${unread} unseen` : 'Notifications');
    button.title = unread ? `${unread} unseen notification${unread === 1 ? '' : 's'}` : 'Notifications';
    button.querySelector('.notification-unseen-dot').hidden = unread === 0;
    clearButton.hidden = visible.length === 0;
    emptyState.hidden = visible.length !== 0;
    list.replaceChildren();

    for (const record of visible) {
      const item = document.createElement('li');
      item.className = `notification-item${record.seen ? '' : ' is-unseen'}`;
      item.dataset.notificationId = record.id;

      const copy = document.createElement('div');
      copy.className = 'notification-item-copy';
      const title = document.createElement('strong');
      title.textContent = record.title;
      if (!record.seen) {
        const newLabel = document.createElement('span');
        newLabel.className = 'notification-new-label';
        newLabel.textContent = 'New';
        title.append(' ', newLabel);
      }
      const message = document.createElement('p');
      message.textContent = record.message;
      const time = document.createElement('time');
      time.dateTime = record.createdAt;
      time.textContent = new Date(record.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      copy.append(title, message, time);

      const actions = document.createElement('div');
      actions.className = 'notification-item-actions';
      if (record.action === 'open-welcome') {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'notification-item-action';
        action.dataset.notificationAction = record.action;
        action.dataset.notificationId = record.id;
        action.textContent = record.actionLabel || 'Open Welcome';
        actions.append(action);
      }
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'notification-item-dismiss';
      dismiss.dataset.dismissNotification = record.id;
      dismiss.setAttribute('aria-label', `Dismiss ${record.title}`);
      dismiss.title = 'Dismiss';
      dismiss.textContent = '×';
      actions.append(dismiss);
      item.append(copy, actions);
      list.append(item);
    }
  }

  function add(record) {
    if (!record || typeof record !== 'object') return null;
    const normalized = {
      id: typeof record.id === 'string' && record.id ? record.id : makeId(),
      type: typeof record.type === 'string' ? record.type.slice(0, 48) : 'general',
      title: typeof record.title === 'string' ? record.title.slice(0, 180) : '',
      message: typeof record.message === 'string' ? record.message.slice(0, 2000) : '',
      createdAt: typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
        ? record.createdAt
        : new Date().toISOString(),
      seen: !panel.hidden,
      dismissed: false,
      ...(record.action === 'open-welcome' ? { action: record.action } : {}),
      ...(typeof record.actionLabel === 'string' ? { actionLabel: record.actionLabel.slice(0, 80) } : {}),
    };
    if (!normalized.title || !normalized.message || !validRecord(normalized)) return null;
    const existing = notifications.find(item => item.id === normalized.id);
    if (existing) return null;
    notifications.unshift(normalized);
    notifications = notifications.slice(0, MAX_NOTIFICATIONS);
    persist();
    render();
    if (status) status.textContent = `${normalized.title}: ${normalized.message}`;
    return normalized;
  }

  function dismiss(id) {
    const record = notifications.find(item => item.id === id && !item.dismissed);
    if (!record) return false;
    record.dismissed = true;
    record.seen = true;
    persist();
    render();
    return true;
  }

  function dismissWelcomeReminder() {
    const remaining = notifications.filter(item => item.id !== 'welcome-startup-reminder');
    if (remaining.length === notifications.length) return;
    notifications = remaining;
    persist();
    render();
  }

  function markVisibleAsSeen() {
    let changed = false;
    for (const record of notifications) {
      if (!record.dismissed && categoryEnabled(record.type) && !record.seen) {
        record.seen = true;
        changed = true;
      }
    }
    if (changed) persist();
    render();
  }

  function open() {
    closeOtherPanels();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    markVisibleAsSeen();
  }

  function close({ restoreFocus = false } = {}) {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus({ preventScroll: true });
  }

  function toggle() {
    if (panel.hidden) open();
    else close();
  }

  function clearAll() {
    for (const record of notifications) {
      if (!record.dismissed && categoryEnabled(record.type)) {
        record.dismissed = true;
        record.seen = true;
      }
    }
    persist();
    render();
    status.textContent = 'Notifications cleared.';
  }

  function showToast({ id, title, message, icon = '•', role = 'status' }) {
    if (!toastContainer || !title || !message) return null;
    const existing = id
      ? [...toastContainer.querySelectorAll('.in-app-notification')].find(item => item.dataset.toastId === id)
      : null;
    if (existing) {
      existing.querySelector('.in-app-notification-copy span').textContent = message;
      return existing;
    }
    const notice = document.createElement('article');
    notice.className = 'in-app-notification';
    if (id) notice.dataset.toastId = id;
    notice.setAttribute('role', role);
    if (role === 'alert') {
      notice.setAttribute('aria-live', 'assertive');
      notice.setAttribute('aria-atomic', 'true');
    }
    const iconElement = document.createElement('span');
    iconElement.className = 'in-app-notification-icon';
    iconElement.setAttribute('aria-hidden', 'true');
    iconElement.textContent = icon;
    const copy = document.createElement('div');
    copy.className = 'in-app-notification-copy';
    const titleElement = document.createElement('strong');
    titleElement.textContent = title;
    const messageElement = document.createElement('span');
    messageElement.textContent = message;
    copy.append(titleElement, messageElement);
    const dismissButton = document.createElement('button');
    dismissButton.className = 'in-app-notification-dismiss';
    dismissButton.type = 'button';
    dismissButton.setAttribute('aria-label', `Dismiss ${title}`);
    dismissButton.textContent = '×';
    dismissButton.addEventListener('click', () => notice.remove());
    notice.append(iconElement, copy, dismissButton);
    toastContainer.append(notice);
    return notice;
  }

  function findRecoveryToast(key) {
    return [...toastContainer.querySelectorAll('[data-data-handler-recovery]')]
      .find(notice => notice.dataset.dataHandlerRecovery === key) || null;
  }

  function recoveryKeyLabel(key) {
    return String(key || 'desktop data')
      .replace(/^personal-desktop-/, '')
      .replace(/^desktop-/, '')
      .replace(/-v\d+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  function showDataError(detail = {}) {
    const operation = detail.operation;
    const titleText = operation === 'read' ? 'Could not read saved data'
      : operation === 'remove' ? 'Could not remove saved data'
        : 'Could not save data';
    const messageText = operation === 'read'
      ? 'A saved item could not be read. Check the page before making more changes.'
      : operation === 'remove'
        ? 'A saved item could not be removed from this browser.'
        : 'A change could not be saved in this browser. Try again before leaving this page.';
    showToast({
      id: 'data-handler-notice',
      title: titleText,
      message: messageText,
      icon: '!',
      role: 'alert',
    });
  }

  function showDataRecoveryAvailable(detail = {}) {
    const key = detail.key;
    if (typeof key !== 'string' || !key || findRecoveryToast(key)) return;
    const label = recoveryKeyLabel(key);
    const notice = document.createElement('article');
    notice.className = 'in-app-notification';
    notice.dataset.dataHandlerRecovery = key;
    notice.setAttribute('role', 'alert');
    notice.setAttribute('aria-live', 'assertive');
    notice.setAttribute('aria-atomic', 'true');
    notice.tabIndex = -1;
    const icon = document.createElement('span');
    icon.className = 'in-app-notification-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '↺';
    const copy = document.createElement('div');
    copy.className = 'in-app-notification-copy';
    const title = document.createElement('strong');
    title.className = 'data-handler-recovery-title';
    title.textContent = 'Previous saved copy available';
    const message = document.createElement('span');
    message.className = 'data-handler-recovery-message';
    message.textContent = `A previous copy of ${label} is available. The current stored value is unchanged; restoring will replace it with that copy.`;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'data-handler-recovery-action';
    restore.textContent = 'Restore Previous Copy';
    restore.setAttribute('aria-label', `Restore previous copy for ${label}`);
    restore.addEventListener('click', () => restoreDataBackup(key));
    copy.append(title, message, restore);
    notice.append(icon, copy);
    toastContainer.append(notice);
  }

  function showDataRecoveryResult(type, detail = {}) {
    const notice = findRecoveryToast(detail.key);
    if (!notice) return;
    const title = notice.querySelector('.data-handler-recovery-title');
    const message = notice.querySelector('.data-handler-recovery-message');
    const restore = notice.querySelector('.data-handler-recovery-action');
    const restored = type === 'desktop-data-recovery-restored';
    const saved = type === 'desktop-data-recovery-saved';
    if (restored || saved) {
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      title.textContent = restored ? 'Previous saved copy restored' : 'A new saved copy is available';
      message.textContent = restored
        ? 'The previous copy is now restored in this browser.'
        : 'A newer copy was saved. This recovery prompt is no longer needed.';
      restore?.remove();
      if (restored) notice.focus({ preventScroll: true });
      return;
    }
    notice.setAttribute('role', 'alert');
    notice.setAttribute('aria-live', 'assertive');
    title.textContent = 'Could not restore the saved copy';
    message.textContent = detail.reason === 'data-changed'
      ? 'The saved value changed before recovery. Reload the page to check the latest copy.'
      : detail.reason === 'copy-invalid'
        ? 'The previous copy is no longer valid. Your current stored value was not changed.'
        : detail.reason === 'copy-unavailable'
          ? 'The previous copy is no longer available. Your current stored value was not changed.'
          : 'Browser storage blocked recovery. Your current stored value was not changed; try again.';
    if (detail.reason === 'data-changed' || detail.reason === 'copy-invalid' || detail.reason === 'copy-unavailable') {
      restore?.remove();
      notice.focus({ preventScroll: true });
    }
  }

  function handleDataEvent(type, detail) {
    if (!DATA_EVENTS.has(type)) return;
    if (type === 'desktop-data-error') {
      showDataError(detail);
      return;
    }
    if (type === 'desktop-data-recovery-available') {
      showDataRecoveryAvailable(detail);
      return;
    }
    if (type === 'desktop-data-recovery-cleared') {
      findRecoveryToast(detail?.key)?.remove();
      return;
    }
    showDataRecoveryResult(type, detail);
  }

  button.addEventListener('click', toggle);
  clearButton.addEventListener('click', clearAll);
  list.addEventListener('click', event => {
    const dismissButton = event.target.closest('[data-dismiss-notification]');
    if (dismissButton) {
      dismiss(dismissButton.dataset.dismissNotification);
      return;
    }
    const actionButton = event.target.closest('[data-notification-action]');
    if (!actionButton) return;
    const record = notifications.find(item => item.id === actionButton.dataset.notificationId);
    if (!record) return;
    try { onAction(record.action, record); } finally {
      dismiss(record.id);
      close();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (panel.hidden || panel.contains(event.target) || button.contains(event.target)) return;
    close();
  });

  pruneExpiredNotifications();
  render();

  return {
    add,
    close,
    dismiss,
    dismissWelcomeReminder,
    getPreferences,
    handleDataEvent,
    isCategoryEnabled: categoryEnabled,
    open,
    setCategoryEnabled,
    setRetentionDays,
    showToast,
    toggle,
  };
}
