'use strict';

import { S }               from './desktop-state.js';
import { loadStickyNotes } from './apps/sticky-notes-data.js';
import { SETTINGS_ICON } from './apps/toolbar.js';
import { retryWithBackoff, responseLoadError } from './shared/retry.js';
import { GAMES, initGameMenu } from './apps/game-catalog.js';
import { readJSON, readRaw, readRawResult, removeData, writeJSON, writeRaw } from './data-handler.js';

// ── DOM refs ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const appMenuBtn       = $('app-menu-btn');
const appMenu          = $('app-menu');
const helpOverlay      = $('help-overlay');
const helpCloseBtn     = $('help-close-btn');
const helpOpenLauncher = $('help-open-launcher');
const openAppsBar      = $('open-apps-bar');
const activeTitle      = $('active-title');
const closeBtn         = $('close-btn');
const overviewBtn      = $('overview-btn');
const winMenuBtn       = $('win-menu-btn');
const systemTimeBtn    = $('system-time-btn');
const systemPanel      = $('system-panel');
const appStrip         = $('app-strip');
const appStripWrapper  = $('app-strip-wrapper');
const emptyState       = $('empty-state');
const desktopWidgets   = $('desktop-widgets');
const showDesktopBtn   = $('show-desktop-btn');
window.addEventListener('desktop-data-error', showDataHandlerNotification);
window.addEventListener('desktop-data-recovered', showDataHandlerNotification);

// ── Width helpers ─────────────────────────────────────────────
function rem() { return parseFloat(getComputedStyle(document.documentElement).fontSize); }
const EDGE = () => 2 * rem();
const GAP  = () => 1 * rem();
const WIDTH_PRESETS = ['third', 'half', 'full'];

// ── System panel, clock, calendar, and quick settings ─────────
const themeToggle = $('theme-toggle');
const themeReset  = $('theme-reset');
const themeSplit  = themeToggle.closest('.theme-split');
const themeMedia  = matchMedia('(prefers-color-scheme: dark)');
const THEME_KEY   = 'desktop-theme';
const TIME_KEY    = 'desktop-time-24h';
const WALLPAPER_KEY = 'desktop-wallpaper-settings-v1';
const WINDOW_ANIMATION_KEY = 'desktop-window-animation';
const ANIMATION_PREFERENCES_KEY = 'desktop-animation-preferences-v1';
const WINDOW_ANIMATION_EFFECTS = ['fade', 'zoom', 'slide-up', 'slide-left', 'flip'];
const SHOW_DESKTOP_ANIMATION_EFFECTS = ['fade', 'zoom', 'slide-up', 'tilt-up', 'flip'];
const OVERVIEW_ANIMATION_EFFECTS = ['fade', 'zoom', 'slide-up', 'rubber-band'];
const WALLPAPER_TRANSITION_EFFECTS = ['fade', 'zoom', 'slide-left', 'slide-right', 'wipe'];
const ANIMATION_EVENT_EFFECTS = {
  windowOpen: WINDOW_ANIMATION_EFFECTS,
  windowClose: WINDOW_ANIMATION_EFFECTS,
  showDesktop: SHOW_DESKTOP_ANIMATION_EFFECTS,
  overview: OVERVIEW_ANIMATION_EFFECTS,
};
const REMINDER_KEY = 'desktop-reminders';
const REMINDER_BACKGROUND_KEY = 'desktop-reminder-background';
let calendarDate  = new Date();
let selectedCalendarDate = new Date();
let use24HourTime = readRaw(TIME_KEY) === 'true';
let reminders = [];
const reminderNotificationTimers = new Map();
let systemNotificationsEnabled = readRaw(REMINDER_BACKGROUND_KEY) === 'true';
const storedReminders = readJSON(REMINDER_KEY, [], { validate: Array.isArray });
if (Array.isArray(storedReminders)) reminders = storedReminders;

function effectiveTheme() {
  return document.documentElement.dataset.theme || (themeMedia.matches ? 'dark' : 'light');
}

function notifyDesktopSettingsChanged() {
  window.dispatchEvent(new Event('desktop-settings-change'));
}

function normalizeAnimationChoices(value, effects, fallback) {
  if (Array.isArray(value)) return [...new Set(value.filter(effect => effects.includes(effect)))];
  if (value === 'none') return [];
  if (value === 'random') return [...effects];
  return effects.includes(value) ? [value] : [...fallback];
}

function getAnimationPreferences() {
  const defaults = {
    windowOpen: ['fade'],
    windowClose: ['fade'],
    showDesktop: ['zoom'],
    overview: ['zoom'],
  };
  const stored = readJSON(ANIMATION_PREFERENCES_KEY, null, {
    validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
  });
  if (stored) {
    return Object.fromEntries(Object.entries(ANIMATION_EVENT_EFFECTS).map(([event, effects]) => [
      event,
      normalizeAnimationChoices(stored[event], effects, defaults[event]),
    ]));
  }

  const legacy = readRaw(WINDOW_ANIMATION_KEY);
  if (legacy !== null) {
    const windowChoices = normalizeAnimationChoices(legacy, WINDOW_ANIMATION_EFFECTS, ['fade']);
    defaults.windowOpen = windowChoices;
    defaults.windowClose = [...windowChoices];
  }
  return defaults;
}

function chooseAnimation(preferences) {
  if (!preferences?.length) return 'none';
  return preferences[Math.floor(Math.random() * preferences.length)];
}

function chooseAnimationForEvent(event) {
  const effects = ANIMATION_EVENT_EFFECTS[event] || [];
  return chooseAnimation(normalizeAnimationChoices(getAnimationPreferences()[event], effects, []));
}

function setAnimationPreference(event, value) {
  const effects = ANIMATION_EVENT_EFFECTS[event];
  if (!effects) throw new Error('Unknown animation setting.');
  const preferences = getAnimationPreferences();
  preferences[event] = normalizeAnimationChoices(value, effects, []);
  if (!writeJSON(ANIMATION_PREFERENCES_KEY, preferences)) {
    throw new Error('The animation preference could not be saved in browser storage.');
  }
  const openClose = preferences.windowOpen.length === preferences.windowClose.length &&
    preferences.windowOpen.every(effect => preferences.windowClose.includes(effect));
  if (openClose) {
    writeRaw(
      WINDOW_ANIMATION_KEY,
      preferences.windowOpen.length === 0 ? 'none' : preferences.windowOpen.length === 1 ? preferences.windowOpen[0] : 'random',
    );
  }
  notifyDesktopSettingsChanged();
}

function applyTheme(theme = readRaw(THEME_KEY), { persist = true } = {}) {
  const hasOverride = theme === 'light' || theme === 'dark';
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
    if (persist) writeRaw(THEME_KEY, theme);
  } else {
    delete document.documentElement.dataset.theme;
    if (persist) removeData(THEME_KEY);
  }
  themeToggle.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
  themeSplit.classList.toggle('has-override', hasOverride);
  themeReset.setAttribute('aria-hidden', String(!hasOverride));
  themeReset.tabIndex = hasOverride ? 0 : -1;
  notifyDesktopSettingsChanged();
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], {
    hour: use24HourTime ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: !use24HourTime
  });
  $('system-time').textContent = time;
  $('system-panel-time').textContent = time;
  $('system-panel-date').textContent = now.toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric'
  });
}

function setTimeFormat(enabled) {
  use24HourTime = Boolean(enabled);
  writeRaw(TIME_KEY, String(use24HourTime));
  timeFormatToggle?.setAttribute('aria-pressed', String(use24HourTime));
  updateClock();
  renderReminders();
  notifyDesktopSettingsChanged();
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function clearReminderNotification(id) {
  const timer = reminderNotificationTimers.get(id);
  if (timer) clearTimeout(timer);
  reminderNotificationTimers.delete(id);
}

function showInAppReminderNotification(reminder) {
  const container = $('in-app-notifications');
  const existing = container.querySelector(`[data-reminder-id="${CSS.escape(reminder.id)}"]`);
  if (existing) existing.remove();

  const notice = document.createElement('article');
  notice.className = 'in-app-notification';
  notice.dataset.reminderId = reminder.id;
  notice.setAttribute('role', 'alert');

  const icon = document.createElement('span');
  icon.className = 'in-app-notification-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-6-6.92V2h-2v2.08A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>';

  const copy = document.createElement('div');
  copy.className = 'in-app-notification-copy';
  const title = document.createElement('strong');
  title.textContent = 'Reminder';
  const body = document.createElement('span');
  body.textContent = reminder.text;
  copy.append(title, body);

  const dismiss = document.createElement('button');
  dismiss.className = 'in-app-notification-dismiss';
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss reminder notification');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => notice.remove());

  notice.append(icon, copy, dismiss);
  container.appendChild(notice);
}

function showDataHandlerNotification(event) {
  const container = $('in-app-notifications');
  const recovered = event.type === 'desktop-data-recovered';
  const operation = event.detail?.operation;
  const titleText = recovered ? 'Saved data recovered'
    : operation === 'read' ? 'Could not read saved data'
      : operation === 'remove' ? 'Could not remove saved data'
        : 'Could not save data';
  const messageText = recovered
    ? 'A previous saved copy was restored. The original data was left untouched.'
    : operation === 'read'
      ? 'A saved item could not be read. Check the page before making more changes.'
      : operation === 'remove'
        ? 'A saved item could not be removed from this browser.'
        : 'A change could not be saved in this browser. Try again before leaving this page.';
  let notice = container.querySelector('[data-data-handler-notice]');
  if (!notice) {
    notice = document.createElement('article');
    notice.className = 'in-app-notification';
    notice.dataset.dataHandlerNotice = 'true';
    notice.setAttribute('role', recovered ? 'status' : 'alert');
    const icon = document.createElement('span');
    icon.className = 'in-app-notification-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = recovered ? '↺' : '!';
    const copy = document.createElement('div');
    copy.className = 'in-app-notification-copy';
    const title = document.createElement('strong');
    title.className = 'data-handler-notice-title';
    const message = document.createElement('span');
    message.className = 'data-handler-notice-message';
    copy.append(title, message);
    const dismiss = document.createElement('button');
    dismiss.className = 'in-app-notification-dismiss';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss saved data notice');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => notice.remove());
    notice.append(icon, copy, dismiss);
    container.appendChild(notice);
  }
  notice.querySelector('.data-handler-notice-title').textContent = titleText;
  notice.querySelector('.data-handler-notice-message').textContent = messageText;
}

function scheduleReminderNotification(reminder) {
  clearReminderNotification(reminder.id);
  const delay = new Date(reminder.dueAt || reminder.when).getTime() - Date.now();
  if (delay <= 0) return;
  const maxDelay = 2_147_483_647;
  const timer = setTimeout(() => {
    if (delay > maxDelay) {
      scheduleReminderNotification(reminder);
      return;
    }
    try {
      const systemNotificationsAvailable =
        systemNotificationsEnabled
        && 'Notification' in window
        && Notification.permission === 'granted';
      if (systemNotificationsAvailable) {
        const notification = new Notification('Reminder', { body: reminder.text });
        notification.addEventListener('click', () => window.focus());
      } else {
        showInAppReminderNotification(reminder);
      }
    } catch (error) {
      console.warn('[reminders] Local notification failed.', error);
      showInAppReminderNotification(reminder);
    }
    reminderNotificationTimers.delete(reminder.id);
  }, Math.min(delay, maxDelay));
  reminderNotificationTimers.set(reminder.id, timer);
}

function updateNotificationSetting() {
  const toggle = $('reminder-notification-toggle');
  const state = $('reminder-notification-state');
  const supported = 'Notification' in window;
  const blocked = supported && Notification.permission === 'denied';
  toggle.hidden = !supported;
  toggle.disabled = !supported || (blocked && !systemNotificationsEnabled);
  toggle.setAttribute('aria-pressed', String(systemNotificationsEnabled));
  state.textContent = !supported ? 'Unavailable' : blocked ? 'Blocked' : '';
  toggle.title = blocked
    ? 'System notifications are blocked in browser settings'
    : systemNotificationsEnabled
      ? 'Turn off system notifications and use built-in notifications'
      : 'Turn on system notifications while this page is open';
}

async function setSystemNotificationsEnabled(enabled) {
  if (enabled) {
    if (!('Notification' in window)) {
      throw new Error('System notifications are unavailable in this browser.');
    }
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error(permission === 'denied'
        ? 'Notifications are blocked by your browser settings.'
        : 'Notification permission was not granted.');
    }
    systemNotificationsEnabled = true;
    writeRaw(REMINDER_BACKGROUND_KEY, 'true');
  } else {
    systemNotificationsEnabled = false;
    removeData(REMINDER_BACKGROUND_KEY);
  }
  reminders.forEach(scheduleReminderNotification);
  updateNotificationSetting();
  notifyDesktopSettingsChanged();
  return systemNotificationsEnabled;
}

async function removeLegacyBackgroundNotifications() {
  removeData('desktop-reminder-client-id');
  removeData('desktop-reminder-capability');
  removeData('desktop-reminder-cleanup-pending');
  removeData('desktop-reminder-sync-queue');
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations
    .filter(registration => {
      const scriptUrl = registration.active?.scriptURL
        || registration.waiting?.scriptURL
        || registration.installing?.scriptURL;
      return scriptUrl && new URL(scriptUrl).pathname === '/service-worker.js';
    })
    .map(async registration => {
      const subscription = await registration.pushManager?.getSubscription();
      if (subscription) await subscription.unsubscribe();
      await registration.unregister();
    }));
}

function renderReminders() {
  const list = $('reminder-list');
  list.innerHTML = '';
  reminders.sort((a, b) => new Date(a.when) - new Date(b.when));
  const selectedKey = localDateKey(selectedCalendarDate);
  const selectedReminders = reminders.filter(reminder => {
    const date = new Date(reminder.when);
    return !Number.isNaN(date.getTime()) && localDateKey(date) === selectedKey;
  });
  if (!selectedReminders.length) {
    list.innerHTML = '<p class="reminder-empty">No reminders for this date</p>';
    return;
  }
  selectedReminders.forEach(reminder => {
    const item = document.createElement('article');
    item.className = 'reminder-item';
    const title = document.createElement('strong');
    title.textContent = reminder.text;
    const time = document.createElement('time');
    const date = new Date(reminder.when);
    time.dateTime = reminder.when;
    time.textContent = date.toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: use24HourTime ? '2-digit' : 'numeric',
      minute: '2-digit', hour12: !use24HourTime
    });
    const remove = document.createElement('button');
    remove.className = 'reminder-delete';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${reminder.text}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      clearReminderNotification(reminder.id);
      reminders = reminders.filter(item => item.id !== reminder.id);
      writeJSON(REMINDER_KEY, reminders, { validate: Array.isArray });
      renderReminders();
    });
    item.append(title, time, remove);
    list.appendChild(item);
  });
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const today = new Date();
  $('calendar-title').textContent = calendarDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const days = $('calendar-days');
  days.innerHTML = '';
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.textContent = date.getDate();
    if (date.getMonth() !== month) cell.classList.add('outside');
    if (date.toDateString() === today.toDateString()) cell.classList.add('today');
    const isSelected = date.toDateString() === selectedCalendarDate.toDateString();
    if (isSelected) cell.classList.add('selected');
    cell.setAttribute('aria-pressed', String(isSelected));
    cell.setAttribute('aria-label', date.toLocaleDateString());
    cell.addEventListener('click', () => {
      selectedCalendarDate = new Date(date);
      calendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
      renderCalendar();
      renderReminders();
    });
    days.appendChild(cell);
  }
}

function closeSystemPanel() {
  systemPanel.hidden = true;
  systemTimeBtn.setAttribute('aria-expanded', 'false');
}

systemTimeBtn.addEventListener('click', e => {
  e.stopPropagation();
  const opening = systemPanel.hidden;
  systemPanel.hidden = !opening;
  systemTimeBtn.setAttribute('aria-expanded', String(opening));
  if (opening) {
    closeAppMenu();
    updateClock();
    renderCalendar();
  }
});
systemPanel.addEventListener('click', e => e.stopPropagation());
themeToggle.addEventListener('click', () => applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'));
themeReset.addEventListener('click', () => applyTheme(null));
themeMedia.addEventListener('change', () => {
  if (!readRaw(THEME_KEY)) applyTheme(null, { persist: false });
});
$('settings-open-btn').addEventListener('click', () => {
  closeSystemPanel();
  openApp('settings');
});
const timeFormatToggle = $('time-format-toggle');
timeFormatToggle.setAttribute('aria-pressed', String(use24HourTime));
timeFormatToggle.addEventListener('click', () => setTimeFormat(!use24HourTime));
$('calendar-prev').addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  renderCalendar();
});
$('calendar-next').addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  renderCalendar();
});
$('add-reminder-btn').addEventListener('click', () => {
  const form = $('reminder-form');
  form.hidden = false;
  const now = new Date();
  const defaultWhen = new Date(
    selectedCalendarDate.getFullYear(),
    selectedCalendarDate.getMonth(),
    selectedCalendarDate.getDate(),
    selectedCalendarDate.toDateString() === now.toDateString() ? now.getHours() + 1 : 9,
    0
  );
  defaultWhen.setMinutes(defaultWhen.getMinutes() - defaultWhen.getTimezoneOffset());
  $('reminder-when').value = defaultWhen.toISOString().slice(0, 16);
  $('reminder-text').focus();
});
$('cancel-reminder').addEventListener('click', () => {
  $('reminder-form').reset();
  $('reminder-form').hidden = true;
});
$('reminder-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('reminder-text').value.trim();
  const when = $('reminder-when').value;
  if (!text || !when) return;
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(updateNotificationSetting);
  }
  const reminder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    when,
    dueAt: new Date(when).toISOString(),
  };
  reminders.push(reminder);
  writeJSON(REMINDER_KEY, reminders, { validate: Array.isArray });
  scheduleReminderNotification(reminder);
  event.currentTarget.reset();
  event.currentTarget.hidden = true;
  renderReminders();
});
$('reminder-notification-toggle').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try {
    await setSystemNotificationsEnabled(!systemNotificationsEnabled);
  } catch (error) {
    console.warn('[reminders] System notification setting failed.', error);
  } finally {
    updateNotificationSetting();
    event.currentTarget.disabled = false;
  }
});
applyTheme(readRaw(THEME_KEY), { persist: false });
updateClock();
renderReminders();
updateNotificationSetting();
reminders.forEach(scheduleReminderNotification);
removeLegacyBackgroundNotifications().catch(error => {
  console.warn('[reminders] Could not remove the legacy background notification worker.', error);
});
setInterval(updateClock, 30000);

// ── Session persistence ────────────────────────────────────────
const SESSION_KEY    = 'desktop-session-v2';
const SESSION_KEY_V1 = 'desktop-session-v1';

function saveSession() {
  if (S._skipSave) return;
  try {
    const focusedColumnIndex = S.columns.findIndex(col => col.appIds.includes(S.focusedId));
    const focusedPosition = focusedColumnIndex < 0 ? null : {
      columnIndex: focusedColumnIndex,
      appIndex: S.columns[focusedColumnIndex].appIds.indexOf(S.focusedId),
    };
    writeJSON(SESSION_KEY, {
      v: 2,
      focused: focusedPosition,
      columns: S.columns.map(col => ({
        widthPreset: col.widthPreset,
        apps: col.appIds.map(appId => {
          const app = S.apps.find(a => a.id === appId);
          const state = S.appApis[appId]?.getSessionState?.();
          return { type: app.type, ...(state ? { state } : {}) };
        }),
      })),
    }, { validate: value => value?.v === 2 && Array.isArray(value.columns) });
  } catch { /* storage unavailable */ }
}

function safeRemoveSession() {
  removeData(SESSION_KEY);
  removeData(SESSION_KEY_V1);
}

// ── Context-aware title ────────────────────────────────────────
function setAppTitle(id, title) {
  S.appTitles[id] = title;
  if (id === S.focusedId) activeTitle.textContent = title;
}

// ── Toast ──────────────────────────────────────────────────────
function toast(anchorEl, msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  anchorEl.appendChild(t);
  t.addEventListener('animationend', e => { if (e.animationName === 'toastOut') t.remove(); });
}

// ── Column helpers ─────────────────────────────────────────────
function getAppColumn(appId) {
  return S.columns.find(col => col.appIds.includes(appId));
}

function getAppOrder() {
  return S.columns.flatMap(col => col.appIds);
}

const loadedAppModules = new Map();
const loadedAppStyles = new Map();

function loadAppModule(def, onRetry) {
  let loading = loadedAppModules.get(def.modulePath);
  if (!loading) {
    loading = retryWithBackoff(() => def.loadModule(), { onRetry })
      .catch(error => {
        loadedAppModules.delete(def.modulePath);
        throw error;
      });
    loadedAppModules.set(def.modulePath, loading);
  }
  return loading;
}

function loadAppStylesheet(path) {
    const href = new URL(path, import.meta.url).href;
    let loading = loadedAppStyles.get(href);
    if (!loading) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.appStylesheet = 'true';
      loading = new Promise((resolve, reject) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', () => {
          link.remove();
          loadedAppStyles.delete(href);
          reject(new Error(`Could not load app stylesheet: ${path}`));
        }, { once: true });
      });
      loadedAppStyles.set(href, loading);
      document.head.append(link);
    }
    return loading;
}

function ensureAppStyles(styles = [], onRetry) {
  return Promise.all(styles.map(path => retryWithBackoff(
    () => loadAppStylesheet(path),
    { onRetry },
  )));
}

function createAppLoadSurface(title, mode = 'loading') {
  const root = document.createElement('section');
  root.className = 'utility-app app-window app-load-state';
  root.dataset.loadState = mode;
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-busy', String(mode === 'loading'));

  const content = document.createElement('div');
  content.className = 'app-load-content';
  if (mode === 'loading') {
    const message = document.createElement('p');
    message.className = 'app-load-title';
    message.textContent = `Loading ${title}…`;
    const detail = document.createElement('p');
    detail.className = 'app-load-detail';
    detail.textContent = 'Preparing app resources…';
    const skeleton = document.createElement('div');
    skeleton.className = 'app-loading-skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    skeleton.innerHTML = `
      <div class="app-skeleton-toolbar">
        <i class="app-skeleton-chip"></i><i class="app-skeleton-chip"></i>
        <i class="app-skeleton-chip"></i><i class="app-skeleton-chip app-skeleton-chip-short"></i>
      </div>
      <div class="app-skeleton-layout">
        <div class="app-skeleton-sidebar">
          <i class="app-skeleton-bar app-skeleton-bar-medium"></i>
          <i class="app-skeleton-bar"></i><i class="app-skeleton-bar"></i>
          <i class="app-skeleton-bar app-skeleton-bar-short"></i>
        </div>
        <div class="app-skeleton-main">
          <i class="app-skeleton-bar app-skeleton-bar-heading"></i>
          <i class="app-skeleton-bar"></i><i class="app-skeleton-bar"></i>
          <i class="app-skeleton-bar app-skeleton-bar-medium"></i>
          <i class="app-skeleton-panel"></i>
        </div>
      </div>`;
    content.append(message, detail, skeleton);
  } else {
    const heading = document.createElement('p');
    heading.className = 'app-load-title';
    heading.textContent = `${title} couldn’t be loaded`;
    const message = document.createElement('p');
    message.className = 'app-load-error';
    message.textContent = 'Check your connection, then try again.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'app-load-retry';
    retry.textContent = 'Retry';
    content.append(heading, message, retry);
  }
  root.append(content);
  return root;
}

function reportAppLoadRetry(record, { attempt, maxRetries, delayMs }) {
  if (!S.apps.includes(record) || record.el.dataset.loadState !== 'loading') return;
  const detail = record.el.querySelector('.app-load-detail');
  if (detail) {
    detail.textContent = `Temporary load issue. Retrying ${attempt} of ${maxRetries} in ${(delayMs / 1000).toFixed(1)}s…`;
  }
}

function scheduleAppAssetPrefetch() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return;

  const modulePaths = new Set([
    ...Object.values(APP_DEFS).map(def => def.modulePath),
    './shared/markdown.js',
    './apps/games/solitaire-ui.js',
    './apps/games/minesweeper-ui.js',
    './apps/games/board-ui.js',
  ]);
  const stylePaths = new Set(Object.values(APP_DEFS).flatMap(def => def.styles || []));
  const assets = [
    ...[...modulePaths].map(path => ({ path, kind: 'module' })),
    ...[...stylePaths].map(path => ({ path, kind: 'style' })),
  ];
  const requested = new Set();
  let index = 0;

  const addHint = asset => {
    const href = new URL(asset.path, import.meta.url).href;
    if (requested.has(href)) return;
    requested.add(href);
    const link = document.createElement('link');
    link.rel = asset.kind === 'module' ? 'modulepreload' : 'prefetch';
    if (asset.kind === 'style') link.as = 'style';
    link.href = href;
    link.fetchPriority = 'low';
    link.dataset.appAssetPrefetch = asset.kind;
    document.head.append(link);
  };
  const schedule = callback => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(callback, { timeout: 2500 });
    } else {
      window.setTimeout(() => callback({ timeRemaining: () => 0, didTimeout: true }), 1200);
    }
  };
  const prefetchBatch = deadline => {
    let added = 0;
    while (index < assets.length && added < 3 && (deadline.didTimeout || deadline.timeRemaining() > 8)) {
      addHint(assets[index++]);
      added += 1;
    }
    if (index < assets.length) schedule(prefetchBatch);
  };
  schedule(prefetchBatch);
}

function queueAppAction(id, method, ...args) {
  const record = S.apps.find(app => app.id === id);
  if (!record) return;
  const action = S.appApis[id]?.[method];
  if (typeof action === 'function') {
    action(...args);
    return;
  }
  record.pendingActions ||= [];
  record.pendingActions.push({ method, args });
}

function flushPendingAppActions(record) {
  const actions = record.pendingActions || [];
  record.pendingActions = [];
  for (const { method, args } of actions) {
    const action = S.appApis[record.id]?.[method];
    if (typeof action === 'function') action(...args);
  }
}

async function hydrateApp(record, def, initialState) {
  const loadToken = (record.loadToken || 0) + 1;
  record.loadToken = loadToken;
  const isCurrent = () => S.apps.includes(record) && record.loadToken === loadToken && !record.closing;
  const onRetry = retry => reportAppLoadRetry(record, retry);
  try {
    const [module] = await Promise.all([
      loadAppModule(def, onRetry),
      ensureAppStyles(def.styles, onRetry),
    ]);
    if (!isCurrent()) return;

    const loadCtx = Object.create(appCtx);
    loadCtx.reportLoadingRetry = onRetry;
    const appEl = await def.build(module, record.id, initialState, loadCtx);
    if (!isCurrent()) {
      S.appApis[record.id]?.destroy?.();
      delete S.appApis[record.id];
      return;
    }
    if (!(appEl instanceof HTMLElement)) {
      throw new TypeError(`The ${def.title} app did not return an element.`);
    }

    appEl.classList.add('app-window');
    appEl.dataset.id = record.id;
    appEl.dataset.type = record.type;
    transferWindowAnimation(record.el, appEl);
    appEl.classList.toggle('focused', S.focusedId === record.id);
    record.el.replaceWith(appEl);
    record.el = appEl;
    flushPendingAppActions(record);
    updateStripLayout();
    if (document.body.classList.contains('mod-overview')) positionOverview();
  } catch (error) {
    if (!isCurrent()) return;
    console.error(`Could not load ${def.title}.`, error);
    S.appApis[record.id]?.destroy?.();
    delete S.appApis[record.id];
    const failed = createAppLoadSurface(def.title, 'error');
    failed.dataset.id = record.id;
    failed.dataset.type = record.type;
    transferWindowAnimation(record.el, failed);
    failed.classList.toggle('focused', S.focusedId === record.id);
    const retry = failed.querySelector('.app-load-retry');
    retry.addEventListener('click', () => {
      const loading = createAppLoadSurface(def.title);
      loading.dataset.id = record.id;
      loading.dataset.type = record.type;
      transferWindowAnimation(record.el, loading);
      loading.classList.toggle('focused', S.focusedId === record.id);
      record.el.replaceWith(loading);
      record.el = loading;
      void hydrateApp(record, def, initialState);
    });
    record.el.replaceWith(failed);
    record.el = failed;
  }
}

function createColEl(colId) {
  const el = document.createElement('div');
  el.className = 'app-col';
  el.dataset.colId = colId;
  el.dataset.width = 'full';
  return el;
}

function startWindowOpening(el, animation) {
  el.dataset.windowAnimation = animation;
  el.classList.add('window-opening');
  const onEnd = event => {
    if (event.target !== el || !event.animationName?.startsWith('window-')) return;
    el.classList.remove('window-opening');
    el.removeEventListener('animationend', onEnd);
  };
  el.addEventListener('animationend', onEnd);
}

function transferWindowAnimation(previous, next) {
  const animation = previous.dataset.windowAnimation || 'none';
  next.dataset.windowAnimation = animation;
  if (previous.classList.contains('window-opening')) startWindowOpening(next, animation);
}

// ── App lifecycle ─────────────────────────────────────────────
function openApp(type, insertIntoColId = null, initialState = null) {
  const def = APP_DEFS[type];
  if (!def) return null;

  const id = `app-${S.nextAppId++}`;
  const el = createAppLoadSurface(def.title);
  el.dataset.id = id;
  el.dataset.type = type;
  const windowAnimation = chooseAnimationForEvent('windowOpen');
  el.dataset.windowAnimation = windowAnimation;
  if (
    !S._skipSave &&
    windowAnimation !== 'none' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  ) startWindowOpening(el, windowAnimation);
  const record = { id, type, el, pendingActions: [], windowAnimation, closing: false };
  S.apps.push(record);

  const existingCol = insertIntoColId ? S.columns.find(c => c.id === insertIntoColId) : null;
  if (existingCol) {
    existingCol.appIds.push(id);
    existingCol.el.appendChild(el);
  } else {
    const colId = `col-${S.nextColId++}`;
    const colEl = createColEl(colId);
    colEl.appendChild(el);
    const col = { id: colId, appIds: [id], widthPreset: 'full', el: colEl };
    S.columns.push(col);
    appStrip.appendChild(colEl);
    wireColEvents(colEl);
  }

  focusApp(id);
  updateEmptyState();
  updateStripLayout();
  if (!S._skipSave) { saveSession(); requestAnimationFrame(() => scrollToApp(id)); }
  void hydrateApp(record, def, initialState);
  return id;
}

function closeApp(id) {
  const record = S.apps.find(app => app.id === id);
  if (!record || record.closing) return;
  const animation = chooseAnimationForEvent('windowClose');
  if (
    animation !== 'none' &&
    !document.body.classList.contains('mod-overview') &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    record.closing = true;
    record.el.dataset.windowAnimation = animation;
    record.el.classList.remove('window-opening');
    record.el.classList.add('window-closing');
    record.el.inert = true;
    record.el.setAttribute('aria-hidden', 'true');
    let finished = false;
    let fallbackTimer = 0;
    const finish = event => {
      if (event && (event.target !== record.el || !event.animationName?.startsWith('window-'))) return;
      if (finished) return;
      finished = true;
      clearTimeout(fallbackTimer);
      record.el.removeEventListener('animationend', finish);
      removeAppImmediately(id);
    };
    record.el.addEventListener('animationend', finish);
    fallbackTimer = window.setTimeout(() => finish(), 360);
    return;
  }
  removeAppImmediately(id);
}

function removeAppImmediately(id) {
  const appIdx = S.apps.findIndex(a => a.id === id);
  if (appIdx === -1) return;

  const { el } = S.apps[appIdx];
  const col = getAppColumn(id);

  S.appApis[id]?.destroy?.();
  S.apps.splice(appIdx, 1);
  el.remove();
  delete S.appApis[id];
  delete S.appTitles[id];

  if (col) {
    const cIdx = col.appIds.indexOf(id);
    col.appIds.splice(cIdx, 1);
    if (col.appIds.length === 0) {
      const colIdx = S.columns.indexOf(col);
      col.el.remove();
      S.columns.splice(colIdx, 1);
    }
  }

  if (S.focusedId === id) {
    S.focusedId = null;
    const order = getAppOrder();
    if (order.length > 0) {
      let nextId = null;
      if (col && col.appIds.length > 0) {
        nextId = col.appIds[0];
      } else {
        nextId = order[Math.max(0, order.indexOf(id) - 1)] || order[0];
      }
      if (nextId) focusApp(nextId);
    }
  }

  updateTopBar();
  updateEmptyState();
  updateStripLayout();
  saveSession();
}

function focusApp(id) {
  if (document.body.classList.contains('mod-show-desktop')) setShowDesktop(false);
  if (S.focusedId === id) return;

  if (S.focusedId) {
    const prev = S.apps.find(a => a.id === S.focusedId);
    if (prev) prev.el.classList.remove('focused');
  }

  S.focusedId = id;

  const next = S.apps.find(a => a.id === id);
  if (next) {
    next.el.classList.add('focused');
    if (!S._skipSave && !document.body.classList.contains('mod-overview')) {
      requestAnimationFrame(() => scrollToApp(id));
    }
  }

  updateTopBar();
  if (document.body.classList.contains('mod-overview')) {
    requestAnimationFrame(() => positionOverview());
  }
  if (!S._skipSave) saveSession();
}

function scrollToApp(id) {
  const col = getAppColumn(id);
  if (!col) return;
  col.el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
}

// ── Width presets ─────────────────────────────────────────────
function setFocusedWidth(preset) {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col) return;
  col.el.classList.remove('width-shrink', 'width-grow');
  void col.el.offsetWidth;
  col.el.classList.add('width-shrink');
  col.el.addEventListener('animationend', () => {
    col.el.classList.remove('width-shrink');
    col.el.dataset.width = preset;
    void col.el.offsetWidth;
    col.el.classList.add('width-grow');
    col.el.addEventListener('animationend', () => col.el.classList.remove('width-grow'), { once: true });
  }, { once: true });

  col.widthPreset = preset;
  saveSession();
  updateWidthButtons();
}

function cycleFocusedWidthWider() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col) return;
  const idx = WIDTH_PRESETS.indexOf(col.widthPreset);
  setFocusedWidth(WIDTH_PRESETS[Math.min(idx + 1, WIDTH_PRESETS.length - 1)]);
}

function cycleFocusedWidthNarrower() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col) return;
  const idx = WIDTH_PRESETS.indexOf(col.widthPreset);
  setFocusedWidth(WIDTH_PRESETS[Math.max(idx - 1, 0)]);
}

// ── Consume / Expel ───────────────────────────────────────────
function consumeLeft() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col) return;
  const colIdx = S.columns.indexOf(col);
  if (colIdx === 0) return;

  const leftCol = S.columns[colIdx - 1];
  if (!leftCol.appIds.length) return;

  const takenId  = leftCol.appIds[leftCol.appIds.length - 1];
  const takenApp = S.apps.find(a => a.id === takenId);
  if (!takenApp) return;

  leftCol.appIds.pop();
  takenApp.el.remove();

  if (leftCol.appIds.length === 0) {
    leftCol.el.remove();
    S.columns.splice(colIdx - 1, 1);
  }

  col.appIds.push(takenId);
  col.el.appendChild(takenApp.el);
  saveSession();
  updateTopBar();
  updateStripLayout();
}

function expelRight() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col || col.appIds.length <= 1) return;

  const colIdx = S.columns.indexOf(col);
  const appIdx = col.appIds.indexOf(S.focusedId);
  col.appIds.splice(appIdx, 1);
  const app = S.apps.find(a => a.id === S.focusedId);
  app.el.remove();

  const newColId = `col-${S.nextColId++}`;
  const newColEl = createColEl(newColId);
  newColEl.appendChild(app.el);
  newColEl.dataset.width = col.widthPreset;

  const newCol = { id: newColId, appIds: [S.focusedId], widthPreset: col.widthPreset, el: newColEl };
  S.columns.splice(colIdx + 1, 0, newCol);
  col.el.after(newColEl);
  wireColEvents(newColEl);

  saveSession();
  updateTopBar();
  updateStripLayout();
  requestAnimationFrame(() => scrollToApp(S.focusedId));
}

function expelLeft() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col || col.appIds.length <= 1) return;

  const colIdx = S.columns.indexOf(col);
  const appIdx = col.appIds.indexOf(S.focusedId);
  col.appIds.splice(appIdx, 1);
  const app = S.apps.find(a => a.id === S.focusedId);
  app.el.remove();

  const newColId = `col-${S.nextColId++}`;
  const newColEl = createColEl(newColId);
  newColEl.appendChild(app.el);
  newColEl.dataset.width = col.widthPreset;

  const newCol = { id: newColId, appIds: [S.focusedId], widthPreset: col.widthPreset, el: newColEl };
  S.columns.splice(colIdx, 0, newCol);
  col.el.before(newColEl);
  wireColEvents(newColEl);

  saveSession();
  updateTopBar();
  updateStripLayout();
  requestAnimationFrame(() => scrollToApp(S.focusedId));
}

function consumeRight() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col) return;
  const colIdx = S.columns.indexOf(col);
  if (colIdx === S.columns.length - 1) return;

  const rightCol = S.columns[colIdx + 1];
  if (!rightCol.appIds.length) return;

  const takenId  = rightCol.appIds[0];
  const takenApp = S.apps.find(a => a.id === takenId);
  if (!takenApp) return;

  rightCol.appIds.shift();
  takenApp.el.remove();

  if (rightCol.appIds.length === 0) {
    rightCol.el.remove();
    S.columns.splice(colIdx + 1, 1);
  }

  col.appIds.push(takenId);
  col.el.appendChild(takenApp.el);
  saveSession();
  updateTopBar();
  updateStripLayout();
}

function moveWindowUp() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col || col.appIds.length <= 1) return;
  const idx = col.appIds.indexOf(S.focusedId);
  if (idx === 0) return;
  // Swap in array
  [col.appIds[idx - 1], col.appIds[idx]] = [col.appIds[idx], col.appIds[idx - 1]];
  // Swap in DOM — move focused element before the previous sibling
  const app    = S.apps.find(a => a.id === S.focusedId);
  const prevEl = S.apps.find(a => a.id === col.appIds[idx]).el;
  col.el.insertBefore(app.el, prevEl);
  saveSession();
  updateTopBar();
}

function moveWindowDown() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  if (!col || col.appIds.length <= 1) return;
  const idx = col.appIds.indexOf(S.focusedId);
  if (idx === col.appIds.length - 1) return;
  // Swap in array
  [col.appIds[idx], col.appIds[idx + 1]] = [col.appIds[idx + 1], col.appIds[idx]];
  // Swap in DOM — move focused element after the next sibling
  const app    = S.apps.find(a => a.id === S.focusedId);
  const nextEl = S.apps.find(a => a.id === col.appIds[idx]).el;
  col.el.insertBefore(app.el, nextEl.nextSibling);
  saveSession();
  updateTopBar();
}

// ── Top-bar rendering ─────────────────────────────────────────
function updateTopBar() {
  openAppsBar.innerHTML = '';
  for (const id of getAppOrder()) {
    const app = S.apps.find(candidate => candidate.id === id);
    if (!app) continue;
    const { type } = app;
    const def = APP_DEFS[type];
    const btn = document.createElement('button');
    btn.className = 'app-tab-btn' + (id === S.focusedId ? ' focused' : '');
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', def.title);
    btn.setAttribute('title', def.title);
    btn.innerHTML = def.iconSvg;
    btn.addEventListener('click', () => { focusApp(id); closeAppMenu(); });
    openAppsBar.appendChild(btn);
  }

  const focused = S.apps.find(a => a.id === S.focusedId);
  const def     = focused ? APP_DEFS[focused.type] : null;
  activeTitle.textContent = (S.focusedId && S.appTitles[S.focusedId]) || (def ? def.title : '');

  const hasFocus = S.focusedId !== null;
  closeBtn.disabled    = !hasFocus;
  overviewBtn.disabled = S.apps.length === 0;
  winMenuBtn.disabled  = !hasFocus;
  showDesktopBtn.disabled = S.apps.length === 0 && desktopWidgetNotes.length === 0;
}

function updateWidthButtons() { /* width buttons now live in the per-window ⋮ menu */ }

function updateEmptyState() {
  S.apps.length === 0 ? emptyState.removeAttribute('hidden') : emptyState.setAttribute('hidden', '');
}

function updateStripLayout() {
  appStrip.classList.toggle('center-apps', S.columns.length === 1);
}

// ── Sticky-note desktop widgets ───────────────────────────────
let desktopWidgetNotes = [];

function setShowDesktop(show) {
  if (show && document.body.classList.contains('mod-overview')) exitOverview({ animate: false });
  window.clearTimeout(desktopReturnAnimationTimer);
  document.body.classList.remove('desktop-returning');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const record of S.apps) {
      const animation = chooseAnimationForEvent('showDesktop');
      record.el.dataset.desktopAnimation = animation;
      record.el.dataset.desktopDirection = show ? 'out' : 'in';
      record.el.classList.remove('desktop-transitioning');
      void record.el.offsetWidth;
      if (animation !== 'none') record.el.classList.add('desktop-transitioning');
    }
  } else {
    for (const record of S.apps) record.el.classList.remove('desktop-transitioning');
  }
  appStripWrapper.inert = show;
  document.body.classList.toggle('mod-show-desktop', show);
  if (!show && S.apps.some(record => record.el.classList.contains('desktop-transitioning'))) {
    document.body.classList.add('desktop-returning');
    desktopReturnAnimationTimer = window.setTimeout(() => {
      document.body.classList.remove('desktop-returning');
      for (const record of S.apps) record.el.classList.remove('desktop-transitioning');
    }, 560);
  }
  showDesktopBtn.setAttribute('aria-pressed', String(show));
  showDesktopBtn.setAttribute('aria-label', show ? 'Return to apps' : 'Show desktop');
  showDesktopBtn.title = show ? 'Return to apps' : 'Show desktop';
}

let desktopReturnAnimationTimer = 0;
let overviewAnimationTimer = 0;

function updateDesktopNotes(notes) {
  desktopWidgetNotes = notes.filter(note => note.desktop);
  desktopWidgets.replaceChildren();
  for (const note of desktopWidgetNotes) {
    const widget = document.createElement('button');
    widget.type = 'button';
    widget.className = 'desktop-note-widget';
    widget.dataset.noteColor = note.color || 'yellow';
    widget.setAttribute('aria-label', `Open note: ${note.title || 'Untitled note'}`);
    const title = document.createElement('strong');
    const body = document.createElement('span');
    title.textContent = note.title || 'Untitled note';
    body.textContent = note.body || 'No additional text';
    widget.append(title, body);
    widget.addEventListener('click', () => openStickyNote(note.id));
    desktopWidgets.append(widget);
  }
  showDesktopBtn.disabled = S.apps.length === 0 && desktopWidgetNotes.length === 0;
  if (desktopWidgetNotes.length === 0 && S.apps.length === 0) setShowDesktop(false);
}

function openStickyNote(noteId) {
  setShowDesktop(false);
  const existing = S.apps.find(app => app.type === 'sticky-notes');
  const id = existing ? existing.id : openApp('sticky-notes');
  if (id) {
    focusApp(id);
    queueAppAction(id, 'openNote', noteId);
  }
}

updateDesktopNotes(loadStickyNotes());

// ── App navigation ────────────────────────────────────────────
function focusNextApp() {
  const order = getAppOrder();
  if (!order.length) return;
  focusApp(order[(order.indexOf(S.focusedId) + 1) % order.length]);
}

function focusPrevApp() {
  const order = getAppOrder();
  if (!order.length) return;
  focusApp(order[(order.indexOf(S.focusedId) - 1 + order.length) % order.length]);
}

function focusAppByIndex(n) {
  const order = getAppOrder();
  if (n < 1 || n > order.length) return;
  focusApp(order[n - 1]);
}

// ── App menu ──────────────────────────────────────────────────
function openAppMenu(showGames = false) {
  appMenu.removeAttribute('hidden');
  appMenuBtn.setAttribute('aria-expanded', 'true');
  closeHelp();
  if (showGames) gameMenu.showGames(false);
  else gameMenu.showRoot(false);
  if (!showGames) populateLauncherFiles();
  requestAnimationFrame(() => {
    const f = appMenu.querySelector(showGames
      ? '#game-menu-back'
      : '#app-list .app-launcher[data-type]') || appMenu.querySelector('#game-center-entry');
    if (!appMenu.hidden) f.focus();
  });
}
function closeAppMenu() {
  appMenu.setAttribute('hidden', '');
  appMenuBtn.setAttribute('aria-expanded', 'false');
}
function toggleAppMenu() {
  appMenu.hasAttribute('hidden') ? openAppMenu() : closeAppMenu();
}

// ── Help overlay ──────────────────────────────────────────────
function openHelp() {
  helpOverlay.removeAttribute('hidden');
  closeAppMenu();
  requestAnimationFrame(() => helpCloseBtn.focus());
}
function closeHelp() { helpOverlay.setAttribute('hidden', ''); }
function toggleHelp() { helpOverlay.hasAttribute('hidden') ? openHelp() : closeHelp(); }

// ── File opener ───────────────────────────────────────────────
function requestOpenFile(file) {
  const typeToApp = { document: 'doc-viewer', image: 'img-viewer', video: 'media-player' };
  const appType   = typeToApp[file.type] || 'doc-viewer';
  const newId = openApp(appType);
  if (newId) queueAppAction(newId, 'openFile', file.url, file.displayName, file.poster);
}

// ── App-launcher file listing ─────────────────────────────────
const _launcherCache = {};
const _launcherCacheMeta = {};
const _launcherFetching = {};
const LAUNCHER_MANIFEST_RECHECK_MS = 5_000;
const LAUNCHER_MANIFEST_RETRY_MS = 5_000;
const appFilesSection = $('app-files-section');
const docFilesList = $('doc-files-list');
const picFilesList = $('pic-files-list');
const videoFilesList = $('video-files-list');
const docFilesCount = $('doc-files-count');
const picFilesCount = $('pic-files-count');
const videoFilesCount = $('video-files-count');
const launcherFileSearch = $('launcher-file-search');
const launcherFileSearchEmpty = $('launcher-file-search-empty');
const launcherFileSearchStatus = $('launcher-file-search-status');
const docFilesHeading = $('doc-files-heading');
const picFilesHeading = $('pic-files-heading');
const videoFilesHeading = $('video-files-heading');
let launcherSearchAnnouncementTimer;

function parseManifestForLauncher(folder, entries) {
  return entries.map(entry => {
    const { filename, url: manifestUrl } = entry;
    if (typeof filename !== 'string') return null;
    const match = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
    if (!match) return null;
    const [, , , , rest] = match;
    const dotIndex = rest.lastIndexOf('.');
    const rawName = dotIndex >= 0 ? rest.slice(0, dotIndex) : rest;
    const displayName = rawName.replace(/_/g, ' ');
    const url = manifestUrl || `${folder}/${encodeURIComponent(filename)}`;
    const extension = dotIndex >= 0 ? rest.slice(dotIndex + 1).toLowerCase() : '';
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const videoExtensions = ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'avi', 'mpeg', 'mpg', '3gp', 'wmv', 'mkv'];
    const type = videoExtensions.includes(extension)
      ? 'video'
      : imageExtensions.includes(extension) ? 'image' : 'document';
    return {
      displayName,
      url,
      type,
      folder,
      poster: entry.poster || '',
      isWallpaper: entry.isWallpaper === true,
      title: typeof entry.title === 'string' ? entry.title : displayName,
      filename,
    };
  }).filter(Boolean);
}

async function ensureLauncherManifest(folder, { force = false } = {}) {
  const cached = _launcherCache[folder];
  const metadata = _launcherCacheMeta[folder];
  const freshnessMs = metadata?.error
    ? LAUNCHER_MANIFEST_RETRY_MS
    : LAUNCHER_MANIFEST_RECHECK_MS;
  if (
    !force &&
    cached !== undefined &&
    Date.now() - (metadata?.checkedAt ?? 0) < freshnessMs
  ) {
    return cached;
  }
  if (_launcherFetching[folder]) return _launcherFetching[folder];

  const request = (async () => {
    try {
      const headers = metadata?.etag
        ? { 'If-None-Match': metadata.etag }
        : {};
      const manifestUrl = folder === 'wallpapers'
        ? '/files/manifest.json'
        : `/files/${folder}/manifest.json`;
      const response = await fetch(manifestUrl, {
        headers,
        cache: 'no-store',
      });
      if (response.status === 304 && cached !== undefined) {
        _launcherCacheMeta[folder] = {
          etag: response.headers.get('ETag') || metadata?.etag || null,
          checkedAt: Date.now(),
          error: false,
        };
        return cached;
      }
      if (!response.ok) throw new Error(`Could not load ${folder} manifest`);
      const manifest = await response.json();
      const entries = folder === 'wallpapers' ? manifest?.wallpapers : manifest;
      if (!Array.isArray(entries)) throw new Error(`Invalid ${folder} manifest`);
      _launcherCache[folder] = parseManifestForLauncher(
        folder === 'wallpapers' ? 'pictures' : folder,
        entries,
      );
      _launcherCacheMeta[folder] = {
        etag: response.headers.get('ETag'),
        checkedAt: Date.now(),
        error: false,
      };
    } catch {
      if (_launcherCache[folder] === undefined) _launcherCache[folder] = [];
      _launcherCacheMeta[folder] = {
        ..._launcherCacheMeta[folder],
        checkedAt: Date.now(),
        error: true,
      };
    }
    return _launcherCache[folder];
  })();
  _launcherFetching[folder] = request;
  try {
    return await request;
  } finally {
    if (_launcherFetching[folder] === request) delete _launcherFetching[folder];
  }
}

// ── Desktop wallpaper preferences ─────────────────────────────
const WALLPAPER_INTERVALS = [1, 5, 15, 30, 60, 360, 1440];
const WALLPAPER_FADE_MS = 650;
let wallpaperFiles = [];
let wallpaperTimer = 0;
let appliedWallpaperUrl = '';
let wallpaperTransitionToken = 0;
let wallpaperTransitionLayer = null;
const wallpaperPreloads = new Map();

function readWallpaperSettings() {
  const stored = readJSON(WALLPAPER_KEY, {}, {
    validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
  });
  const transition = normalizeAnimationChoices(stored.transition, WALLPAPER_TRANSITION_EFFECTS, ['fade']);
  return {
    selected: Array.isArray(stored.selected) ? stored.selected.filter(url => typeof url === 'string') : [],
    mode: stored.mode === 'cycle' ? 'cycle' : 'random',
    rotation: stored.rotation === 'interval' ? 'interval' : 'visit',
    intervalMinutes: WALLPAPER_INTERVALS.includes(Number(stored.intervalMinutes))
      ? Number(stored.intervalMinutes)
      : 60,
    transition,
    currentUrl: typeof stored.currentUrl === 'string' ? stored.currentUrl : '',
    nextUrl: typeof stored.nextUrl === 'string' ? stored.nextUrl : '',
    nextChangeAt: Number.isFinite(stored.nextChangeAt) ? stored.nextChangeAt : 0,
  };
}

let wallpaperSettings = readWallpaperSettings();

function saveWallpaperSettings() {
  writeJSON(WALLPAPER_KEY, wallpaperSettings, {
    validate: value => Boolean(value && Array.isArray(value.selected) && Array.isArray(value.transition)),
  });
}

function wallpaperAbsoluteUrl(url) {
  return new URL(url, window.location.href).href;
}

function preloadWallpaper(url) {
  if (!url) return Promise.resolve();
  const absoluteUrl = wallpaperAbsoluteUrl(url);
  if (wallpaperPreloads.has(absoluteUrl)) return wallpaperPreloads.get(absoluteUrl);
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('The selected wallpaper could not be loaded.')), { once: true });
    image.src = absoluteUrl;
    if (image.complete) {
      if (image.naturalWidth > 0) resolve();
      else reject(new Error('The selected wallpaper could not be loaded.'));
    }
    if (typeof image.decode === 'function') {
      image.decode().then(resolve, () => {
        if (image.complete && image.naturalWidth > 0) resolve();
      });
    }
  });
  wallpaperPreloads.set(absoluteUrl, loaded);
  loaded.catch(() => wallpaperPreloads.delete(absoluteUrl));
  return loaded;
}

function backgroundLayersFor(url) {
  return [
    'repeating-linear-gradient(to right, transparent 0, transparent 2px, #0004 2px, #0004 4px)',
    'repeating-linear-gradient(to bottom, transparent 0, transparent 2px, #0004 2px, #0004 4px)',
    'repeating-radial-gradient(transparent 0, transparent 3px, #0001 3px, #0001 6px)',
    `url(${JSON.stringify(url)})`,
  ].join(', ');
}

async function setDesktopWallpaper(url, transition = 'none') {
  const token = ++wallpaperTransitionToken;
  if (wallpaperTransitionLayer) {
    wallpaperTransitionLayer.remove();
    wallpaperTransitionLayer = null;
  }
  if (!url) {
    document.body.style.removeProperty('--desktop-wallpaper-image');
    appliedWallpaperUrl = '';
    return;
  }

  const absoluteUrl = wallpaperAbsoluteUrl(url);
  await preloadWallpaper(absoluteUrl);
  if (token !== wallpaperTransitionToken) return;
  if (appliedWallpaperUrl === absoluteUrl) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effects = normalizeAnimationChoices(transition, WALLPAPER_TRANSITION_EFFECTS, ['fade']);
  const effect = chooseAnimation(effects);
  if (effect !== 'none' && !reduceMotion) {
    const layer = document.createElement('div');
    layer.className = 'desktop-wallpaper-transition';
    layer.dataset.transition = effect;
    layer.style.backgroundImage = backgroundLayersFor(absoluteUrl);
    layer.style.transitionDuration = `${WALLPAPER_FADE_MS}ms`;
    wallpaperTransitionLayer = layer;
    document.body.append(layer);
    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      layer.addEventListener('transitionend', finish, { once: true });
      window.setTimeout(finish, WALLPAPER_FADE_MS + 100);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (token === wallpaperTransitionToken) layer.classList.add('is-visible');
        else finish();
      }));
    });
    if (token !== wallpaperTransitionToken) {
      layer.remove();
      return;
    }
    document.body.style.setProperty('--desktop-wallpaper-image', `url(${JSON.stringify(absoluteUrl)})`);
    layer.remove();
    wallpaperTransitionLayer = null;
  } else {
    document.body.style.setProperty('--desktop-wallpaper-image', `url(${JSON.stringify(absoluteUrl)})`);
  }
  appliedWallpaperUrl = absoluteUrl;
}

function pickNextWallpaper(settings) {
  const { selected } = settings;
  if (!selected.length) return '';
  if (selected.length === 1) return selected[0];
  if (settings.mode === 'cycle') {
    const currentIndex = selected.indexOf(settings.currentUrl);
    return selected[(currentIndex + 1 + selected.length) % selected.length];
  }
  if (selected.length === 1) return selected[0];
  const choices = selected.filter(url => url !== settings.currentUrl);
  return choices[Math.floor(Math.random() * choices.length)];
}

function queueNextWallpaper() {
  if (wallpaperSettings.rotation !== 'interval' ||
      wallpaperSettings.selected.length < 2 ||
      !wallpaperSettings.currentUrl) {
    wallpaperSettings.nextUrl = '';
    return;
  }
  if (!wallpaperSettings.selected.includes(wallpaperSettings.nextUrl) ||
      wallpaperSettings.nextUrl === wallpaperSettings.currentUrl) {
    wallpaperSettings.nextUrl = pickNextWallpaper(wallpaperSettings);
  }
  void preloadWallpaper(wallpaperSettings.nextUrl).catch(error => {
    console.warn('[wallpaper] Could not preload the next image.', error);
  });
}

async function applyNextWallpaper({ transition = 'none', persist = true } = {}) {
  window.clearTimeout(wallpaperTimer);
  wallpaperTimer = 0;
  wallpaperSettings.selected = wallpaperSettings.selected.filter(url =>
    wallpaperFiles.some(file => file.isWallpaper && file.url === url));
  if (!wallpaperSettings.selected.length) {
    wallpaperSettings.currentUrl = '';
    wallpaperSettings.nextUrl = '';
    wallpaperSettings.nextChangeAt = 0;
    await setDesktopWallpaper('');
    if (persist) saveWallpaperSettings();
    return;
  }
  const nextUrl = pickNextWallpaper(wallpaperSettings);
  try {
    await setDesktopWallpaper(nextUrl, transition);
  } catch (error) {
    console.warn('[wallpaper] Could not apply the selected image.', error);
    return;
  }
  wallpaperSettings.currentUrl = nextUrl;
  wallpaperSettings.nextChangeAt = wallpaperSettings.rotation === 'interval'
    ? Date.now() + wallpaperSettings.intervalMinutes * 60_000
    : 0;
  wallpaperSettings.nextUrl = '';
  queueNextWallpaper();
  if (persist) saveWallpaperSettings();
  scheduleWallpaperChange();
}

function scheduleWallpaperChange() {
  window.clearTimeout(wallpaperTimer);
  wallpaperTimer = 0;
  if (
    wallpaperSettings.rotation !== 'interval' ||
    wallpaperSettings.selected.length < 2 ||
    !wallpaperSettings.currentUrl
  ) return;
  const delay = Math.max(0, wallpaperSettings.nextChangeAt - Date.now());
  queueNextWallpaper();
  wallpaperTimer = window.setTimeout(rotateWallpaperOnTimer, delay);
}

async function rotateWallpaperOnTimer({ persist = true } = {}) {
  const files = await ensureLauncherManifest('wallpapers');
  if (_launcherCacheMeta.wallpapers?.error) {
    wallpaperSettings.nextChangeAt = Date.now() + 60_000;
    if (persist) saveWallpaperSettings();
    scheduleWallpaperChange();
    return;
  }
  wallpaperFiles = files.filter(file => file.type === 'image' && file.isWallpaper);
  wallpaperSettings.selected = wallpaperSettings.selected.filter(url =>
    wallpaperFiles.some(file => file.url === url));
  if (!wallpaperSettings.selected.length) {
    await applyNextWallpaper({ persist });
    return;
  }
  const nextUrl = wallpaperSettings.selected.includes(wallpaperSettings.nextUrl)
    ? wallpaperSettings.nextUrl
    : pickNextWallpaper(wallpaperSettings);
  try {
    await setDesktopWallpaper(nextUrl, wallpaperSettings.transition);
  } catch (error) {
    console.warn('[wallpaper] Could not load the next wallpaper.', error);
    wallpaperSettings.nextChangeAt = Date.now() + 60_000;
    wallpaperSettings.nextUrl = '';
    if (persist) saveWallpaperSettings();
    scheduleWallpaperChange();
    return;
  }
  wallpaperSettings.currentUrl = nextUrl;
  wallpaperSettings.nextUrl = '';
  wallpaperSettings.nextChangeAt = Date.now() + wallpaperSettings.intervalMinutes * 60_000;
  queueNextWallpaper();
  if (persist) saveWallpaperSettings();
  scheduleWallpaperChange();
}

async function initializeDesktopWallpaper() {
  const files = await ensureLauncherManifest('wallpapers');
  if (_launcherCacheMeta.wallpapers?.error) {
    if (wallpaperSettings.currentUrl) {
      try { await setDesktopWallpaper(wallpaperSettings.currentUrl, 'none'); }
      catch (error) { console.warn('[wallpaper] The saved wallpaper could not be restored.', error); }
    }
    scheduleWallpaperChange();
    return;
  }
  wallpaperFiles = files.filter(file => file.type === 'image' && file.isWallpaper);
  const validUrls = new Set(wallpaperFiles.map(file => file.url));
  wallpaperSettings.selected = wallpaperSettings.selected.filter(url => validUrls.has(url));
  if (wallpaperSettings.rotation === 'interval' &&
      wallpaperSettings.selected.length > 0 &&
      wallpaperSettings.selected.includes(wallpaperSettings.currentUrl)) {
    if (wallpaperSettings.nextChangeAt > Date.now()) {
      try { await setDesktopWallpaper(wallpaperSettings.currentUrl, 'none'); }
      catch (error) { console.warn('[wallpaper] The saved wallpaper could not be restored.', error); }
      queueNextWallpaper();
      scheduleWallpaperChange();
    } else {
      await rotateWallpaperOnTimer({ persist: false });
    }
  } else {
    await applyNextWallpaper({ transition: 'none', persist: false });
  }
}

async function loadWallpaperForSettings() {
  const files = await ensureLauncherManifest('wallpapers');
  if (_launcherCacheMeta.wallpapers?.error) {
    throw new Error('The picture library could not be loaded. Check your connection and try again.');
  }
  wallpaperFiles = files.filter(file => file.type === 'image' && file.isWallpaper);
  const validUrls = new Set(wallpaperFiles.map(file => file.url));
  wallpaperSettings.selected = wallpaperSettings.selected.filter(url => validUrls.has(url));
  if (!validUrls.has(wallpaperSettings.currentUrl)) {
    wallpaperSettings.currentUrl = '';
    wallpaperSettings.nextUrl = '';
  }
  return {
    files: wallpaperFiles.map(file => ({
      url: file.url,
      title: file.title || file.displayName,
      displayName: file.displayName,
    })),
    settings: {
      selected: [...wallpaperSettings.selected],
      mode: wallpaperSettings.mode,
      rotation: wallpaperSettings.rotation,
      intervalMinutes: wallpaperSettings.intervalMinutes,
      transition: wallpaperSettings.transition,
    },
  };
}

async function saveWallpaperPreferences(draft) {
  const allowedUrls = new Set(wallpaperFiles.map(file => file.url));
  const selected = [...new Set(Array.isArray(draft?.selected) ? draft.selected : [])]
    .filter(url => allowedUrls.has(url));
  if (!selected.length) throw new Error('Select at least one eligible wallpaper, or use the default random wallpaper.');
  const mode = draft?.mode === 'cycle' ? 'cycle' : 'random';
  const rotation = draft?.rotation === 'interval' ? 'interval' : 'visit';
  const intervalMinutes = WALLPAPER_INTERVALS.includes(Number(draft?.intervalMinutes))
    ? Number(draft.intervalMinutes)
    : 60;
  const transition = normalizeAnimationChoices(draft?.transition, WALLPAPER_TRANSITION_EFFECTS, ['fade']);
  const currentUrl = selected.includes(wallpaperSettings.currentUrl)
    ? wallpaperSettings.currentUrl
    : mode === 'cycle'
      ? selected[0]
      : selected[Math.floor(Math.random() * selected.length)];
  await setDesktopWallpaper(currentUrl, transition);
  wallpaperSettings = {
    selected,
    mode,
    rotation,
    intervalMinutes,
    transition,
    currentUrl,
    nextUrl: '',
    nextChangeAt: rotation === 'interval' && selected.length > 1
      ? Date.now() + intervalMinutes * 60_000
      : 0,
  };
  queueNextWallpaper();
  saveWallpaperSettings();
  scheduleWallpaperChange();
  notifyDesktopSettingsChanged();
}

async function useDefaultWallpaper() {
  window.clearTimeout(wallpaperTimer);
  wallpaperSettings = {
    selected: [],
    mode: 'random',
    rotation: 'visit',
    intervalMinutes: 60,
    transition: 'fade',
    currentUrl: '',
    nextUrl: '',
    nextChangeAt: 0,
  };
  await setDesktopWallpaper('');
  saveWallpaperSettings();
  notifyDesktopSettingsChanged();
}

void initializeDesktopWallpaper();

function buildFileLauncherBtn(file, iconSvg, iconColor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'app-file-btn';
  button.title = `Open "${file.displayName}"`;
  button.dataset.fileName = file.displayName.toLocaleLowerCase();
  const icon = document.createElement('span');
  icon.className = 'app-file-icon';
  icon.style.color = iconColor;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = iconSvg;
  const name = document.createElement('span');
  name.className = 'app-file-name';
  name.textContent = file.displayName;
  button.append(icon, name);
  button.addEventListener('click', () => {
    requestOpenFile(file);
    closeAppMenu();
  });
  return button;
}

async function populateLauncherFiles() {
  const DOC_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>';
  const IMG_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
  const [docs, posts, pictures, videos] = await Promise.all([
    ensureLauncherManifest('documents'),
    ensureLauncherManifest('posts'),
    ensureLauncherManifest('pictures'),
    ensureLauncherManifest('videos'),
  ]);
  const allDocuments = [...docs, ...posts];
  const allVideos = [...allDocuments, ...pictures, ...videos].filter(file => file.type === 'video');
  const allDocs = allDocuments.filter(file => file.type !== 'video');
  const allPictures = pictures.filter(file => file.type !== 'video');
  const sortByDisplayName = files => [...files].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  docFilesList.replaceChildren(...sortByDisplayName(allDocs).map(file =>
    buildFileLauncherBtn(file, DOC_ICON, 'var(--accent-light)')));
  docFilesCount.textContent = allDocs.length ? String(allDocs.length) : '';
  picFilesList.replaceChildren(...sortByDisplayName(allPictures).map(file =>
    buildFileLauncherBtn(file, IMG_ICON, '#a78bfa')));
  picFilesCount.textContent = allPictures.length ? String(allPictures.length) : '';
  const VIDEO_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/></svg>';
  videoFilesList.replaceChildren(...sortByDisplayName(allVideos).map(file =>
    buildFileLauncherBtn(file, VIDEO_ICON, '#f87171')));
  videoFilesCount.textContent = allVideos.length ? String(allVideos.length) : '';
  appFilesSection.hidden = allDocs.length === 0 && allPictures.length === 0 && allVideos.length === 0;
  updateLauncherFileSearch();
  desktopSearchItems = buildDesktopSearchItems();
  desktopSearchItemsReady = true;
  if (!desktopSearchSuggestions.hidden) renderDesktopSearchResults();
}

function updateLauncherFileSearch() {
  const query = launcherFileSearch.value.trim().toLocaleLowerCase();
  const focusedFile = document.activeElement?.matches('.app-file-btn')
    ? document.activeElement
    : null;
  const appButtons = [...document.querySelectorAll('#app-list .app-launcher')];
  let appCount = 0;
  appButtons.forEach(button => {
    const name = button.querySelector('.app-launcher-name')?.textContent || '';
    button.hidden = Boolean(query) && !name.toLocaleLowerCase().includes(query);
    if (!button.hidden) appCount++;
  });
  $('app-list').hidden = appCount === 0;
  const filterList = list => {
    const files = [...list.querySelectorAll('.app-file-btn')];
    let visibleCount = 0;
    files.forEach(file => {
      file.hidden = Boolean(query) && !file.dataset.fileName.includes(query);
      if (!file.hidden) visibleCount++;
    });
    return visibleCount;
  };
  const documentCount = filterList(docFilesList);
  const pictureCount = filterList(picFilesList);
  const videoCount = filterList(videoFilesList);
  if (focusedFile?.hidden) launcherFileSearch.focus({ preventScroll: true });
  const hasVideos = videoCount > 0;
  docFilesCount.textContent = query
    ? String(documentCount)
    : documentCount ? String(documentCount) : '';
  picFilesCount.textContent = query
    ? String(pictureCount)
    : pictureCount ? String(pictureCount) : '';
  videoFilesCount.textContent = query
    ? String(videoCount)
    : videoCount ? String(videoCount) : '';
  const hasDocuments = documentCount > 0;
  const hasPictures = pictureCount > 0;
  docFilesHeading.hidden = !hasDocuments;
  docFilesList.hidden = !hasDocuments;
  picFilesHeading.hidden = !hasPictures;
  picFilesList.hidden = !hasPictures;
  videoFilesHeading.hidden = !hasVideos;
  videoFilesList.hidden = !hasVideos;
  const fileCount = documentCount + pictureCount + videoCount;
  appFilesSection.hidden = fileCount === 0;
  launcherFileSearchEmpty.hidden = !query || appCount + fileCount > 0;
  return { query, appCount, documentCount, pictureCount, videoCount };
}

// ── Desktop quick search ──────────────────────────────────────
const desktopSearch = $('desktop-search');
const desktopSearchInput = $('desktop-search-input');
const desktopSearchSuggestions = $('desktop-search-suggestions');
const desktopSearchResults = $('desktop-search-results');
const desktopSearchStatus = $('desktop-search-status');
let desktopSearchItems = [];
let desktopSearchItemsReady = false;
let desktopSearchLoadPromise = null;
let desktopSearchActiveIndex = -1;
let desktopSearchResultId = 0;

const SEARCH_FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>';
const SEARCH_GAME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 6h10a4 4 0 0 1 3.9 3.1l1.5 6.6a3 3 0 0 1-5 2.8L15 16H9l-2.4 2.5a3 3 0 0 1-5-2.8l1.5-6.6A4 4 0 0 1 7 6z"/><path d="M7 9v5m-2.5-2.5h5M16 10h.01M19 13h.01"/></svg>';

function getSearchPostDate(file) {
  const match = file.url.match(/(?:^|\/)(\d{8})_/);
  return match ? Number(match[1]) : 0;
}

function sortRecentPosts(files) {
  return [...files].sort((a, b) => getSearchPostDate(b) - getSearchPostDate(a));
}

function closeDesktopSearch({ restoreFocus = false } = {}) {
  desktopSearchSuggestions.hidden = true;
  desktopSearchInput.setAttribute('aria-expanded', 'false');
  desktopSearchInput.removeAttribute('aria-activedescendant');
  desktopSearchActiveIndex = -1;
  if (restoreFocus) desktopSearchInput.focus({ preventScroll: true });
}

function makeDesktopSearchItem({ id, title, detail, group, icon, queryTerms, activate }) {
  return { id, title, detail, group, icon, queryTerms: queryTerms || title, activate };
}

function buildDesktopSearchItems() {
  const latestPosts = sortRecentPosts(_launcherCache.posts || []).slice(0, 3);
  const recentPostUrls = new Set(latestPosts.map(file => file.url));
  const suggestions = [
    ...latestPosts.map(file => makeDesktopSearchItem({
      id: `file:posts:${file.url}`,
      title: file.displayName,
      detail: 'Recent post',
      group: 'Recent posts',
      icon: SEARCH_FILE_ICON,
      queryTerms: `${file.displayName} post`,
      activate: () => requestOpenFile(file),
    })),
    makeDesktopSearchItem({
      id: 'games',
      title: 'Games',
      detail: 'Open Game Center',
      group: latestPosts.length ? 'Quick access' : 'Apps and games',
      icon: SEARCH_GAME_ICON,
      queryTerms: 'games game center',
      activate: () => openAppMenu(true),
    }),
    ...GAMES.map(game => makeDesktopSearchItem({
      id: `game:${game.type}`,
      title: game.title,
      detail: 'Game',
      group: 'Apps and games',
      icon: game.iconSvg,
      queryTerms: `${game.title} games game`,
      activate: () => {
        openApp(game.type);
        closeAppMenu();
      },
    })),
  ];

  const appButtons = [...document.querySelectorAll('#app-list .app-launcher[data-type]')];
  for (const button of appButtons) {
    const type = button.dataset.type;
    const title = button.querySelector('.app-launcher-name')?.textContent?.trim();
    const icon = button.querySelector('.app-launcher-icon')?.innerHTML || SEARCH_FILE_ICON;
    if (!type || !title || type === 'file-manager') continue;
    suggestions.push(makeDesktopSearchItem({
      id: `app:${type}`,
      title,
      detail: 'App',
      group: 'Apps',
      icon,
      queryTerms: title,
      activate: () => {
        if (type === 'welcome') openWelcomeWindow();
        else openApp(type);
      },
    }));
  }

  const fileLists = [
    ...(_launcherCache.posts || []),
    ...(_launcherCache.documents || []),
    ...(_launcherCache.pictures || []),
    ...(_launcherCache.videos || []),
  ];
  for (const file of fileLists) {
    const isPost = file.folder === 'posts';
    if (isPost && recentPostUrls.has(file.url)) continue;
    suggestions.push(makeDesktopSearchItem({
      id: `file:${file.folder}:${file.url}`,
      title: file.displayName,
      detail: isPost ? 'Post' : file.type === 'image' ? 'Picture' : file.type === 'video' ? 'Video' : 'Document',
      group: 'Files',
      icon: SEARCH_FILE_ICON,
      queryTerms: `${file.displayName} ${file.folder} ${file.type}`,
      activate: () => requestOpenFile(file),
    }));
  }

  suggestions.push(makeDesktopSearchItem({
    id: 'app:file-manager',
    title: 'File Manager',
    detail: 'Browse all files',
    group: 'Apps',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
    queryTerms: 'file manager files browse',
    activate: () => openApp('file-manager'),
  }));
  return suggestions;
}

function renderDesktopSearchResults() {
  const query = desktopSearchInput.value.trim().toLocaleLowerCase();
  const defaults = desktopSearchItems.filter(item =>
    item.detail === 'Recent post' || item.id === 'games' || item.id === 'app:file-manager');
  const matches = query
    ? desktopSearchItems.filter(item =>
        `${item.title} ${item.detail} ${item.queryTerms}`.toLocaleLowerCase().includes(query))
    : defaults;
  const visible = matches.slice(0, 10);
  desktopSearchActiveIndex = -1;
  desktopSearchInput.removeAttribute('aria-activedescendant');
  desktopSearchResults.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'desktop-search-empty';
    empty.textContent = query ? 'No apps or files found.' : 'No recent posts are available.';
    desktopSearchResults.append(empty);
    desktopSearchStatus.textContent = empty.textContent;
    return;
  }

  let currentGroup = '';
  let groupElement;
  visible.forEach((item, index) => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      groupElement = document.createElement('section');
      groupElement.className = 'desktop-search-group';
      groupElement.setAttribute('role', 'group');
      const heading = document.createElement('h2');
      heading.className = 'desktop-search-group-title';
      heading.textContent = currentGroup;
      heading.id = `desktop-search-group-${++desktopSearchResultId}`;
      groupElement.setAttribute('aria-labelledby', heading.id);
      groupElement.append(heading);
      desktopSearchResults.append(groupElement);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desktop-search-result';
    button.id = `desktop-search-result-${++desktopSearchResultId}`;
    button.dataset.index = String(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.setAttribute('aria-label', `${item.title}, ${item.detail}`);
    const icon = document.createElement('span');
    icon.className = 'desktop-search-result-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = item.icon;
    const copy = document.createElement('span');
    copy.className = 'desktop-search-result-copy';
    const title = document.createElement('span');
    title.className = 'desktop-search-result-title';
    title.textContent = item.title;
    const detail = document.createElement('span');
    detail.className = 'desktop-search-result-detail';
    detail.textContent = item.detail;
    copy.append(title, detail);
    button.append(icon, copy);
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', event => {
      event.stopPropagation();
      closeDesktopSearch();
      item.activate();
    });
    groupElement.append(button);
  });
  desktopSearchStatus.textContent = `${visible.length} suggestion${visible.length === 1 ? '' : 's'} available.`;
}

async function loadDesktopSearchItems() {
  if (desktopSearchLoadPromise) return desktopSearchLoadPromise;
  if (!desktopSearchItemsReady) desktopSearchStatus.textContent = 'Loading suggestions…';
  desktopSearchLoadPromise = (async () => {
    await Promise.all([
      ensureLauncherManifest('posts'),
      ensureLauncherManifest('documents'),
      ensureLauncherManifest('pictures'),
      ensureLauncherManifest('videos'),
    ]);
    desktopSearchItems = buildDesktopSearchItems();
    desktopSearchItemsReady = true;
    renderDesktopSearchResults();
  })();
  try {
    await desktopSearchLoadPromise;
  } finally {
    desktopSearchLoadPromise = null;
  }
}

desktopSearchInput.addEventListener('focus', () => {
  desktopSearchSuggestions.hidden = false;
  desktopSearchInput.setAttribute('aria-expanded', 'true');
  renderDesktopSearchResults();
  loadDesktopSearchItems();
});

desktopSearchInput.addEventListener('input', () => {
  desktopSearchSuggestions.hidden = false;
  desktopSearchInput.setAttribute('aria-expanded', 'true');
  if (desktopSearchItemsReady) renderDesktopSearchResults();
  else loadDesktopSearchItems();
});

desktopSearchInput.addEventListener('keydown', event => {
  const buttons = [...desktopSearchResults.querySelectorAll('.desktop-search-result')];
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeDesktopSearch({ restoreFocus: true });
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!buttons.length) return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    desktopSearchActiveIndex = desktopSearchActiveIndex < 0
      ? delta > 0 ? 0 : buttons.length - 1
      : (desktopSearchActiveIndex + delta + buttons.length) % buttons.length;
    buttons.forEach((button, index) => {
      button.classList.toggle('active', index === desktopSearchActiveIndex);
      button.setAttribute('aria-selected', String(index === desktopSearchActiveIndex));
    });
    desktopSearchInput.setAttribute(
      'aria-activedescendant',
      buttons[desktopSearchActiveIndex].id,
    );
    return;
  }
  if (event.key === 'Enter' && buttons.length) {
    event.preventDefault();
    buttons[desktopSearchActiveIndex < 0 ? 0 : desktopSearchActiveIndex].click();
  }
});

desktopSearch.addEventListener('focusout', () => {
  requestAnimationFrame(() => {
    if (!desktopSearch.contains(document.activeElement)) closeDesktopSearch();
  });
});

document.addEventListener('pointerdown', event => {
  if (!desktopSearch.contains(event.target)) closeDesktopSearch();
});

launcherFileSearch.addEventListener('input', () => {
  const { query, appCount, documentCount, pictureCount, videoCount } = updateLauncherFileSearch();
  clearTimeout(launcherSearchAnnouncementTimer);
  launcherSearchAnnouncementTimer = setTimeout(() => {
    const apps = `${appCount} ${appCount === 1 ? 'app' : 'apps'}`;
    const documents = `${documentCount} ${documentCount === 1 ? 'document' : 'documents'}`;
    const pictures = `${pictureCount} ${pictureCount === 1 ? 'picture' : 'pictures'}`;
    const videos = `${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`;
    launcherFileSearchStatus.textContent = query
      ? `Matching results: ${apps}, ${documents}, ${pictures}, and ${videos}.`
      : `All ${apps}, ${documents}, ${pictures}, and ${videos} are shown.`;
  }, 250);
});

// ── App context (passed to all app builders) ──────────────────
const appCtx = {
  appApis:        S.appApis,
  appTitles:      S.appTitles,
  is24HourTime:   () => use24HourTime,
  setAppTitle,
  toast,
  requestOpenFile,
  saveSession,
  openGameMenu: () => openAppMenu(true),
  updateDesktopNotes,
  settings: {
    getSnapshot: () => ({
      theme: effectiveTheme(),
      themeOverride: readRaw(THEME_KEY) || 'system',
      animationPreferences: getAnimationPreferences(),
      use24HourTime,
      notificationsEnabled: systemNotificationsEnabled,
    }),
    setTheme: value => applyTheme(value === 'system' ? null : value),
    setAnimationPreferences: setAnimationPreference,
    set24HourTime: setTimeFormat,
    setNotificationsEnabled: setSystemNotificationsEnabled,
    loadWallpaper: loadWallpaperForSettings,
    saveWallpaper: saveWallpaperPreferences,
    useDefaultWallpaper,
    subscribe(listener) {
      const handler = () => listener();
      window.addEventListener('desktop-settings-change', handler);
      return () => window.removeEventListener('desktop-settings-change', handler);
    },
  },
};

// ── App registry ──────────────────────────────────────────────
function lazyApp(title, iconSvg, modulePath, loadModule, exportName, styles = []) {
  return {
    title,
    iconSvg,
    modulePath,
    loadModule,
    styles,
    build: (module, id, state, ctx) => module[exportName](id, ctx, state),
  };
}

const GAME_MODULE_PATH = './apps/game-center.js';
const GAME_STYLE_PATHS = [
  './apps/games/games.css',
  './apps/games/artwork.css',
  './apps/games/glass.css',
];
const APP_DEFS = {
  ...Object.fromEntries(GAMES.map(game => [game.type, {
    title: game.title,
    iconSvg: game.iconSvg,
    modulePath: GAME_MODULE_PATH,
    loadModule: () => import('./apps/game-center.js'),
    styles: GAME_STYLE_PATHS,
    build: (module, id, state, ctx) => module.buildGame(game.type, id, ctx, state),
  }])),
  'doc-viewer': lazyApp(
    'Document Viewer',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
    </svg>`,
    './apps/doc-viewer.js',
    () => import('./apps/doc-viewer.js'),
    'buildDocViewer',
  ),
  'img-viewer': lazyApp(
    'Image Viewer',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
    </svg>`,
    './apps/img-viewer.js',
    () => import('./apps/img-viewer.js'),
    'buildImgViewer',
  ),
  'file-manager': lazyApp(
    'File Manager',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>`,
    './apps/file-manager.js',
    () => import('./apps/file-manager.js'),
    'buildFileManager',
  ),
  'media-player': lazyApp(
    'Media Player',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/>
    </svg>`,
    './apps/media-player.js',
    () => import('./apps/media-player.js'),
    'buildMediaPlayer',
  ),
  calendar: lazyApp(
    'Calendar',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2zm13 8H4v10h16V10z"/></svg>`,
    './apps/calendar.js',
    () => import('./apps/calendar.js'),
    'buildCalendar',
  ),
  'world-clock': lazyApp(
    'World Clock',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.4 4 2.4-1 1.7-5-3V6h2v6.4z"/></svg>`,
    './apps/world-clock.js',
    () => import('./apps/world-clock.js'),
    'buildWorldClock',
  ),
  calculator: lazyApp(
    'Calculator',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 3v4h12V5H6z"/></svg>`,
    './apps/calculator.js',
    () => import('./apps/calculator.js'),
    'buildCalculator',
  ),
  'sticky-notes': lazyApp(
    'Sticky Notes',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v11l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>`,
    './apps/sticky-notes.js',
    () => import('./apps/sticky-notes.js'),
    'buildStickyNotes',
  ),
  weather: lazyApp(
    'Weather',
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 18a5 5 0 1 1 .8-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8H7z"/></svg>`,
    './apps/weather.js',
    () => import('./apps/weather.js'),
    'buildWeather',
  ),
  settings: lazyApp(
    'Settings',
    SETTINGS_ICON,
    './apps/settings.js',
    () => import('./apps/settings.js'),
    'buildSettings',
    ['./apps/settings.css'],
  ),
};

// ── Session restore ───────────────────────────────────────────
function restoreSession() {
  try {
    const rawV2 = readRawResult(SESSION_KEY).value;
    let isV1 = false;
    const rawV1 = rawV2 === null ? readRawResult(SESSION_KEY_V1).value : null;
    if (rawV2 === null && rawV1 === null) return;
    if (rawV2 === null) isV1 = true;
    const data = readJSON(isV1 ? SESSION_KEY_V1 : SESSION_KEY, null, {
      validate: value => Boolean(value && (Array.isArray(value) || typeof value === 'object')),
    });
    if (!data) return;

    S._skipSave = true;

    if (!isV1 && data.v === 2 && Array.isArray(data.columns)) {
      for (const colData of data.columns) {
        const preset = WIDTH_PRESETS.includes(colData.widthPreset) ? colData.widthPreset : 'full';
        let colId = null;
        for (let i = 0; i < colData.apps.length; i++) {
          const appData = colData.apps[i];
          if (typeof appData.type !== 'string' || !APP_DEFS[appData.type]) continue;
          const appId = openApp(appData.type, colId, appData.state);
          if (i === 0 && appId) {
            const col = getAppColumn(appId);
            colId = col ? col.id : null;
          }
        }
        if (colId && preset !== 'full') {
          const col = S.columns.find(c => c.id === colId);
          if (col) {
            col.widthPreset = preset;
            col.el.dataset.width = preset;
          }
        }
      }
    } else if (isV1 && Array.isArray(data)) {
      for (const entry of data) {
        if (typeof entry.type !== 'string' || !APP_DEFS[entry.type]) continue;
        const appId = openApp(entry.type);
        const preset = WIDTH_PRESETS.includes(entry.widthPreset) ? entry.widthPreset : 'full';
        if (appId && preset !== 'full') {
          const col = getAppColumn(appId);
          if (col) {
            col.widthPreset = preset;
            col.el.dataset.width = preset;
          }
        }
      }
    }

    if (!isV1 && data.v === 2
      && Number.isInteger(data.focused?.columnIndex)
      && Number.isInteger(data.focused?.appIndex)) {
      const focusedAppId = S.columns[data.focused.columnIndex]?.appIds[data.focused.appIndex];
      if (focusedAppId) focusApp(focusedAppId);
    }

    S._skipSave = false;
    if (S.focusedId) requestAnimationFrame(() => scrollToApp(S.focusedId));
  } catch {
    S._skipSave = false;
  }
}

// ── Column event wiring (click-to-focus) ─────────────────────
function wireColEvents(colEl) {
  // In overview: block scroll/interaction on non-focused windows but allow the
  // focused window to scroll naturally; exit/focus handled by the click event.
  colEl.addEventListener('pointerdown', e => {
    const appEl = e.target.closest('.app-window');
    if (!appEl?.dataset.id) return;
    if (document.body.classList.contains('mod-overview')) {
      if (appEl.dataset.id !== S.focusedId) e.preventDefault();
      return; // click event handles exit / focus-change
    }
    focusApp(appEl.dataset.id);
  }, { capture: true });

  // Click fires only after a tap/click (not after a scroll drag), so this
  // naturally handles "exit overview on tap, not on hold/scroll".
  colEl.addEventListener('click', e => {
    if (!document.body.classList.contains('mod-overview')) return;
    const appEl = e.target.closest('.app-window');
    if (!appEl?.dataset.id) return;
    e.preventDefault();
    e.stopPropagation();
    if (appEl.dataset.id === S.focusedId) {
      exitOverview();
    } else {
      focusApp(appEl.dataset.id);
    }
  }, { capture: true });
}

// ── Global event listeners ────────────────────────────────────
appMenuBtn.addEventListener('click', e => { e.stopPropagation(); toggleAppMenu(); });

const gameMenu = initGameMenu(appMenu, type => {
  openApp(type);
  closeAppMenu();
});

document.querySelectorAll('#app-list .app-launcher[data-type]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.type === 'welcome') openWelcomeWindow();
    else openApp(button.dataset.type);
    closeAppMenu();
  });
});

closeBtn.addEventListener('click', () => { if (S.focusedId) closeApp(S.focusedId); });
overviewBtn.addEventListener('click', () => toggleOverview());
showDesktopBtn.addEventListener('click', () => {
  setShowDesktop(!document.body.classList.contains('mod-show-desktop'));
});
winMenuBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (document.getElementById('win-menu-open')) { closeWinMenu(); return; }
  openWinMenu();
});
helpOpenLauncher.addEventListener('click', () => { closeHelp(); openAppMenu(); });

// ── App-menu help button → open help overlay ──────────────────
$('app-menu-help-btn').addEventListener('click', () => { closeAppMenu(); openHelp(); });

// ── Help overlay tab switching ────────────────────────────────
document.querySelectorAll('.help-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.help-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.help-panel').forEach(p => p.setAttribute('hidden', ''));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const panel = document.getElementById('help-panel-' + tab.dataset.panel);
    if (panel) panel.removeAttribute('hidden');
  });
});

document.addEventListener('click', e => {
  if (!systemPanel.hidden &&
      !systemPanel.contains(e.target) &&
      e.target !== systemTimeBtn &&
      !systemTimeBtn.contains(e.target)) {
    closeSystemPanel();
  }

  // Close app menu when clicking outside
  if (!appMenu.hasAttribute('hidden') &&
      !appMenu.contains(e.target) &&
      e.target !== appMenuBtn &&
      !appMenuBtn.contains(e.target)) closeAppMenu();

  // Close win menu when clicking outside
  const openMenu = document.getElementById('win-menu-open');
  if (openMenu && !openMenu.contains(e.target) && e.target !== winMenuBtn && !winMenuBtn.contains(e.target)) {
    closeWinMenu();
  }

  // Exit overview when clicking outside any window or control
  if (document.body.classList.contains('mod-overview') &&
      !e.target.closest('.app-window') &&
      !e.target.closest('#overview-controls') &&
      e.target !== overviewBtn && !overviewBtn.contains(e.target)) {
    exitOverview();
  }
});

document.addEventListener('keydown', e => {
  const menuOpen  = !appMenu.hasAttribute('hidden');
  const helpOpen  = !helpOverlay.hasAttribute('hidden');
  const inContent = e.target.closest('.app-content');
  const isTyping  = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

  if (e.key === 'Escape') {
    if (!systemPanel.hidden) { closeSystemPanel(); systemTimeBtn.focus(); return; }
    if (helpOpen) { closeHelp(); appMenuBtn.focus(); return; }
    if (menuOpen) { closeAppMenu(); appMenuBtn.focus(); return; }
    if (document.getElementById('win-menu-open')) { closeWinMenu(); return; }
    if (document.body.classList.contains('mod-overview')) { exitOverview(); return; }
    return;
  }

  if (e.key === '?' && !isTyping && !menuOpen) { e.preventDefault(); toggleHelp(); return; }

  if ((e.key === '[' || e.key === ']') && !isTyping && !helpOpen && !menuOpen) {
    e.preventDefault();
    const focusedCol  = S.focusedId ? getAppColumn(S.focusedId) : null;
    const inSharedCol = focusedCol && focusedCol.appIds.length > 1;
    if (e.key === '[') { inSharedCol ? expelLeft()  : consumeLeft();  }
    else               { inSharedCol ? expelRight() : consumeRight(); }
    return;
  }

  if (helpOpen || menuOpen || isTyping) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); openAppMenu(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault(); focusAppByIndex(parseInt(e.key, 10)); return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === '<') { e.preventDefault(); cycleFocusedWidthNarrower(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === '>') { e.preventDefault(); cycleFocusedWidthWider();    return; }

  if (!inContent) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); focusPrevApp(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusNextApp(); return; }
    const focusedCol  = S.focusedId ? getAppColumn(S.focusedId) : null;
    const inSharedCol = focusedCol && focusedCol.appIds.length > 1;
    if (inSharedCol && e.key === 'ArrowUp')   { e.preventDefault(); moveWindowUp();   return; }
    if (inSharedCol && e.key === 'ArrowDown') { e.preventDefault(); moveWindowDown(); return; }
  }

  if (e.key === 'Tab' && !inContent) {
    e.preventDefault();
    e.shiftKey ? focusPrevApp() : focusNextApp();
  }
});

helpCloseBtn.addEventListener('click', () => closeHelp());
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) closeHelp(); });

// ── Overview mode ─────────────────────────────────────────────
// Shared state kept alive between positionOverview calls so _ovRender
// can pan the view without re-measuring natural positions.
const _OV_SCALE    = 0.5;
const _OV_TOPBAR_H = 48;
let _ovNatColRects = null;
let _ovNatWinRects = null;
let _ovStripRect   = null;
let _ovTX = 0, _ovTY = 0;

// Apply a translate+scale transform and rebuild the controls overlay.
// Called both by positionOverview (after measuring) and by the wheel handler.
function _ovRender(tX, tY) {
  _ovTX = tX;
  _ovTY = tY;
  appStrip.classList.add('ov-notransition');
  appStrip.style.transformOrigin = '0 0';
  appStrip.style.transform = `translate(${tX}px,${tY}px) scale(${_OV_SCALE})`;
  void appStrip.offsetWidth;
  appStrip.classList.remove('ov-notransition');
  document.getElementById('overview-controls')?.remove();
  if (_ovNatColRects && _ovNatWinRects && _ovStripRect) {
    _buildOverviewControls(_ovNatColRects, _ovNatWinRects, _ovStripRect, tX, tY, _OV_SCALE);
  }
}

// Wheel handler: horizontal scroll (deltaX) or shift+wheel pans the overview.
// Vertical wheel over the focused window is left to native scroll.
function _ovWheelHandler(e) {
  const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
  if (dx === 0) return;          // leave plain vertical wheel for window scroll
  e.preventDefault();
  _ovRender(_ovTX - dx, _ovTY);
}

function enterOverview() {
  window.clearTimeout(overviewAnimationTimer);
  document.body.classList.remove('overview-exiting');
  const overviewChoices = getAnimationPreferences().overview;
  appStrip.classList.toggle(
    'ov-no-transition',
    overviewChoices.length === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  document.body.classList.add('mod-overview');
  overviewBtn.setAttribute('aria-pressed', 'true');
  window.addEventListener('wheel', _ovWheelHandler, { passive: false });
  requestAnimationFrame(() => {
    positionOverview();
    animateOverviewWindows('entering');
  });
}

function animateOverviewWindows(direction) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const windows = [...appStrip.querySelectorAll('.app-window')];
  const center = window.innerWidth / 2;
  const centerFirst = windows
    .map((el, index) => ({ el, index, distance: Math.abs(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 - center) }))
    .sort((a, b) => a.distance - b.distance);
  const rank = new Map(centerFirst.map((entry, index) => [entry.el, index]));
  windows.forEach(el => {
    const animation = chooseAnimationForEvent('overview');
    el.dataset.overviewAnimation = animation;
    el.style.setProperty('--overview-stagger', `${(rank.get(el) || 0) * 72}ms`);
    el.classList.remove('overview-window-entering', 'overview-window-exiting');
    if (animation !== 'none') el.classList.add(`overview-window-${direction}`);
  });
  overviewAnimationTimer = window.setTimeout(() => {
    for (const el of windows) {
      el.classList.remove('overview-window-entering', 'overview-window-exiting');
      el.style.removeProperty('--overview-stagger');
    }
    document.body.classList.remove('overview-exiting');
    appStrip.classList.remove('ov-no-transition');
  }, 720);
}

function exitOverview({ animate = true } = {}) {
  window.clearTimeout(overviewAnimationTimer);
  if (animate) animateOverviewWindows('exiting');
  else {
    for (const el of appStrip.querySelectorAll('.app-window')) {
      el.classList.remove('overview-window-entering', 'overview-window-exiting');
      el.style.removeProperty('--overview-stagger');
    }
  }
  const noOverviewMotion = getAnimationPreferences().overview.length === 0 ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  appStrip.classList.toggle('ov-no-transition', noOverviewMotion);
  document.body.classList.toggle('overview-exiting', animate);
  document.body.classList.remove('mod-overview');
  overviewBtn.setAttribute('aria-pressed', 'false');
  window.removeEventListener('wheel', _ovWheelHandler);
  appStrip.style.transform       = '';
  appStrip.style.transformOrigin = '';
  if (noOverviewMotion && animate) {
    window.clearTimeout(overviewAnimationTimer);
    overviewAnimationTimer = window.setTimeout(() => appStrip.classList.remove('ov-no-transition'), 720);
  } else if (noOverviewMotion) {
    requestAnimationFrame(() => appStrip.classList.remove('ov-no-transition'));
  }
  document.getElementById('overview-controls')?.remove();
  _ovNatColRects = _ovNatWinRects = _ovStripRect = null;
}

function toggleOverview() {
  document.body.classList.contains('mod-overview') ? exitOverview() : enterOverview();
}

// Re-measure natural positions, compute centering transform, then render.
// Call this when the column layout changes (open/close/resize/swap).
function positionOverview() {
  if (!document.body.classList.contains('mod-overview')) return;
  document.getElementById('overview-controls')?.remove();
  if (S.apps.length === 0) return;

  // Temporarily remove transform so getBoundingClientRect gives natural coords.
  appStrip.classList.add('ov-notransition');
  appStrip.style.transform       = '';
  appStrip.style.transformOrigin = '';
  void appStrip.offsetWidth;

  _ovStripRect   = appStrip.getBoundingClientRect();
  _ovNatColRects = S.columns.map(col => col.el.getBoundingClientRect());
  _ovNatWinRects = new Map(S.apps.map(app => [app.id, app.el.getBoundingClientRect()]));

  // Restore CSS transition before the new transform is applied.
  appStrip.style.transform = ''; // ensure blank so removing notransition triggers transition
  appStrip.classList.remove('ov-notransition');

  let tX = 0, tY = 0;
  if (S.focusedId) {
    const natWR = _ovNatWinRects.get(S.focusedId);
    if (natWR) {
      const wCxS = natWR.left + natWR.width  / 2 - _ovStripRect.left;
      const wCyS = natWR.top  + natWR.height / 2 - _ovStripRect.top;
      const vCX  = window.innerWidth  / 2;
      const vCY  = _OV_TOPBAR_H + (window.innerHeight - _OV_TOPBAR_H) / 2;
      tX = vCX - _ovStripRect.left - wCxS * _OV_SCALE;
      tY = vCY - _ovStripRect.top  - wCyS * _OV_SCALE;
    }
  }

  // Apply via _ovRender (saves tX/tY, applies transform, builds controls).
  // Use requestAnimationFrame so the CSS transition plays from the reset state.
  requestAnimationFrame(() => _ovRender(tX, tY));
}

function _ovRect(natRect, stripRect, tX, tY, scale) {
  return {
    left:   stripRect.left + (natRect.left - stripRect.left) * scale + tX,
    top:    stripRect.top  + (natRect.top  - stripRect.top)  * scale + tY,
    width:  natRect.width  * scale,
    height: natRect.height * scale,
  };
}

const _ARROW_L = `<svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="7,2 2,8 7,14"/></svg>`;
const _ARROW_R = `<svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3,2 8,8 3,14"/></svg>`;
const _DRAG_IC = `<svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" aria-hidden="true"><rect y="0" width="14" height="2" rx="1"/><rect y="4" width="14" height="2" rx="1"/><rect y="8" width="14" height="2" rx="1"/></svg>`;

function _buildOverviewControls(natColRects, natWinRects, stripRect, tX, tY, scale) {
  const layer = document.createElement('div');
  layer.id = 'overview-controls';
  document.body.appendChild(layer);

  const focusedColIdx = S.columns.findIndex(col => col.appIds.includes(S.focusedId));

  S.columns.forEach((col, ci) => {
    // Compute visual rect from natural rect using the known transform parameters.
    // This is reliable even when the scrollable wrapper clips the visual output.
    const cr = _ovRect(natColRects[ci], stripRect, tX, tY, scale);
    const midY = cr.top + cr.height / 2;

    // ── Arrows only on the active (focused) column ──
    if (ci === focusedColIdx) {
      const lBtn = document.createElement('button');
      lBtn.className = 'ov-arrow';
      lBtn.innerHTML = _ARROW_L;
      lBtn.setAttribute('aria-label', 'Move column left');
      lBtn.disabled = ci === 0;
      lBtn.style.cssText = `left:${cr.left - 44}px;top:${midY - 18}px;`;
      lBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (ci === 0) return;
        [S.columns[ci - 1], S.columns[ci]] = [S.columns[ci], S.columns[ci - 1]];
        appStrip.insertBefore(S.columns[ci - 1].el, S.columns[ci].el);
        saveSession();
        updateTopBar();
        positionOverview();
      });
      layer.appendChild(lBtn);

      const rBtn = document.createElement('button');
      rBtn.className = 'ov-arrow';
      rBtn.innerHTML = _ARROW_R;
      rBtn.setAttribute('aria-label', 'Move column right');
      rBtn.disabled = ci === S.columns.length - 1;
      rBtn.style.cssText = `left:${cr.left + cr.width + 8}px;top:${midY - 18}px;`;
      rBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (ci === S.columns.length - 1) return;
        [S.columns[ci], S.columns[ci + 1]] = [S.columns[ci + 1], S.columns[ci]];
        S.columns[ci].el.after(S.columns[ci + 1].el);
        saveSession();
        updateTopBar();
        positionOverview();
      });
      layer.appendChild(rBtn);
    }

    // ── Drag handle per window ──
    col.appIds.forEach(appId => {
      const app   = S.apps.find(a => a.id === appId);
      const natWR = natWinRects.get(appId);
      if (!app || !natWR) return;
      const wr = _ovRect(natWR, stripRect, tX, tY, scale);
      const h  = document.createElement('div');
      h.className = 'ov-drag-handle';
      h.dataset.appId = appId;
      h.title = 'Drag to reorder';
      h.innerHTML = _DRAG_IC;
      h.style.cssText = `left:${wr.left + wr.width / 2 - 20}px;top:${wr.top + 6}px;`;
      _wireOvDrag(h, appId, layer);
      layer.appendChild(h);
    });
  });

  // ── Width pill above the focused window ──
  if (S.focusedId) {
    const fApp  = S.apps.find(a => a.id === S.focusedId);
    const fCol  = fApp ? getAppColumn(S.focusedId) : null;
    const natWR = natWinRects.get(S.focusedId);
    if (fApp && fCol && natWR) {
      const wr   = _ovRect(natWR, stripRect, tX, tY, scale);
      const pill = document.createElement('div');
      pill.id    = 'ov-width-pill';
      const active = fCol.widthPreset;
      [{ p: 'third', l: '⅓' }, { p: 'half', l: '½' }, { p: 'full', l: 'Full' }].forEach(({ p, l }) => {
        const b = document.createElement('button');
        b.className = 'ov-pill-btn' + (active === p ? ' active' : '');
        b.textContent = l;
        b.addEventListener('click', e => {
          e.stopPropagation();
          setFocusedWidth(p);
          setTimeout(() => positionOverview(), 260);
        });
        pill.appendChild(b);
      });
      const PW = 156;
      pill.style.cssText =
        `left:${wr.left + wr.width / 2 - PW / 2}px;top:${wr.top - 52}px;width:${PW}px;`;
      layer.appendChild(pill);
    }
  }
}

// ── Overview drag-to-reorder ──────────────────────────────────
let _ovDrag = null;

// Build explicit drop-zone elements into `layer` for the given dragged window.
// Returns an array of { el, meta } objects for hit-testing.
function _buildDropZones(draggedId, layer) {
  const srcCol = getAppColumn(draggedId);
  const scale  = _OV_SCALE;
  const tX     = _ovTX, tY = _ovTY;
  const sr     = _ovStripRect;
  const zones  = [];

  function makeZone(extraClass, style, meta) {
    const el = document.createElement('div');
    el.className = `ov-drop-zone ${extraClass}`;
    el.style.cssText = style;
    Object.assign(el.dataset, meta);
    layer.appendChild(el);
    zones.push({ el, meta });
  }

  // ── Within-column zones ──
  S.columns.forEach((col, ci) => {
    const cr = _ovRect(_ovNatColRects[ci], sr, tX, tY, scale);

    // Divide the column height equally into (N+1) drop zones
    const N        = col.appIds.length;
    const ZONE_GAP = 2;   // px between adjacent zones
    const PAD      = 4;   // horizontal inset
    const totalGap = ZONE_GAP * N;
    const sectionH = (cr.height - totalGap) / (N + 1);
    const draggedIdx = col === srcCol ? col.appIds.indexOf(draggedId) : -1;

    for (let i = 0; i <= N; i++) {
      // In the source column, the slots immediately before and after the
      // dragged window preserve its current order, so do not present them.
      if (col === srcCol && (i === draggedIdx || i === draggedIdx + 1)) continue;
      const zoneTop = cr.top + i * (sectionH + ZONE_GAP);
      makeZone(
        'ov-drop-zone--within',
        `left:${cr.left + PAD}px;top:${zoneTop}px;width:${cr.width - PAD * 2}px;height:${sectionH}px;`,
        { type: 'within', colId: col.id, insertAt: String(i) }
      );
    }
  });

  // ── Column-boundary zones ──
  // A shared source creates a new column; a solo source moves its whole column.
  // For a solo source, omit its current left/right boundaries because both are no-ops.
  if (srcCol) {
    const allCR  = S.columns.map((_, ci) => _ovRect(_ovNatColRects[ci], sr, tX, tY, scale));
    const minTop = Math.min(...allCR.map(r => r.top));
    const maxBot = Math.max(...allCR.map(r => r.top + r.height));
    const zH     = maxBot - minTop;
    const ZW     = 48; // generous hit target around each column boundary
    const srcIdx = S.columns.indexOf(srcCol);
    const sourceIsSolo = srcCol.appIds.length === 1;

    for (let boundary = 0; boundary <= S.columns.length; boundary++) {
      if (sourceIsSolo && (boundary === srcIdx || boundary === srcIdx + 1)) continue;

      let centerX;
      if (boundary === 0) {
        centerX = allCR[0].left - ZW / 2 - 4;
      } else if (boundary === S.columns.length) {
        const last = allCR[allCR.length - 1];
        centerX = last.left + last.width + ZW / 2 + 4;
      } else {
        const left  = allCR[boundary - 1];
        const right = allCR[boundary];
        centerX = left.left + left.width + (right.left - left.left - left.width) / 2;
      }

      makeZone(
        'ov-drop-zone--new-col',
        `left:${centerX - ZW / 2}px;top:${minTop}px;width:${ZW}px;height:${zH}px;`,
        { type: 'new-col', insertAt: String(boundary) }
      );
    }
  }

  return zones;
}

function _wireOvDrag(handle, appId, layer) {
  let ghost      = null;
  let zones      = [];
  let activeZone = null;

  function clearZones() {
    zones.forEach(({ el }) => el.remove());
    zones      = [];
    activeZone = null;
    layer.classList.remove('ov-dragging');
  }

  handle.addEventListener('pointerdown', e => {
    e.stopPropagation();
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    _ovDrag = { appId };
    ghost = document.createElement('div');
    ghost.className = 'ov-drag-ghost';
    ghost.innerHTML = _DRAG_IC;
    ghost.style.cssText = `left:${e.clientX - 20}px;top:${e.clientY - 14}px;`;
    layer.appendChild(ghost);
    handle.classList.add('dragging');
    layer.classList.add('ov-dragging');
    zones = _buildDropZones(appId, layer);
  });

  handle.addEventListener('pointermove', e => {
    if (!_ovDrag || !ghost) return;
    ghost.style.left = (e.clientX - 20) + 'px';
    ghost.style.top  = (e.clientY - 14) + 'px';

    // Find which drop zone the cursor is over
    let found = null;
    for (const z of zones) {
      const r = z.el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top  && e.clientY <= r.bottom) {
        found = z; break;
      }
    }
    if (activeZone && activeZone !== found) activeZone.el.classList.remove('active');
    if (found && found !== activeZone)      found.el.classList.add('active');
    activeZone = found;
  });

  handle.addEventListener('pointerup', () => {
    if (!_ovDrag) return;
    ghost?.remove(); ghost = null;
    handle.classList.remove('dragging');
    const drop = activeZone?.meta || null;
    clearZones();
    if (drop) _ovPerformDrop(appId, drop);
    _ovDrag = null;
  });

  handle.addEventListener('pointercancel', () => {
    ghost?.remove(); ghost = null;
    handle.classList.remove('dragging');
    clearZones();
    _ovDrag = null;
  });
}

function _ovPerformDrop(draggedId, meta) {
  if (!meta) return;

  // ── New column ──
  if (meta.type === 'new-col') {
    const srcCol = getAppColumn(draggedId);
    if (!srcCol) return;
    let insertAt = parseInt(meta.insertAt, 10);
    if (!Number.isInteger(insertAt)) return;

    // A solo window already is a complete column, so move that column.
    if (srcCol.appIds.length === 1) {
      const srcIdx = S.columns.indexOf(srcCol);
      if (insertAt === srcIdx || insertAt === srcIdx + 1) return;

      S.columns.splice(srcIdx, 1);
      srcCol.el.remove();
      if (insertAt > srcIdx) insertAt--;
      insertAt = Math.min(insertAt, S.columns.length);
      S.columns.splice(insertAt, 0, srcCol);
      appStrip.insertBefore(srcCol.el, appStrip.children[insertAt] || null);

      saveSession();
      updateTopBar();
      updateStripLayout();
      requestAnimationFrame(() => positionOverview());
      return;
    }

    srcCol.appIds.splice(srcCol.appIds.indexOf(draggedId), 1);
    const app = S.apps.find(a => a.id === draggedId);
    app.el.remove();
    // srcCol retains ≥1 window — do not remove it

    const newColId = `col-${S.nextColId++}`;
    const newColEl = createColEl(newColId);
    newColEl.dataset.width = srcCol.widthPreset;
    newColEl.appendChild(app.el);
    const newCol = { id: newColId, appIds: [draggedId], widthPreset: srcCol.widthPreset, el: newColEl };

    insertAt = Math.min(insertAt, S.columns.length);
    appStrip.insertBefore(newColEl, appStrip.children[insertAt] || null);
    wireColEvents(newColEl);

    S.columns.splice(insertAt, 0, newCol);

    saveSession();
    updateTopBar();
    updateStripLayout();
    requestAnimationFrame(() => positionOverview());
    return;
  }

  // ── Within existing column ──
  if (meta.type === 'within') {
    const { colId } = meta;
    const insertAt  = parseInt(meta.insertAt, 10);
    const srcCol    = getAppColumn(draggedId);
    if (!srcCol) return;

    // Bail if drop is a no-op (window is already in that slot)
    if (srcCol.id === colId) {
      const curIdx = srcCol.appIds.indexOf(draggedId);
      if (curIdx === insertAt || curIdx === insertAt - 1) return;
    }

    srcCol.appIds.splice(srcCol.appIds.indexOf(draggedId), 1);
    const app = S.apps.find(a => a.id === draggedId);
    app.el.remove();

    if (srcCol.appIds.length === 0) {
      srcCol.el.remove();
      S.columns.splice(S.columns.indexOf(srcCol), 1);
    }

    const dstCol = S.columns.find(c => c.id === colId);
    if (!dstCol) return;

    const at = Math.min(insertAt, dstCol.appIds.length);
    dstCol.appIds.splice(at, 0, draggedId);
    dstCol.el.insertBefore(app.el, dstCol.el.querySelectorAll('.app-window')[at] || null);

    saveSession();
    updateTopBar();
    updateStripLayout();
    requestAnimationFrame(() => positionOverview());
  }
}

window.addEventListener('resize', () => {
  if (document.body.classList.contains('mod-overview')) positionOverview();
});

// ── Per-window ⋮ menu ─────────────────────────────────────────
const WIDTH_MENU_ITEMS = [
  {
    preset: 'third',
    label: '⅓ Width',
    svg: `<svg width="16" height="11" viewBox="0 0 20 13" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="5" height="13" rx="1"/><rect x="7.5" y="0" width="5" height="13" rx="1" opacity="0.3"/><rect x="15" y="0" width="5" height="13" rx="1" opacity="0.3"/></svg>`,
  },
  {
    preset: 'half',
    label: '½ Width',
    svg: `<svg width="16" height="11" viewBox="0 0 20 13" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="9" height="13" rx="1"/><rect x="11" y="0" width="9" height="13" rx="1" opacity="0.3"/></svg>`,
  },
  {
    preset: 'full',
    label: 'Full Width',
    svg: `<svg width="16" height="11" viewBox="0 0 20 13" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="20" height="13" rx="1"/></svg>`,
  },
];

function openWinMenu() {
  if (!S.focusedId) return;
  const col = getAppColumn(S.focusedId);
  const dropdown = document.createElement('div');
  dropdown.className = 'win-menu-dropdown menu-popover';
  dropdown.id = 'win-menu-open';

  WIDTH_MENU_ITEMS.forEach(({ preset, label, svg }) => {
    const item = document.createElement('button');
    item.className = 'win-menu-item' + (col?.widthPreset === preset ? ' active' : '');
    item.innerHTML = `${svg}<span>${label}</span>`;
    item.addEventListener('click', e => {
      e.stopPropagation();
      setFocusedWidth(preset);
      closeWinMenu();
    });
    dropdown.appendChild(item);
  });

  const rect = winMenuBtn.getBoundingClientRect();
  dropdown.style.top   = (rect.bottom + 4) + 'px';
  dropdown.style.right = (window.innerWidth - rect.right) + 'px';
  document.body.appendChild(dropdown);
  winMenuBtn.setAttribute('aria-expanded', 'true');
}

function closeWinMenu() {
  document.getElementById('win-menu-open')?.remove();
  winMenuBtn.setAttribute('aria-expanded', 'false');
}

// ── Welcome floating window ───────────────────────────────────
const _welcomeTabs = {
  welcome: { url: '/files/posts/20240101_Welcome.md',  html: null, promise: null, message: '' },
  about:   { url: '/files/posts/20240115_About_Me.md', html: null, promise: null, message: '' },
  links:   { url: '/files/posts/20240201_My_Sites.md', html: null, promise: null, message: '' },
};
let _welcomeActiveTab = 'welcome';

function showWelcomeStatus(body, message, busy = true) {
  body.replaceChildren();
  body.setAttribute('aria-busy', String(busy));
  const status = document.createElement('p');
  status.className = 'welcome-load-status';
  status.setAttribute('role', 'status');
  status.textContent = message;
  body.append(status);
  if (busy) {
    const skeleton = document.createElement('div');
    skeleton.className = 'welcome-skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    skeleton.innerHTML = `
      <i class="welcome-skeleton-heading"></i>
      <i class="welcome-skeleton-subheading"></i>
      <i class="welcome-skeleton-line"></i>
      <i class="welcome-skeleton-line"></i>
      <i class="welcome-skeleton-line"></i>
      <i class="welcome-skeleton-line welcome-skeleton-line-short"></i>
      <i class="welcome-skeleton-gap"></i>
      <i class="welcome-skeleton-line"></i>
      <i class="welcome-skeleton-line"></i>
      <i class="welcome-skeleton-line welcome-skeleton-line-medium"></i>`;
    body.append(skeleton);
  }
}

function showWelcomeFailure(body, name) {
  body.replaceChildren();
  body.setAttribute('aria-busy', 'false');
  const message = document.createElement('p');
  message.className = 'doc-status doc-error';
  message.setAttribute('role', 'alert');
  message.textContent = 'This section couldn’t be loaded.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'welcome-retry-button';
  retry.textContent = 'Try Again';
  retry.addEventListener('click', () => loadWelcomeTab(name));
  body.append(message, retry);
}

function loadWelcomeTab(name) {
  const tab = _welcomeTabs[name];
  const body = document.getElementById('welcome-win-body');
  if (!tab || !body) return;
  if (tab.html !== null) {
    body.setAttribute('aria-busy', 'false');
    body.innerHTML = tab.html;
    body.scrollTop = 0;
    return;
  }
  if (tab.promise) {
    showWelcomeStatus(body, tab.message || 'Loading…');
    return;
  }

  tab.message = 'Loading welcome content…';
  showWelcomeStatus(body, tab.message);
  const updateRetryMessage = ({ attempt, maxRetries, delayMs }) => {
    tab.message = `Connection issue. Retrying ${attempt} of ${maxRetries} in ${(delayMs / 1000).toFixed(1)}s…`;
    if (_welcomeActiveTab === name) showWelcomeStatus(body, tab.message);
  };
  tab.promise = Promise.all([
    retryWithBackoff(async () => {
      const response = await fetch(tab.url, { cache: 'no-cache' });
      if (!response.ok) throw responseLoadError(response, 'welcome content');
      return response.text();
    }, { onRetry: updateRetryMessage }),
    retryWithBackoff(() => import('./shared/markdown.js'), { onRetry: updateRetryMessage }),
  ]).then(([text, { renderMarkdown }]) => {
    tab.html = renderMarkdown(text);
    tab.message = '';
    if (_welcomeActiveTab === name) {
      body.setAttribute('aria-busy', 'false');
      body.innerHTML = tab.html;
      body.scrollTop = 0;
    }
  }).catch(error => {
    tab.message = '';
    console.error(`Could not load welcome tab "${name}".`, error);
    if (_welcomeActiveTab === name) showWelcomeFailure(body, name);
  }).finally(() => {
    tab.promise = null;
  });
}

function _selectWelcomeTab(name) {
  _welcomeActiveTab = name;
  document.querySelectorAll('#welcome-tabs .welcome-tab').forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.classList.toggle('active', active);
  });

  const body = document.getElementById('welcome-win-body');
  if (!body) return;

  const tab = _welcomeTabs[name];
  if (!tab) return;

  if (tab.html !== null) {
    body.setAttribute('aria-busy', 'false');
    body.innerHTML = tab.html;
    body.scrollTop = 0;
    return;
  }

  loadWelcomeTab(name);
}

function openWelcomeWindow() {
  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;
  overlay.removeAttribute('hidden');
  overlay.removeAttribute('aria-hidden');
  _selectWelcomeTab(_welcomeActiveTab);
}

function closeWelcomeWindow() {
  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;
  overlay.setAttribute('hidden', '');
  overlay.setAttribute('aria-hidden', 'true');
}

// ── Empty state ───────────────────────────────────────────────
function populateEmptyState() {
  emptyState.innerHTML = '';
}

// ── Launcher flash + tooltip after "Get started" ──────────────
function _flashLauncher() {
  // Pulse the app-menu-btn
  appMenuBtn.classList.remove('pulse-hint');
  void appMenuBtn.offsetWidth;
  appMenuBtn.classList.add('pulse-hint');
  setTimeout(() => appMenuBtn.classList.remove('pulse-hint'), 3100);

  // Tooltip bubble
  document.getElementById('launcher-tooltip')?.remove();
  const tip = document.createElement('div');
  tip.id = 'launcher-tooltip';
  tip.innerHTML =
    `<button id="launcher-tooltip-close" aria-label="Dismiss">\u00d7</button>` +
    `<p>Open apps and browse your content from here.</p>` +
    `<a href="#" id="launcher-guide-link">View keyboard shortcuts \u2192</a>`;
  document.body.appendChild(tip);

  tip.querySelector('#launcher-tooltip-close').addEventListener('click', () => tip.remove());
  tip.querySelector('#launcher-guide-link').addEventListener('click', e => {
    e.preventDefault();
    tip.remove();
    openHelp();
  });

  const timer = setTimeout(() => tip.remove(), 6000);
  setTimeout(() => {
    const dismiss = e => {
      if (!tip.isConnected) return document.removeEventListener('click', dismiss, true);
      if (!tip.contains(e.target) && e.target !== appMenuBtn) {
        tip.remove();
        clearTimeout(timer);
        document.removeEventListener('click', dismiss, true);
      }
    };
    document.addEventListener('click', dismiss, true);
  }, 80);
}

// ── Welcome window wiring ─────────────────────────────────────
document.getElementById('welcome-win-close')?.addEventListener('click', () => {
  closeWelcomeWindow();
  _flashLauncher();
});
document.getElementById('welcome-overlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeWelcomeWindow();
});
document.getElementById('welcome-tabs')?.addEventListener('click', e => {
  const btn = e.target.closest('.welcome-tab');
  if (btn?.dataset.tab) _selectWelcomeTab(btn.dataset.tab);
});

// ── Init ──────────────────────────────────────────────────────
populateEmptyState();
restoreSession();
openWelcomeWindow();   // show on every visit / refresh
updateTopBar();
updateEmptyState();
updateStripLayout();
scheduleAppAssetPrefetch();
