'use strict';

import { S }               from './desktop-state.js';
import { buildDocViewer }   from './apps/doc-viewer.js';
import { buildImgViewer }   from './apps/img-viewer.js';
import { buildMediaPlayer } from './apps/media-player.js';
import { buildFileManager } from './apps/file-manager.js';
import { renderMarkdown }   from './shared/markdown.js';

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
const emptyState       = $('empty-state');

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
const REMINDER_KEY = 'desktop-reminders';
const REMINDER_BACKGROUND_KEY = 'desktop-reminder-background';
let calendarDate  = new Date();
let selectedCalendarDate = new Date();
let use24HourTime = localStorage.getItem(TIME_KEY) === 'true';
let reminders = [];
const reminderNotificationTimers = new Map();
let systemNotificationsEnabled = localStorage.getItem(REMINDER_BACKGROUND_KEY) === 'true';
try {
  const storedReminders = JSON.parse(localStorage.getItem(REMINDER_KEY) || '[]');
  if (Array.isArray(storedReminders)) reminders = storedReminders;
} catch { /* ignore invalid stored reminders */ }

function effectiveTheme() {
  return document.documentElement.dataset.theme || (themeMedia.matches ? 'dark' : 'light');
}

function applyTheme(theme = localStorage.getItem(THEME_KEY)) {
  const hasOverride = theme === 'light' || theme === 'dark';
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  } else {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(THEME_KEY);
  }
  themeToggle.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
  themeSplit.classList.toggle('has-override', hasOverride);
  themeReset.setAttribute('aria-hidden', String(!hasOverride));
  themeReset.tabIndex = hasOverride ? 0 : -1;
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
  toggle.disabled = !supported || blocked;
  toggle.setAttribute('aria-pressed', String(systemNotificationsEnabled));
  state.textContent = !supported ? 'Unavailable' : blocked ? 'Blocked' : '';
  toggle.title = blocked
    ? 'System notifications are blocked in browser settings'
    : systemNotificationsEnabled
      ? 'Turn off system notifications and use built-in notifications'
      : 'Turn on system notifications while this page is open';
}

async function removeLegacyBackgroundNotifications() {
  localStorage.removeItem('desktop-reminder-client-id');
  localStorage.removeItem('desktop-reminder-capability');
  localStorage.removeItem('desktop-reminder-cleanup-pending');
  localStorage.removeItem('desktop-reminder-sync-queue');
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
      localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
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
  if (opening) { updateClock(); renderCalendar(); }
});
systemPanel.addEventListener('click', e => e.stopPropagation());
themeToggle.addEventListener('click', () => applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'));
themeReset.addEventListener('click', () => applyTheme(null));
themeMedia.addEventListener('change', () => { if (!localStorage.getItem(THEME_KEY)) applyTheme(null); });
const timeFormatToggle = $('time-format-toggle');
timeFormatToggle.setAttribute('aria-pressed', String(use24HourTime));
timeFormatToggle.addEventListener('click', () => {
  use24HourTime = !use24HourTime;
  localStorage.setItem(TIME_KEY, String(use24HourTime));
  timeFormatToggle.setAttribute('aria-pressed', String(use24HourTime));
  updateClock();
  renderReminders();
});
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
  localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
  scheduleReminderNotification(reminder);
  event.currentTarget.reset();
  event.currentTarget.hidden = true;
  renderReminders();
});
$('reminder-notification-toggle').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try {
    if (systemNotificationsEnabled) {
      systemNotificationsEnabled = false;
      localStorage.removeItem(REMINDER_BACKGROUND_KEY);
    } else if ('Notification' in window) {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      systemNotificationsEnabled = permission === 'granted';
      if (systemNotificationsEnabled) {
        localStorage.setItem(REMINDER_BACKGROUND_KEY, 'true');
      } else {
        localStorage.removeItem(REMINDER_BACKGROUND_KEY);
      }
    }
  } catch (error) {
    console.warn('[reminders] System notification setting failed.', error);
    systemNotificationsEnabled = false;
    localStorage.removeItem(REMINDER_BACKGROUND_KEY);
  } finally {
    reminders.forEach(scheduleReminderNotification);
    updateNotificationSetting();
    event.currentTarget.disabled = false;
  }
});
applyTheme();
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
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 2,
      columns: S.columns.map(col => ({
        widthPreset: col.widthPreset,
        apps: col.appIds.map(appId => {
          const app = S.apps.find(a => a.id === appId);
          return { type: app.type };
        }),
      })),
    }));
  } catch { /* storage unavailable */ }
}

function safeRemoveSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* */ }
  try { localStorage.removeItem(SESSION_KEY_V1); } catch { /* */ }
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

function createColEl(colId) {
  const el = document.createElement('div');
  el.className = 'app-col';
  el.dataset.colId = colId;
  el.dataset.width = 'full';
  return el;
}

// ── App lifecycle ─────────────────────────────────────────────
function openApp(type, insertIntoColId = null) {
  const def = APP_DEFS[type];
  if (!def) return null;

  const id = `app-${S.nextAppId++}`;
  const el = def.build(id);
  el.classList.add('app-window');
  el.dataset.id   = id;
  el.dataset.type = type;

  S.apps.push({ id, type, el });

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
  return id;
}

function closeApp(id) {
  const appIdx = S.apps.findIndex(a => a.id === id);
  if (appIdx === -1) return;

  const { el } = S.apps[appIdx];
  const col = getAppColumn(id);

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
}

function updateWidthButtons() { /* width buttons now live in the per-window ⋮ menu */ }

function updateEmptyState() {
  S.apps.length === 0 ? emptyState.removeAttribute('hidden') : emptyState.setAttribute('hidden', '');
}

function updateStripLayout() {
  appStrip.classList.toggle('center-apps', S.columns.length === 1);
}

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
function openAppMenu() {
  appMenu.removeAttribute('hidden');
  appMenuBtn.setAttribute('aria-expanded', 'true');
  closeHelp();
  populateLauncherFiles();
  requestAnimationFrame(() => { const f = appMenu.querySelector('.app-launcher'); if (f) f.focus(); });
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
  if (newId) S.appApis[newId]?.openFile(file.url, file.displayName, file.poster);
}

// ── App-launcher file listing ─────────────────────────────────
const _launcherCache  = {};
const appFilesSection = $('app-files-section');
const docFilesList    = $('doc-files-list');
const picFilesList    = $('pic-files-list');
const docFilesCount   = $('doc-files-count');
const picFilesCount   = $('pic-files-count');

function parseManifestForLauncher(folder, entries) {
  return entries.map(entry => {
    const { filename, url: mUrl } = entry;
    const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
    if (!m) return null;
    const [, , , , rest] = m;
    const dotIdx  = rest.lastIndexOf('.');
    const rawName = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
    const displayName = rawName.replace(/_/g, ' ');
    const url = mUrl || `${folder}/${encodeURIComponent(filename)}`;
    const extRaw = dotIdx >= 0 ? rest.slice(dotIdx + 1).toLowerCase() : '';
    const IMG_EXTS = ['jpg','jpeg','png','gif','webp','svg'];
    const type = IMG_EXTS.includes(extRaw) ? 'image' : 'document';
    return { displayName, url, type, folder };
  }).filter(Boolean);
}

async function ensureLauncherManifest(folder) {
  if (_launcherCache[folder] !== undefined) return _launcherCache[folder];
  try {
    const r = await fetch(`${folder}/manifest.json`);
    if (!r.ok) throw new Error();
    _launcherCache[folder] = parseManifestForLauncher(folder, await r.json());
  } catch {
    _launcherCache[folder] = [];
  }
  return _launcherCache[folder];
}

function buildFileLauncherBtn(file, iconSvg, iconColor) {
  const btn = document.createElement('button');
  btn.className = 'app-file-btn';
  btn.setAttribute('title', `Open "${file.displayName}"`);
  btn.innerHTML = `
    <span class="app-file-icon" style="color:${iconColor}" aria-hidden="true">${iconSvg}</span>
    <span class="app-file-name">${file.displayName}</span>
  `;
  btn.addEventListener('click', () => {
    requestOpenFile(file);
    closeAppMenu();
  });
  return btn;
}

async function populateLauncherFiles() {
  const DOC_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`;
  const IMG_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`;

  const [docs, posts, pics] = await Promise.all([
    ensureLauncherManifest('documents'),
    ensureLauncherManifest('posts'),
    ensureLauncherManifest('pictures'),
  ]);

  const allDocs = [...docs, ...posts];

  docFilesList.innerHTML = '';
  allDocs.forEach(f => docFilesList.appendChild(buildFileLauncherBtn(f, DOC_ICON, 'var(--accent-light)')));
  docFilesCount.textContent = allDocs.length ? `${allDocs.length}` : '';

  picFilesList.innerHTML = '';
  pics.forEach(f => picFilesList.appendChild(buildFileLauncherBtn(f, IMG_ICON, '#a78bfa')));
  picFilesCount.textContent = pics.length ? `${pics.length}` : '';

  if (allDocs.length > 0 || pics.length > 0) {
    appFilesSection.removeAttribute('hidden');
  }
}

// ── App context (passed to all app builders) ──────────────────
const appCtx = {
  appApis:        S.appApis,
  appTitles:      S.appTitles,
  setAppTitle,
  toast,
  requestOpenFile,
};

// ── App registry ──────────────────────────────────────────────
const APP_DEFS = {
  'doc-viewer': {
    title: 'Document Viewer',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
    </svg>`,
    build: id => buildDocViewer(id, appCtx),
  },
  'img-viewer': {
    title: 'Image Viewer',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
    </svg>`,
    build: id => buildImgViewer(id, appCtx),
  },
  'file-manager': {
    title: 'File Manager',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>`,
    build: id => buildFileManager(id, appCtx),
  },
  'media-player': {
    title: 'Media Player',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/>
    </svg>`,
    build: id => buildMediaPlayer(id, appCtx),
  },
};

// ── Session restore ───────────────────────────────────────────
function restoreSession() {
  try {
    let raw = localStorage.getItem(SESSION_KEY);
    let isV1 = false;
    if (!raw) { raw = localStorage.getItem(SESSION_KEY_V1); isV1 = true; }
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data) { safeRemoveSession(); return; }

    S._skipSave = true;

    if (!isV1 && data.v === 2 && Array.isArray(data.columns)) {
      for (const colData of data.columns) {
        const preset = WIDTH_PRESETS.includes(colData.widthPreset) ? colData.widthPreset : 'full';
        let colId = null;
        for (let i = 0; i < colData.apps.length; i++) {
          const appData = colData.apps[i];
          if (typeof appData.type !== 'string' || !APP_DEFS[appData.type]) continue;
          const appId = openApp(appData.type, colId);
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

    S._skipSave = false;
    saveSession();
    if (S.focusedId) requestAnimationFrame(() => scrollToApp(S.focusedId));
  } catch {
    S._skipSave = false;
    safeRemoveSession();
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

document.querySelectorAll('.app-launcher').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.type === 'welcome') openWelcomeWindow();
    else openApp(btn.dataset.type);
    closeAppMenu();
  });
});

closeBtn.addEventListener('click', () => { if (S.focusedId) closeApp(S.focusedId); });
overviewBtn.addEventListener('click', () => toggleOverview());
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
  document.body.classList.add('mod-overview');
  overviewBtn.setAttribute('aria-pressed', 'true');
  window.addEventListener('wheel', _ovWheelHandler, { passive: false });
  requestAnimationFrame(() => positionOverview());
}

function exitOverview() {
  document.body.classList.remove('mod-overview');
  overviewBtn.setAttribute('aria-pressed', 'false');
  window.removeEventListener('wheel', _ovWheelHandler);
  appStrip.style.transform       = '';
  appStrip.style.transformOrigin = '';
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
  dropdown.className = 'win-menu-dropdown';
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
  welcome: { url: 'posts/20240101_Welcome.md',  html: null },
  about:   { url: 'posts/20240115_About_Me.md', html: null },
  links:   { url: 'posts/20240201_My_Sites.md', html: null },
};
let _welcomeActiveTab = 'welcome';

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
    body.innerHTML = tab.html;
    body.scrollTop = 0;
    return;
  }

  body.innerHTML = '<p class="doc-status">Loading\u2026</p>';
  fetch(tab.url)
    .then(r => r.ok ? r.text() : Promise.reject(r.status))
    .then(text => {
      tab.html = renderMarkdown(text);
      if (_welcomeActiveTab === name) { body.innerHTML = tab.html; body.scrollTop = 0; }
    })
    .catch(() => {
      tab.html = '';
      if (_welcomeActiveTab === name) body.innerHTML = '';
    });
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
