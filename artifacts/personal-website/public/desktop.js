'use strict';

import { S }               from './desktop-state.js';
import { retryWithBackoff, responseLoadError } from './shared/retry.js';
import { APP_LAUNCHERS, APP_REGISTRY } from './apps/app-registry.js';
import {
  readJSON, readRaw, readRawResult, removeData, writeJSON, writeRaw,
} from './data-handler.js';
import { createWindowController, SESSION_KEY, SESSION_KEY_V1 } from './window-controller.js';
import { createWindowShortcutRouter } from './window-shortcut-router.js';

// ── DOM refs ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const appMenuBtn       = $('app-menu-btn');
const appMenu          = $('app-menu');
const helpOverlay      = $('help-overlay');
const appMenuHelpBtn   = $('app-menu-help-btn');
const openAppsBar      = $('open-apps-bar');
const activeTitle      = $('active-title');
const closeBtn         = $('close-btn');
const overviewBtn      = $('overview-btn');
const winMenuBtn       = $('win-menu-btn');
const systemTimeBtn    = $('system-time-btn');
const systemPanel      = $('system-panel');
const notificationsBtn = $('notifications-btn');
const notificationPanel = $('notification-panel');
const appStrip         = $('app-strip');
const appStripWrapper  = $('app-strip-wrapper');
const emptyState       = $('empty-state');
const desktopWidgets   = $('desktop-widgets');
const showDesktopBtn   = $('show-desktop-btn');
let notificationCenter = null;
let notificationCenterPromise = null;
let notificationModuleAttempt = 0;
let pendingDataNotificationEvents = [];
let welcomeReminderDismissPending = false;

function loadNotificationCenter() {
  if (notificationCenter) return Promise.resolve(notificationCenter);
  if (!notificationCenterPromise) {
    notificationCenterPromise = retryWithBackoff(() => {
      const moduleUrl = new URL('./shared/notification-center.js', import.meta.url);
      if (notificationModuleAttempt > 0) moduleUrl.searchParams.set('retry', `notifications-${notificationModuleAttempt}`);
      notificationModuleAttempt += 1;
      return import(/* @vite-ignore */ moduleUrl.href).then(({ createNotificationCenter }) => {
        notificationCenter = createNotificationCenter({
          button: notificationsBtn,
          panel: notificationPanel,
          list: $('notification-list'),
          emptyState: $('notification-panel-empty'),
          clearButton: $('notification-clear-btn'),
          status: $('notification-panel-status'),
          toastContainer: $('in-app-notifications'),
          closeOtherPanels: () => {
            closeSystemPanel();
            closeAppMenu();
            closeHelp();
          },
          onAction: action => {
            if (action === 'open-welcome') openWelcomeWindow();
          },
        });
        if (welcomeReminderDismissPending) notificationCenter.dismissWelcomeReminder();
        const queuedEvents = pendingDataNotificationEvents;
        pendingDataNotificationEvents = [];
        for (const { type, detail } of queuedEvents) notificationCenter.handleDataEvent(type, detail);
        return notificationCenter;
      });
    }, { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 1200 }).catch(error => {
      notificationCenterPromise = null;
      notificationsBtn.setAttribute('aria-label', 'Notifications unavailable. Select to retry.');
      console.error('Could not load notifications.', error);
      throw error;
    });
  }
  return notificationCenterPromise;
}

function forwardDataNotificationEvent(event) {
  if (notificationCenter) {
    notificationCenter.handleDataEvent(event.type, event.detail);
    return;
  }
  pendingDataNotificationEvents.push({ type: event.type, detail: event.detail });
  void loadNotificationCenter().catch(() => {});
}

[
  'desktop-data-error',
  'desktop-data-recovery-available',
  'desktop-data-recovery-restored',
  'desktop-data-recovery-saved',
  'desktop-data-recovery-error',
  'desktop-data-recovery-cleared',
].forEach(type => window.addEventListener(type, forwardDataNotificationEvent));
window.requestAnimationFrame(() => {
  void loadNotificationCenter().catch(() => {});
});

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
const ACCENT_COLOR_KEY = 'desktop-accent-color';
const ACCENT_COLORS = ['blue', 'teal', 'green', 'gold', 'coral', 'purple'];
const WINDOW_TINTS_KEY = 'desktop-window-tints-v3';
const LEGACY_WINDOW_TINT_KEYS = ['desktop-window-tints-v2', 'desktop-window-tints-v1'];
const WINDOW_TINT_COLORS = ACCENT_COLORS;
const WINDOW_TINT_HUES = Object.freeze({
  blue: 240.76,
  teal: 190,
  green: 145,
  gold: 85,
  coral: 25,
  purple: 300,
});
const TOPBAR_TINT_MODES = ['matching-window', 'reverse-window', 'dark', 'light', 'custom-dark', 'custom-light'];
const DEFAULT_WINDOW_TINTS = Object.freeze({
  darkTint: 'blue',
  darkLightness: 25,
  lightTint: 'none',
  lightLightness: 100,
  backgroundOpacity: 92,
  topbar: {
    mode: 'matching-window',
    backgroundOpacity: null,
    darkBackground: { tint: 'blue', lightness: 25 },
    darkForeground: { tint: 'none', lightness: 100 },
    lightBackground: { tint: 'none', lightness: 100 },
    lightForeground: { tint: 'blue', lightness: 25 },
  },
});
const TIME_KEY    = 'desktop-time-24h';
const WINDOW_ANIMATION_KEY = 'desktop-window-animation';
const ANIMATION_PREFERENCES_KEY = 'desktop-animation-preferences-v1';
const WINDOW_ANIMATION_EFFECTS = ['fade', 'zoom', 'slide-up', 'slide-left', 'flip'];
const SHOW_DESKTOP_ANIMATION_EFFECTS = ['fade', 'zoom', 'slide-up', 'tilt-up', 'flip'];
const OVERVIEW_ANIMATION_EFFECTS = ['fade', 'zoom', 'slide-up', 'rubber-band'];
const ANIMATION_EVENT_EFFECTS = {
  windowOpen: WINDOW_ANIMATION_EFFECTS,
  windowClose: WINDOW_ANIMATION_EFFECTS,
  showDesktop: SHOW_DESKTOP_ANIMATION_EFFECTS,
  overview: OVERVIEW_ANIMATION_EFFECTS,
};
const REMINDER_KEY = 'desktop-reminders';
const REMINDER_BACKGROUND_KEY = 'desktop-reminder-background';
const WELCOME_SHOW_ON_STARTUP_KEY = 'desktop-welcome-show-on-startup';
const welcomeStartupToggle = $('welcome-show-on-startup');
let calendarDate  = new Date();
let selectedCalendarDate = new Date();
let use24HourTime = readRaw(TIME_KEY) === 'true';
let welcomeShowOnStartup = readRaw(WELCOME_SHOW_ON_STARTUP_KEY) !== 'false';
let reminders = [];
const reminderNotificationTimers = new Map();
let systemNotificationsEnabled = readRaw(REMINDER_BACKGROUND_KEY) === 'true';
const storedReminders = readJSON(REMINDER_KEY, [], { validate: Array.isArray });
if (Array.isArray(storedReminders)) reminders = storedReminders;
welcomeStartupToggle.checked = welcomeShowOnStartup;
welcomeStartupToggle.addEventListener('change', () => {
  welcomeShowOnStartup = welcomeStartupToggle.checked;
  writeRaw(WELCOME_SHOW_ON_STARTUP_KEY, String(welcomeShowOnStartup));
  if (welcomeShowOnStartup) {
    welcomeReminderDismissPending = true;
    notificationCenter?.dismissWelcomeReminder();
  }
});

notificationsBtn.addEventListener('click', event => {
  if (notificationCenter) return;
  event.preventDefault();
  void loadNotificationCenter().then(center => center.open()).catch(() => {});
});

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
  applyTopbarTintAttributes(readWindowTints());
  themeToggle.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
  themeSplit.classList.toggle('has-override', hasOverride);
  themeReset.setAttribute('aria-hidden', String(!hasOverride));
  themeReset.tabIndex = hasOverride ? 0 : -1;
  notifyDesktopSettingsChanged();
}

function applyAccentColor(color = readRaw(ACCENT_COLOR_KEY), { persist = true } = {}) {
  const selected = ACCENT_COLORS.includes(color) ? color : 'blue';
  if (persist) {
    const saved = selected === 'blue'
      ? removeData(ACCENT_COLOR_KEY)
      : writeRaw(ACCENT_COLOR_KEY, selected);
    if (!saved) throw new Error('The accent color could not be saved in browser storage.');
  }
  if (selected === 'blue') delete document.documentElement.dataset.accentColor;
  else document.documentElement.dataset.accentColor = selected;
  notifyDesktopSettingsChanged();
}

function normalizeWindowTints(value = {}) {
  const darkTint = value?.darkTint === 'none' || WINDOW_TINT_COLORS.includes(value?.darkTint)
    ? value.darkTint
    : DEFAULT_WINDOW_TINTS.darkTint;
  const lightTint = value?.lightTint === 'none' || WINDOW_TINT_COLORS.includes(value?.lightTint)
    ? value.lightTint
    : DEFAULT_WINDOW_TINTS.lightTint;
  const darkMinimum = darkTint === 'none' ? 0 : 5;
  const savedDarkLightness = value?.darkLightness ?? DEFAULT_WINDOW_TINTS.darkLightness;
  const darkLightness = Number.isFinite(Number(savedDarkLightness))
    ? Math.max(darkMinimum, Math.min(25, Math.round(Number(savedDarkLightness))))
    : DEFAULT_WINDOW_TINTS.darkLightness;
  const lightMaximum = lightTint === 'none' ? 100 : 95;
  const savedLightLightness = value?.lightLightness ?? value?.lightness ?? DEFAULT_WINDOW_TINTS.lightLightness;
  const lightLightness = Number.isFinite(Number(savedLightLightness))
    ? Math.max(75, Math.min(lightMaximum, Math.round(Number(savedLightLightness))))
    : DEFAULT_WINDOW_TINTS.lightLightness;
  const savedBackgroundOpacity = value?.backgroundOpacity ?? DEFAULT_WINDOW_TINTS.backgroundOpacity;
  const backgroundOpacity = Number.isFinite(Number(savedBackgroundOpacity))
    ? Math.max(0, Math.min(100, Math.round(Number(savedBackgroundOpacity))))
    : DEFAULT_WINDOW_TINTS.backgroundOpacity;
  const normalizeTopbarTint = (saved, fallback, appearance) => {
    const tint = saved?.tint === 'none' || WINDOW_TINT_COLORS.includes(saved?.tint)
      ? saved.tint
      : fallback.tint;
    const min = appearance === 'dark' ? (tint === 'none' ? 0 : 5) : 75;
    const max = appearance === 'dark' ? 25 : (tint === 'none' ? 100 : 95);
    const lightness = Number.isFinite(Number(saved?.lightness))
      ? Math.max(min, Math.min(max, Math.round(Number(saved.lightness))))
      : fallback.lightness;
    return { tint, lightness };
  };
  const topbarValue = value?.topbar || {};
  const topbarMode = TOPBAR_TINT_MODES.includes(topbarValue.mode)
    ? topbarValue.mode
    : DEFAULT_WINDOW_TINTS.topbar.mode;
  const savedTopbarOpacity = topbarValue.backgroundOpacity;
  const topbarBackgroundOpacity = savedTopbarOpacity !== null && savedTopbarOpacity !== undefined
    && Number.isFinite(Number(savedTopbarOpacity))
    ? Math.max(0, Math.min(100, Math.round(Number(savedTopbarOpacity))))
    : null;
  return {
    darkTint,
    darkLightness,
    lightTint,
    lightLightness,
    backgroundOpacity,
    topbar: {
      mode: topbarMode,
      backgroundOpacity: topbarBackgroundOpacity,
      darkBackground: normalizeTopbarTint(
        topbarValue.darkBackground,
        DEFAULT_WINDOW_TINTS.topbar.darkBackground,
        'dark',
      ),
      darkForeground: normalizeTopbarTint(
        topbarValue.darkForeground,
        DEFAULT_WINDOW_TINTS.topbar.darkForeground,
        'light',
      ),
      lightBackground: normalizeTopbarTint(
        topbarValue.lightBackground,
        DEFAULT_WINDOW_TINTS.topbar.lightBackground,
        'light',
      ),
      lightForeground: normalizeTopbarTint(
        topbarValue.lightForeground,
        DEFAULT_WINDOW_TINTS.topbar.lightForeground,
        'dark',
      ),
    },
  };
}

function readSavedWindowTints() {
  const validate = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const saved = readJSON(WINDOW_TINTS_KEY, null, { validate });
  if (saved) return normalizeWindowTints(saved);

  let legacy = null;
  for (const key of LEGACY_WINDOW_TINT_KEYS) {
    legacy = readJSON(key, null, { validate });
    if (legacy) break;
  }
  if (!legacy) return null;
  return normalizeWindowTints({
    ...legacy,
    // The older None option was always pure white; its stored slider value only applied to colored tints.
    lightLightness: legacy.lightTint === 'none' ? 100 : (legacy.lightLightness ?? legacy.lightness),
  });
}

function readWindowTints() {
  return readSavedWindowTints() || DEFAULT_WINDOW_TINTS;
}

function applyWindowTintAttributes(value) {
  const tints = normalizeWindowTints(value);
  const root = document.documentElement;
  root.dataset.windowTints = 'custom';
  root.dataset.windowDarkTint = tints.darkTint;
  root.dataset.windowLightTint = tints.lightTint;
  root.style.setProperty('--window-dark-lightness', `${tints.darkLightness}%`);
  root.style.setProperty('--window-lightness', `${tints.lightLightness}%`);
  root.style.setProperty('--window-background-opacity', `${tints.backgroundOpacity}%`);
  applyTopbarTintAttributes(tints);
}

function topbarTintColor({ tint, lightness }, appearance) {
  if (tint === 'none') return `oklch(${lightness}% 0 0)`;
  const chroma = appearance === 'dark' ? '0.0645' : '0.0622';
  return `oklch(${lightness}% ${chroma} ${WINDOW_TINT_HUES[tint]})`;
}

function applyTopbarTintAttributes(value) {
  const root = document.documentElement;
  const tints = normalizeWindowTints(value);
  const mode = tints.topbar.mode;
  const theme = effectiveTheme();
  let resolvedTheme = theme;
  if (mode === 'reverse-window') resolvedTheme = theme === 'dark' ? 'light' : 'dark';
  else if (mode === 'dark' || mode === 'light') resolvedTheme = mode;
  else if (mode === 'custom-dark' || mode === 'custom-light') resolvedTheme = mode;
  root.dataset.topbarTheme = resolvedTheme;
  const defaultOpacity = resolvedTheme === 'dark' || resolvedTheme === 'custom-dark' ? 78 : 82;
  root.style.setProperty(
    '--topbar-background-opacity',
    `${tints.topbar.backgroundOpacity ?? defaultOpacity}%`,
  );

  if (mode === 'custom-dark') {
    root.style.setProperty('--topbar-custom-background', topbarTintColor(tints.topbar.darkBackground, 'dark'));
    root.style.setProperty('--topbar-custom-foreground', topbarTintColor(tints.topbar.darkForeground, 'light'));
  } else if (mode === 'custom-light') {
    root.style.setProperty('--topbar-custom-background', topbarTintColor(tints.topbar.lightBackground, 'light'));
    root.style.setProperty('--topbar-custom-foreground', topbarTintColor(tints.topbar.lightForeground, 'dark'));
  } else {
    root.style.removeProperty('--topbar-custom-background');
    root.style.removeProperty('--topbar-custom-foreground');
  }
}

function setWindowTints(value) {
  const tints = normalizeWindowTints(value);
  if (!writeJSON(WINDOW_TINTS_KEY, tints)) {
    throw new Error('The window tint settings could not be saved in browser storage.');
  }
  applyWindowTintAttributes(tints);
  notifyDesktopSettingsChanged();
  return tints;
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

function publishReminderNotification(reminder) {
  const id = `reminder:${reminder.id}`;
  const message = String(reminder.text || 'A reminder is due.');
  void loadNotificationCenter().then(center => {
    const added = center.add({ id, type: 'reminder', title: 'Reminder', message });
    if (added) center.showToast({ id: `toast:${id}`, title: 'Reminder', message, icon: '⏰', role: 'alert' });
  }).catch(() => {});
}

function scheduleReminderNotification(reminder) {
  clearReminderNotification(reminder.id);
  const delay = new Date(reminder.dueAt || reminder.when).getTime() - Date.now();
  if (!Number.isFinite(delay)) return;
  if (delay <= 0) {
    publishReminderNotification(reminder);
    return;
  }
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
      }
    } catch (error) {
      console.warn('[reminders] Local notification failed.', error);
    }
    publishReminderNotification(reminder);
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
applyAccentColor(readRaw(ACCENT_COLOR_KEY), { persist: false });
const storedWindowTints = readSavedWindowTints();
applyWindowTintAttributes(storedWindowTints || DEFAULT_WINDOW_TINTS);
updateClock();
renderReminders();
updateNotificationSetting();
reminders.forEach(scheduleReminderNotification);
removeLegacyBackgroundNotifications().catch(error => {
  console.warn('[reminders] Could not remove the legacy background notification worker.', error);
});
setInterval(updateClock, 30000);

// ── Session persistence ────────────────────────────────────────
function safeRemoveSession() {
  removeData(SESSION_KEY);
  removeData(SESSION_KEY_V1);
}

function saveSession() {
  return windowController.saveSession();
}

// ── Context-aware title ────────────────────────────────────────
function setAppTitle(id, title) {
  S.appTitles[id] = title;
  const app = S.apps.find(candidate => candidate.id === id);
  app?.el.setAttribute('aria-label', title);
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

function getAppColumn(appId) {
  return windowController.getAppColumn(appId);
}

function getAppOrder() {
  return windowController.getAppOrder();
}

const loadedAppModules = new Map();
const loadedAppStyles = new Map();
const prefetchedAppModules = new Set();
let nextAppModuleLoadId = 0;

function loadAppModule(def, onRetry) {
  let loading = loadedAppModules.get(def.modulePath);
  if (!loading) {
    const loadId = ++nextAppModuleLoadId;
    let attempt = 0;
    loading = retryWithBackoff(() => def.loadModule(attempt++, loadId), { onRetry })
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
  if (loading) return loading;

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
  return loading;
}

function ensureAppStyles(styles = [], onRetry) {
  return Promise.all(styles.map(path => retryWithBackoff(
    () => loadAppStylesheet(path),
    { onRetry },
  )));
}

function canPrefetchAppResources() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return false;
  if (Number.isFinite(connection?.downlink) && connection.downlink > 0 && connection.downlink < 1) return false;
  if (Number.isFinite(connection?.rtt) && connection.rtt > 1200) return false;
  return true;
}

function prefetchAppResources(type) {
  if (!canPrefetchAppResources()) return;
  const descriptor = APP_REGISTRY[type];
  if (!descriptor) return;

  const moduleUrl = new URL(descriptor.modulePath, import.meta.url).href;
  if (!loadedAppModules.has(descriptor.modulePath) && !prefetchedAppModules.has(moduleUrl)) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = moduleUrl;
    link.fetchPriority = 'low';
    link.dataset.appModulePrefetch = type;
    prefetchedAppModules.add(moduleUrl);
    document.head.append(link);
  }
}

function bindAppIntentPrefetch(button, type) {
  let pointerIntent = false;
  let focusIntent = false;
  let timer = 0;
  const cancel = () => {
    if (timer && !pointerIntent && !focusIntent) {
      clearTimeout(timer);
      timer = 0;
    }
  };
  const schedule = () => {
    if (timer || !canPrefetchAppResources()) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (pointerIntent || focusIntent) prefetchAppResources(type);
    }, 140);
  };

  button.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    pointerIntent = true;
    schedule();
  });
  button.addEventListener('pointerleave', () => {
    pointerIntent = false;
    cancel();
  });
  button.addEventListener('focus', () => {
    focusIntent = true;
    schedule();
  });
  button.addEventListener('blur', () => {
    focusIntent = false;
    cancel();
  });
}

function createAppLoadSurface(title, mode = 'loading') {
  const root = document.createElement('dialog');
  root.className = 'utility-app app-window app-load-state';
  root.open = true;
  root.tabIndex = -1;
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-label', title);
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

function disposeAppApi(type, id) {
  const disposeMethod = APP_REGISTRY[type]?.state?.disposeMethod;
  if (disposeMethod) S.appApis[id]?.[disposeMethod]?.();
  delete S.appApis[id];
}

function flushPendingAppActions(record) {
  const actions = record.pendingActions || [];
  record.pendingActions = [];
  for (const { method, args } of actions) {
    const action = S.appApis[record.id]?.[method];
    if (typeof action === 'function') action(...args);
  }
}

function replaceAppWindow(record, next, { focus = false } = {}) {
  const previous = record.el;
  const shouldRestoreFocus = focus || previous.contains(document.activeElement);
  previous.replaceWith(next);
  record.el = next;
  if (shouldRestoreFocus) next.focus({ preventScroll: true });
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
      disposeAppApi(record.type, record.id);
      return;
    }
    if (!(appEl instanceof HTMLElement)) {
      throw new TypeError(`The ${def.title} app did not return an element.`);
    }

    const windowEl = document.createElement('dialog');
    windowEl.className = 'app-window';
    windowEl.open = true;
    windowEl.tabIndex = -1;
    windowEl.setAttribute('aria-modal', 'false');
    windowEl.setAttribute('aria-label', S.appTitles[record.id] || def.title);
    windowEl.dataset.id = record.id;
    windowEl.dataset.type = record.type;
    appEl.classList.remove('app-window');
    windowEl.append(appEl);
    transferWindowAnimation(record.el, windowEl);
    windowEl.classList.toggle('focused', S.focusedId === record.id);
    windowEl.setAttribute('aria-current', String(S.focusedId === record.id));
    replaceAppWindow(record, windowEl);
    flushPendingAppActions(record);
    updateStripLayout();
    if (document.body.classList.contains('mod-overview')) positionOverview();
  } catch (error) {
    if (!isCurrent()) return;
    console.error(`Could not load ${def.title}.`, error);
    disposeAppApi(record.type, record.id);
    const failed = createAppLoadSurface(def.title, 'error');
    failed.dataset.id = record.id;
    failed.dataset.type = record.type;
    transferWindowAnimation(record.el, failed);
    failed.classList.toggle('focused', S.focusedId === record.id);
    failed.setAttribute('aria-current', String(S.focusedId === record.id));
    const retry = failed.querySelector('.app-load-retry');
    retry.addEventListener('click', () => {
      const loading = createAppLoadSurface(def.title);
      loading.dataset.id = record.id;
      loading.dataset.type = record.type;
      transferWindowAnimation(record.el, loading);
      loading.classList.toggle('focused', S.focusedId === record.id);
      loading.setAttribute('aria-current', String(S.focusedId === record.id));
      replaceAppWindow(record, loading, { focus: true });
      void hydrateApp(record, def, initialState);
    });
    replaceAppWindow(record, failed);
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
  windowController.addApp(record, insertIntoColId);
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
  if (!S.apps.some(app => app.id === id)) return;
  const record = S.apps.find(app => app.id === id);
  if (record) disposeAppApi(record.type, id);
  delete S.appTitles[id];
  windowController.removeApp(id);
}

function focusApp(id) {
  return windowController.focusApp(id);
}

function scrollToApp(id) {
  return windowController.scrollToApp(id);
}

// ── Width presets ─────────────────────────────────────────────
function setFocusedWidth(preset) {
  return windowController.setFocusedWidth(preset);
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
    btn.setAttribute('aria-current', String(id === S.focusedId));
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

const windowController = createWindowController({
  state: S,
  appDefinitions: APP_REGISTRY,
  document,
  window,
  appStrip,
  widthPresets: WIDTH_PRESETS,
  createColumnElement: createColEl,
  wireColumnEvents: wireColEvents,
  persistSession: snapshot => writeJSON(SESSION_KEY, snapshot, {
    validate: value => value?.v === 2 && Array.isArray(value.columns),
  }),
  updateTopBar,
  updateEmptyState,
  updateStripLayout,
  setShowDesktop,
  positionOverview,
});

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

requestAnimationFrame(() => {
  void import('./apps/sticky-notes/desktop-loader.js')
    .then(({ initializePinnedNotes }) => initializePinnedNotes(updateDesktopNotes))
    .catch(() => {
      $('desktop-widget-load-error-text').textContent = 'Pinned desktop notes could not start. Reload the page to try again.';
      $('desktop-widget-load-status').hidden = false;
      $('desktop-widget-retry').disabled = true;
    });
});

// ── App navigation ────────────────────────────────────────────
function focusNextApp() {
  return windowController.focusNextApp();
}

function focusPrevApp() {
  return windowController.focusPrevApp();
}

// ── App menu ──────────────────────────────────────────────────
function openAppMenu(showGames = false) {
  appMenu.removeAttribute('hidden');
  appMenuBtn.setAttribute('aria-expanded', 'true');
  closeHelp();
  if (showGames) {
    if (gameMenu) gameMenu.showGames(false);
    else {
      void loadGameMenu().then(menu => {
        if (appMenu.hidden) return;
        menu.showGames(false);
        $('#game-menu-back')?.focus();
      }).catch(showGameMenuLoadError);
    }
  } else {
    gameMenu?.showRoot(false);
  }
  if (!showGames) populateLauncherFiles();
  requestAnimationFrame(() => {
    const f = appMenu.querySelector(showGames && gameMenu
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

let gameMenu = null;
let gameMenuPromise = null;
const gameMenuOptions = {
  menu: appMenu,
  openGame: type => {
    openApp(type);
    closeAppMenu();
  },
  bindIntentPrefetch: bindAppIntentPrefetch,
};

function loadGameMenu() {
  if (gameMenu) return Promise.resolve(gameMenu);
  if (!gameMenuPromise) {
    gameMenuPromise = import('./apps/games/menu-loader.js')
      .then(({ ensureGameMenu }) => ensureGameMenu(gameMenuOptions))
      .then(menu => {
      gameMenu = menu;
      $('game-menu-load-status').hidden = true;
      return gameMenu;
    }).catch(error => {
      gameMenuPromise = null;
      throw error;
    });
  }
  return gameMenuPromise;
}

function showGameMenuLoadError() {
  const status = $('game-menu-load-status');
  if (!status || appMenu.hidden) return;
  status.textContent = 'Game Center could not load. Select Game Center to retry.';
  status.hidden = false;
}

requestAnimationFrame(() => {
  if (!canPrefetchAppResources()) return;
  void import('./apps/games/menu-loader.js')
    .then(({ prefetchGameMenu }) => prefetchGameMenu(gameMenuOptions, canPrefetchAppResources))
    .catch(() => {});
});

// ── Help overlay ──────────────────────────────────────────────
let helpController = null;
let helpControllerPromise = null;

function loadHelpController() {
  if (helpController) return Promise.resolve(helpController);
  if (!helpControllerPromise) {
    let attempt = 0;
    helpControllerPromise = retryWithBackoff(() => {
      const moduleUrl = new URL('./shared/desktop-help.js', import.meta.url);
      if (attempt > 0) moduleUrl.searchParams.set('retry', `help-${attempt}`);
      attempt += 1;
      return import(/* @vite-ignore */ moduleUrl.href).then(({ createDesktopHelpController }) => {
        helpController = createDesktopHelpController({
          helpOverlay,
          helpCloseButton: $('help-close-btn'),
          helpOpenLauncherButton: $('help-open-launcher'),
          closeAppMenu,
          openAppMenu,
        });
        return helpController;
      });
    }).catch(error => {
      helpControllerPromise = null;
      throw error;
    });
  }
  return helpControllerPromise;
}

function openHelp() {
  return loadHelpController()
    .then(controller => controller.open())
    .catch(error => {
      console.error('Could not load the help panel.', error);
      helpOverlay.setAttribute('hidden', '');
    });
}
function closeHelp() {
  if (helpController) helpController.close();
  else helpOverlay.setAttribute('hidden', '');
}
function toggleHelp() {
  if (helpOverlay.hasAttribute('hidden')) return openHelp();
  closeHelp();
}

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
const _launcherForceFetching = {};
const LAUNCHER_MANIFEST_FOLDERS = ['posts', 'documents', 'pictures', 'videos'];
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
const launcherFileLoadStatus = $('launcher-file-load-status');
const launcherFileLoadError = $('launcher-file-load-error');
const launcherFileLoadErrorText = $('launcher-file-load-error-text');
const launcherFileRetryButton = $('launcher-file-retry');
const launcherLinksStatus = $('launcher-links-status');
const launcherLinksStatusText = $('launcher-links-status-text');
const launcherLinksRetryButton = $('launcher-links-retry');
const launcherLinksList = $('launcher-links-list');
const docFilesHeading = $('doc-files-heading');
const picFilesHeading = $('pic-files-heading');
const videoFilesHeading = $('video-files-heading');
const docFilesEmpty = $('doc-files-empty');
const picFilesEmpty = $('pic-files-empty');
const videoFilesEmpty = $('video-files-empty');
const launcherTabButtons = [...document.querySelectorAll('[data-launcher-tab]')];
const launcherTabPanels = [...document.querySelectorAll('[data-launcher-panel]')];
let activeLauncherTab = 'apps';
let launcherLinks = null;
let launcherLinksPromise = null;
let launcherSearchAnnouncementTimer;
let launcherSearchRestoreFocus = null;

function selectLauncherTab(category, { focus = false } = {}) {
  if (!launcherTabButtons.some(button => button.dataset.launcherTab === category)) return;
  activeLauncherTab = category;
  launcherTabButtons.forEach(button => {
    const selected = button.dataset.launcherTab === category;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus({ preventScroll: true });
  });
  launcherTabPanels.forEach(panel => {
    panel.hidden = panel.dataset.launcherPanel !== category;
  });
  if (typeof updateLauncherFileSearch === 'function') updateLauncherFileSearch();
}

const launcherTabOrder = ['apps', 'documents', 'pictures', 'videos'];
const launcherTabs = $('launcher-tabs');
launcherTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-launcher-tab]');
  if (button) selectLauncherTab(button.dataset.launcherTab);
});
launcherTabs.addEventListener('keydown', event => {
  const current = event.target.closest('[data-launcher-tab]');
  if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = launcherTabOrder.indexOf(current.dataset.launcherTab);
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? launcherTabOrder.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + launcherTabOrder.length) % launcherTabOrder.length;
  selectLauncherTab(launcherTabOrder[nextIndex], { focus: true });
});

function parseLauncherLinks(markdown) {
  const links = [];
  let group = 'Links';
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      group = heading[1].trim();
      continue;
    }
    const match = line.match(/^\s*[-*]\s+\[([^\]]{1,160})\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/);
    if (!match) continue;
    let url;
    try { url = new URL(match[2], location.href); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    links.push({
      id: `link:${url.href}`,
      title: match[1].trim(),
      url: url.href,
      group,
    });
  }
  return links;
}

function renderLauncherLinks() {
  launcherLinksList.replaceChildren();
  if (launcherLinks === null) return;
  const groups = new Map();
  for (const link of launcherLinks) {
    if (!groups.has(link.group)) groups.set(link.group, []);
    groups.get(link.group).push(link);
  }
  for (const [groupName, links] of groups) {
    const section = document.createElement('section');
    section.className = 'launcher-link-group';
    section.dataset.linkGroup = groupName.toLocaleLowerCase();
    const heading = document.createElement('h3');
    heading.className = 'launcher-link-group-heading';
    heading.textContent = groupName;
    const list = document.createElement('ul');
    list.className = 'launcher-link-group-list';
    for (const link of links) {
      const item = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.className = 'launcher-link';
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = link.title;
      anchor.title = link.title;
      anchor.dataset.searchText = `${link.title} ${groupName} ${link.url}`.toLocaleLowerCase();
      item.append(anchor);
      list.append(item);
    }
    section.append(heading, list);
    launcherLinksList.append(section);
  }
  updateLauncherFileSearch({ autoSelect: true });
}

function setLauncherLinksStatus(message = '', { retry = false } = {}) {
  launcherLinksStatus.hidden = !message;
  launcherLinksStatusText.textContent = message;
  launcherLinksRetryButton.hidden = !retry;
}

function ensureLauncherLinks({ force = false } = {}) {
  if (launcherLinks !== null && !force) return Promise.resolve(launcherLinks);
  if (launcherLinksPromise && !force) return launcherLinksPromise;
  launcherLinksPromise = (async () => {
    setLauncherLinksStatus('Loading links…');
    try {
      await ensureLauncherManifest('posts', { background: true });
      const sourceFile = (_launcherCache.posts || []).find(file =>
        file.filename === '20240201_My_Sites.md'
        || file.displayName.toLocaleLowerCase() === 'my sites');
      const sourceUrl = sourceFile?.url
        ? (sourceFile.url.startsWith('/') ? sourceFile.url : `/files/${sourceFile.url.replace(/^\/+/, '')}`)
        : '/files/posts/20240201_My_Sites.md';
      let attempt = 0;
      const markdown = await retryWithBackoff(async () => {
        const requestUrl = new URL(sourceUrl, location.href);
        if (attempt > 0) requestUrl.searchParams.set('retry', `launcher-links-${attempt}`);
        attempt += 1;
        const response = await fetch(requestUrl.href, { cache: 'no-cache' });
        if (!response.ok) throw responseLoadError(response, 'launcher links');
        return response.text();
      }, { maxRetries: 2, initialDelayMs: 250, maxDelayMs: 900 });
      launcherLinks = parseLauncherLinks(markdown);
      setLauncherLinksStatus(launcherLinks.length ? '' : 'No links are available.');
    } catch (error) {
      launcherLinks = [];
      setLauncherLinksStatus('Couldn’t load links.', { retry: true });
      console.warn('[launcher] Could not load the links list.', error);
    }
    renderLauncherLinks();
    desktopSearchItems = buildDesktopSearchItems();
    if (!desktopSearchSuggestions.hidden) renderDesktopSearchResults();
    return launcherLinks;
  })().finally(() => {
    launcherLinksPromise = null;
  });
  return launcherLinksPromise;
}

launcherLinksRetryButton.addEventListener('click', () => {
  launcherLinksRetryButton.disabled = true;
  launcherLinksRetryButton.setAttribute('aria-busy', 'true');
  void ensureLauncherLinks({ force: true }).finally(() => {
    launcherLinksRetryButton.disabled = false;
    launcherLinksRetryButton.removeAttribute('aria-busy');
  });
});

function parseManifestForLauncher(folder, entries) {
  return entries.map(entry => {
    const { filename, url: manifestUrl, date, size } = entry;
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
      date: typeof date === 'string' ? date : null,
      size: size || '—',
    };
  }).filter(Boolean);
}

function launcherManifestIsStale(folder) {
  const cached = _launcherCache[folder];
  const metadata = _launcherCacheMeta[folder];
  const freshnessMs = metadata?.error
    ? LAUNCHER_MANIFEST_RETRY_MS
    : LAUNCHER_MANIFEST_RECHECK_MS;
  return cached === undefined || Date.now() - (metadata?.checkedAt ?? 0) >= freshnessMs;
}

function getLauncherManifestMeta(folder) {
  const metadata = _launcherCacheMeta[folder];
  return metadata ? { ...metadata } : null;
}

function getLauncherManifestSnapshot(folder) {
  if (!LAUNCHER_MANIFEST_FOLDERS.includes(folder)) return null;
  const entries = _launcherCache[folder];
  const metadata = _launcherCacheMeta[folder];
  if (!Array.isArray(entries) || !metadata) return null;
  return { entries: entries.slice(), metadata: { ...metadata } };
}

function notifyLauncherManifestConsumers(folder) {
  if (!LAUNCHER_MANIFEST_FOLDERS.includes(folder)) return;
  window.dispatchEvent(new CustomEvent('niri:launcher-manifest-updated', {
    detail: { folder },
  }));

  if (!appMenu.hasAttribute('hidden')) renderLauncherFiles();
  else {
    desktopSearchItems = buildDesktopSearchItems();
    desktopSearchItemsReady = LAUNCHER_MANIFEST_FOLDERS.every(name => _launcherCache[name] !== undefined);
  }
  if (!desktopSearchSuggestions.hidden) renderDesktopSearchResults();
}

function startLauncherManifestFetch(folder, { priority = 'auto' } = {}) {
  const cached = _launcherCache[folder];
  const metadata = _launcherCacheMeta[folder];
  const request = (async () => {
    try {
      const headers = metadata?.etag
        ? { 'If-None-Match': metadata.etag }
        : {};
      const manifestUrl = folder === 'wallpapers'
        ? '/files/manifest.json'
        : `/files/${folder}/manifest.json`;
      const options = { headers, cache: 'no-store' };
      if (priority === 'low') options.priority = 'low';
      const response = await fetch(manifestUrl, options);
      if (response.status === 304 && cached !== undefined) {
        _launcherCacheMeta[folder] = {
          etag: response.headers.get('ETag') || metadata?.etag || null,
          checkedAt: Date.now(),
          error: false,
        };
      } else {
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
      }
    } catch {
      if (_launcherCache[folder] === undefined) _launcherCache[folder] = [];
      _launcherCacheMeta[folder] = {
        ..._launcherCacheMeta[folder],
        checkedAt: Date.now(),
        error: true,
      };
    }
    notifyLauncherManifestConsumers(folder);
    return _launcherCache[folder];
  })();
  const trackedRequest = request.finally(() => {
    if (_launcherFetching[folder] === trackedRequest) delete _launcherFetching[folder];
  });
  _launcherFetching[folder] = trackedRequest;
  return trackedRequest;
}

function ensureLauncherManifest(folder, { force = false, background = false, priority = 'auto' } = {}) {
  const cached = _launcherCache[folder];
  if (!force && cached !== undefined && !launcherManifestIsStale(folder)) {
    return Promise.resolve(cached);
  }

  if (background && cached !== undefined) {
    if (!_launcherFetching[folder]) void startLauncherManifestFetch(folder, { priority });
    return Promise.resolve(cached);
  }
  if (_launcherFetching[folder]) {
    if (!force) return _launcherFetching[folder];
    if (!_launcherForceFetching[folder]) {
      const pendingRequest = _launcherFetching[folder];
      const forcedRequest = pendingRequest.then(() => (
        _launcherFetching[folder] || startLauncherManifestFetch(folder, { priority })
      )).finally(() => {
        if (_launcherForceFetching[folder] === forcedRequest) {
          delete _launcherForceFetching[folder];
        }
      });
      _launcherForceFetching[folder] = forcedRequest;
    }
    return _launcherForceFetching[folder];
  }
  return startLauncherManifestFetch(folder, { priority });
}

function canPrefetchLauncherManifests() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (navigator.onLine === false || connection?.saveData) return false;
  if (['slow-2g', '2g'].includes(connection?.effectiveType)) return false;
  if (Number.isFinite(connection?.downlink) && connection.downlink > 0 && connection.downlink < 1) return false;
  if (Number.isFinite(connection?.rtt) && connection.rtt > 1200) return false;
  return true;
}

let launcherManifestPrefetchScheduled = false;
function scheduleLauncherManifestPrefetch() {
  if (launcherManifestPrefetchScheduled || !canPrefetchLauncherManifests()) return;
  launcherManifestPrefetchScheduled = true;
  let nextIndex = 0;
  let active = 0;
  let idleScheduled = false;
  const folders = [...LAUNCHER_MANIFEST_FOLDERS];

  const pump = () => {
    if (!canPrefetchLauncherManifests()) {
      launcherManifestPrefetchScheduled = false;
      return;
    }
    while (active < 2 && nextIndex < folders.length) {
      const folder = folders[nextIndex++];
      active += 1;
      void ensureLauncherManifest(folder, { priority: 'low' }).finally(() => {
        active -= 1;
        scheduleNextBatch();
      });
    }
  };
  const scheduleNextBatch = () => {
    if (idleScheduled || nextIndex >= folders.length) return;
    idleScheduled = true;
    const run = () => {
      idleScheduled = false;
      pump();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      window.setTimeout(run, 800);
    }
  };
  scheduleNextBatch();
}

function retryFailedLauncherManifests() {
  const failed = LAUNCHER_MANIFEST_FOLDERS.filter(folder => _launcherCacheMeta[folder]?.error);
  if (!failed.length) return Promise.resolve();
  return Promise.all(failed.map(folder => ensureLauncherManifest(folder, { force: true })));
}

window.addEventListener('online', scheduleLauncherManifestPrefetch);
const launcherManifestConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
launcherManifestConnection?.addEventListener?.('change', () => {
  if (canPrefetchLauncherManifests()) scheduleLauncherManifestPrefetch();
});

// ── Desktop wallpaper service (loaded after the first desktop frame) ──
let desktopWallpaperControllerPromise = null;
let desktopWallpaperModuleAttempt = 0;

function loadDesktopWallpaperController() {
  if (!desktopWallpaperControllerPromise) {
    desktopWallpaperControllerPromise = retryWithBackoff(() => {
      const moduleUrl = new URL('./shared/desktop-wallpaper.js', import.meta.url);
      if (desktopWallpaperModuleAttempt > 0) {
        moduleUrl.searchParams.set('retry', `wallpaper-${desktopWallpaperModuleAttempt}`);
      }
      desktopWallpaperModuleAttempt += 1;
      return import(/* @vite-ignore */ moduleUrl.href).then(({ createDesktopWallpaperController }) => (
        createDesktopWallpaperController({
          document,
          window,
          readJSON,
          writeJSON,
          ensureManifest: () => ensureLauncherManifest('wallpapers'),
          hasManifestError: () => Boolean(_launcherCacheMeta.wallpapers?.error),
          normalizeAnimationChoices,
          chooseAnimation,
          notifySettingsChanged: notifyDesktopSettingsChanged,
        })
      ));
    }).catch(error => {
      desktopWallpaperControllerPromise = null;
      throw error;
    });
  }
  return desktopWallpaperControllerPromise;
}

function loadWallpaperForSettings() {
  return loadDesktopWallpaperController().then(controller => controller.loadForSettings());
}

function saveWallpaperPreferences(draft) {
  return loadDesktopWallpaperController().then(controller => controller.savePreferences(draft));
}

function useDefaultWallpaper() {
  return loadDesktopWallpaperController().then(controller => controller.useDefault());
}

function initializeDesktopWallpaper() {
  window.setTimeout(() => {
    void loadDesktopWallpaperController()
      .then(controller => controller.initialize())
      .catch(error => console.warn('[wallpaper] Could not initialize the wallpaper service.', error));
  }, 0);
}

window.requestAnimationFrame(initializeDesktopWallpaper);

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

function renderLauncherFiles() {
  const DOC_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>';
  const IMG_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
  const docs = _launcherCache.documents || [];
  const posts = _launcherCache.posts || [];
  const pictures = _launcherCache.pictures || [];
  const videos = _launcherCache.videos || [];
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
  const loading = LAUNCHER_MANIFEST_FOLDERS.filter(folder => _launcherCache[folder] === undefined);
  const failed = LAUNCHER_MANIFEST_FOLDERS.filter(folder => _launcherCacheMeta[folder]?.error);
  const hasFiles = allDocs.length > 0 || allPictures.length > 0 || allVideos.length > 0;
  launcherFileLoadStatus.hidden = loading.length === 0;
  launcherFileLoadStatus.textContent = loading.length
    ? (hasFiles ? 'Loading more files…' : 'Loading files…')
    : '';
  launcherFileLoadError.hidden = failed.length === 0;
  launcherFileLoadErrorText.textContent = failed.length
    ? `Couldn’t load ${failed.map(folder => ({
      posts: 'posts',
      documents: 'documents',
      pictures: 'pictures',
      videos: 'videos',
    })[folder]).join(', ')}.`
    : '';
  appFilesSection.hidden = !hasFiles && loading.length === 0 && failed.length === 0
    && activeLauncherTab === 'apps';
  updateLauncherFileSearch({ autoSelect: true });
  desktopSearchItems = buildDesktopSearchItems();
  desktopSearchItemsReady = LAUNCHER_MANIFEST_FOLDERS.every(folder => _launcherCache[folder] !== undefined);
  if (!desktopSearchSuggestions.hidden) renderDesktopSearchResults();
}

function populateLauncherFiles() {
  renderLauncherFiles();
  void ensureLauncherLinks();
  return Promise.all(LAUNCHER_MANIFEST_FOLDERS.map(folder => ensureLauncherManifest(folder, {
    background: true,
  }))).then(() => {
    if (!appMenu.hasAttribute('hidden')) renderLauncherFiles();
  });
}

launcherFileRetryButton.addEventListener('click', async () => {
  if (!LAUNCHER_MANIFEST_FOLDERS.some(folder => _launcherCacheMeta[folder]?.error)) return;
  launcherFileRetryButton.disabled = true;
  launcherFileRetryButton.setAttribute('aria-busy', 'true');
  launcherFileRetryButton.textContent = 'Retrying…';
  try {
    await retryFailedLauncherManifests();
  } finally {
    launcherFileRetryButton.disabled = false;
    launcherFileRetryButton.removeAttribute('aria-busy');
    launcherFileRetryButton.textContent = 'Retry';
    renderLauncherFiles();
  }
});

function updateLauncherFileSearch({ autoSelect = false } = {}) {
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
  let linkCount = 0;
  launcherLinksList.querySelectorAll('.launcher-link').forEach(link => {
    const matched = !query || link.dataset.searchText.includes(query);
    link.closest('li').hidden = !matched;
    if (matched) linkCount += 1;
  });
  launcherLinksList.querySelectorAll('.launcher-link-group').forEach(group => {
    const groupHasMatches = [...group.querySelectorAll('li')].some(item => !item.hidden);
    group.hidden = !groupHasMatches;
  });
  if (focusedFile?.hidden) {
    launcherSearchRestoreFocus = { element: focusedFile, tab: activeLauncherTab };
    launcherFileSearch.focus({ preventScroll: true });
  } else if (!query && launcherSearchRestoreFocus && document.activeElement === launcherFileSearch) {
    const restore = launcherSearchRestoreFocus;
    launcherSearchRestoreFocus = null;
    if (activeLauncherTab !== restore.tab) selectLauncherTab(restore.tab);
    if (restore.element.isConnected && !restore.element.hidden) restore.element.focus({ preventScroll: true });
  }
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
  docFilesEmpty.hidden = hasDocuments;
  docFilesEmpty.textContent = query ? 'No matching documents.' : 'No documents are available.';
  picFilesHeading.hidden = !hasPictures;
  picFilesList.hidden = !hasPictures;
  picFilesEmpty.hidden = hasPictures;
  picFilesEmpty.textContent = query ? 'No matching pictures.' : 'No pictures are available.';
  videoFilesHeading.hidden = !hasVideos;
  videoFilesList.hidden = !hasVideos;
  videoFilesEmpty.hidden = hasVideos;
  videoFilesEmpty.textContent = query ? 'No matching videos.' : 'No videos are available.';
  const fileCount = documentCount + pictureCount + videoCount;
  const loading = LAUNCHER_MANIFEST_FOLDERS.some(folder => _launcherCache[folder] === undefined);
  const failed = LAUNCHER_MANIFEST_FOLDERS.some(folder => _launcherCacheMeta[folder]?.error);
  appFilesSection.hidden = fileCount === 0 && !loading && !failed && activeLauncherTab === 'apps';
  const counts = {
    apps: appCount + linkCount,
    documents: documentCount,
    pictures: pictureCount,
    videos: videoCount,
  };
  if (autoSelect && query && counts[activeLauncherTab] === 0) {
    const nextTab = launcherTabOrder.find(tab => counts[tab] > 0);
    if (nextTab) selectLauncherTab(nextTab);
  }
  launcherFileSearchEmpty.hidden = !query || appCount + linkCount + fileCount > 0
    || loading || failed || launcherLinks === null;
  return { query, appCount, linkCount, documentCount, pictureCount, videoCount };
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
    ...Object.values(APP_REGISTRY)
      .filter(game => game.group === 'game-center' && game.type !== 'game-center')
      .map(game => makeDesktopSearchItem({
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
  desktopSearchItems = buildDesktopSearchItems();
  desktopSearchItemsReady = LAUNCHER_MANIFEST_FOLDERS.every(folder => _launcherCache[folder] !== undefined);
  renderDesktopSearchResults();
  if (!desktopSearchItemsReady) desktopSearchStatus.textContent = 'Loading suggestions…';
  desktopSearchLoadPromise = (async () => {
    await Promise.all(LAUNCHER_MANIFEST_FOLDERS.map(folder => ensureLauncherManifest(folder, {
      background: true,
    })));
    desktopSearchItems = buildDesktopSearchItems();
    desktopSearchItemsReady = LAUNCHER_MANIFEST_FOLDERS.every(folder => _launcherCache[folder] !== undefined);
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
  const queryText = launcherFileSearch.value.trim();
  if (queryText && gameMenu && !$('game-submenu').hidden) gameMenu.showRoot(false);
  const { query, appCount, linkCount, documentCount, pictureCount, videoCount } =
    updateLauncherFileSearch({ autoSelect: true });
  clearTimeout(launcherSearchAnnouncementTimer);
  launcherSearchAnnouncementTimer = setTimeout(() => {
    const apps = `${appCount} ${appCount === 1 ? 'app' : 'apps'}`;
    const links = `${linkCount} ${linkCount === 1 ? 'link' : 'links'}`;
    const documents = `${documentCount} ${documentCount === 1 ? 'document' : 'documents'}`;
    const pictures = `${pictureCount} ${pictureCount === 1 ? 'picture' : 'pictures'}`;
    const videos = `${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`;
    launcherFileSearchStatus.textContent = query
      ? `Matching results: ${apps}, ${links}, ${documents}, ${pictures}, and ${videos}.`
      : `All ${apps}, ${links}, ${documents}, ${pictures}, and ${videos} are shown.`;
  }, 250);
});

let manifestChangeSyncPromise = null;
let manifestChangeSyncAttempt = 0;

function initializeManifestChangeSync() {
  if (!manifestChangeSyncPromise) {
    manifestChangeSyncPromise = retryWithBackoff(() => {
      const moduleUrl = new URL('./shared/manifest-change-sync.js', import.meta.url);
      if (manifestChangeSyncAttempt > 0) {
        moduleUrl.searchParams.set('retry', `manifest-sync-${manifestChangeSyncAttempt}`);
      }
      manifestChangeSyncAttempt += 1;
      return import(/* @vite-ignore */ moduleUrl.href);
    }).then(({ subscribeToManifestChanges }) => subscribeToManifestChanges({
      targetWindow: window,
      getVisibleConsumers: () => ({
        menu: !appMenu.hasAttribute('hidden'),
        search: !desktopSearchSuggestions.hidden,
        fileManager: S.apps.some(record => record.type === 'file-manager'),
        wallpaperSettings: S.apps.some(record => record.type === 'settings'),
      }),
      markStale: folder => {
        const metadata = _launcherCacheMeta[folder];
        if (metadata) _launcherCacheMeta[folder] = { ...metadata, checkedAt: 0 };
      },
      renderMenu: renderLauncherFiles,
      renderSearch: () => {
        desktopSearchItems = buildDesktopSearchItems();
        desktopSearchItemsReady = LAUNCHER_MANIFEST_FOLDERS.every(folder => _launcherCache[folder] !== undefined);
        renderDesktopSearchResults();
      },
      refreshFolder: folder => ensureLauncherManifest(folder, { force: true }),
    })).catch(error => {
      manifestChangeSyncPromise = null;
      console.warn('[manifest-sync] Could not listen for file changes in other tabs.', error);
    });
  }
  return manifestChangeSyncPromise;
}

window.requestAnimationFrame(() => { void initializeManifestChangeSync(); });

// ── App context (passed to all app builders) ──────────────────
const appCtx = {
  appApis:        S.appApis,
  appTitles:      S.appTitles,
  is24HourTime:   () => use24HourTime,
  setAppTitle,
  toast,
  requestOpenFile,
  ensureFileManifest: ensureLauncherManifest,
  getFileManifestMeta: getLauncherManifestMeta,
  getFileManifestSnapshot: getLauncherManifestSnapshot,
  saveSession,
  openGameMenu: () => openAppMenu(true),
  updateDesktopNotes,
  settings: {
    getSnapshot: () => ({
      theme: effectiveTheme(),
      themeOverride: readRaw(THEME_KEY) || 'system',
      accentColor: ACCENT_COLORS.includes(readRaw(ACCENT_COLOR_KEY)) ? readRaw(ACCENT_COLOR_KEY) : 'blue',
      windowTints: readWindowTints(),
      animationPreferences: getAnimationPreferences(),
      use24HourTime,
      notificationsEnabled: systemNotificationsEnabled,
    }),
    setTheme: value => applyTheme(value === 'system' ? null : value),
    setAccentColor: value => applyAccentColor(value),
    setWindowTints,
    previewWindowTints: applyWindowTintAttributes,
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
const APP_DEFS = APP_REGISTRY;

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

document.addEventListener('focusin', event => {
  const appEl = event.target.closest?.('.app-window');
  if (appEl?.dataset.id) focusApp(appEl.dataset.id);
});

// ── Global event listeners ────────────────────────────────────
appMenuBtn.addEventListener('click', e => { e.stopPropagation(); toggleAppMenu(); });

function renderAppLaunchers() {
  const list = $('app-list');
  const welcomeButton = list.querySelector('[data-type="welcome"]');
  const gameCenterButton = $('game-center-entry');
  const fragment = document.createDocumentFragment();
  if (welcomeButton) fragment.append(welcomeButton);

  for (const descriptor of APP_LAUNCHERS) {
    if (!descriptor.window) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-launcher';
    button.dataset.type = descriptor.type;

    const icon = document.createElement('span');
    icon.className = 'app-launcher-icon';
    icon.innerHTML = descriptor.launcherIconSvg;
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'app-launcher-name';
    name.textContent = descriptor.title;
    button.append(icon, name);
    bindAppIntentPrefetch(button, descriptor.type);
    fragment.append(button);
  }

  if (gameCenterButton) fragment.append(gameCenterButton);
  list.replaceChildren(fragment);
}

renderAppLaunchers();

const gameCenterButton = $('game-center-entry');
gameCenterButton.addEventListener('click', () => {
  if (gameMenu) return;
  $('game-menu-load-status').hidden = true;
  void loadGameMenu().then(menu => {
    if (!appMenu.hidden) menu.showGames();
  }).catch(showGameMenuLoadError);
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
// ── App-menu help button → open help overlay ──────────────────
appMenuHelpBtn.addEventListener('click', () => { closeAppMenu(); void openHelp(); });

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

const windowShortcutRouter = createWindowShortcutRouter({
  document,
  state: S,
  windowController,
  appMenu,
  helpOverlay,
  systemPanel,
  notificationPanel,
  systemTimeButton: systemTimeBtn,
  appMenuButton: appMenuBtn,
  closeSystemPanel,
  closeNotifications: options => notificationCenter?.close(options),
  closeHelp,
  closeAppMenu,
  closeWinMenu,
  openAppMenu,
  toggleHelp,
  exitOverview,
});
document.addEventListener('keydown', windowShortcutRouter.handleKeyDown);

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
        windowController.moveColumn(col.id, ci - 1);
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
        windowController.moveColumn(col.id, ci + 1);
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
  return windowController.rearrangeWindow(draggedId, meta);
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
  welcomeReminderDismissPending = true;
  notificationCenter?.dismissWelcomeReminder();
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
reminders.forEach(scheduleReminderNotification);
if (welcomeShowOnStartup) openWelcomeWindow();
else {
  void loadNotificationCenter().then(center => center.add({
    id: 'welcome-startup-reminder',
    type: 'welcome',
    title: 'Welcome is available',
    message: 'You can open the Welcome dialog from the Apps menu whenever you need it.',
    action: 'open-welcome',
    actionLabel: 'Open Welcome',
  })).catch(() => {});
}
updateTopBar();
updateEmptyState();
updateStripLayout();
scheduleLauncherManifestPrefetch();
