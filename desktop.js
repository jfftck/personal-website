'use strict';

import { S }               from './desktop-state.js';
import { buildDocViewer }   from './apps/doc-viewer.js';
import { buildImgViewer }   from './apps/img-viewer.js';
import { buildMediaPlayer } from './apps/media-player.js';
import { buildFileManager } from './apps/file-manager.js';

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
const appStrip         = $('app-strip');
const emptyState       = $('empty-state');

// ── Width helpers ─────────────────────────────────────────────
function rem() { return parseFloat(getComputedStyle(document.documentElement).fontSize); }
const EDGE = () => 2 * rem();
const GAP  = () => 1 * rem();
const WIDTH_PRESETS = ['third', 'half', 'full'];

function computeWidth(preset) {
  const usable = window.innerWidth - 2 * EDGE();
  switch (preset) {
    case 'full':  return usable;
    case 'half':  return (usable - GAP()) / 2;
    case 'third': return (usable - 2 * GAP()) / 3;
    default:      return usable;
  }
}

// ── Session persistence ────────────────────────────────────────
const SESSION_KEY      = 'desktop-session-v2';
const SESSION_KEY_V1   = 'desktop-session-v1';
const WELCOME_SHOWN_KEY = 'desktop-welcome-shown';

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
    colEl.style.setProperty('--app-width', `${computeWidth('full')}px`);
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
  const px = Math.max(computeWidth(preset), 160);

  col.el.classList.remove('width-shrink', 'width-grow');
  void col.el.offsetWidth;
  col.el.classList.add('width-shrink');
  col.el.addEventListener('animationend', () => {
    col.el.classList.remove('width-shrink');
    col.el.style.setProperty('--app-width', `${px}px`);
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
  newColEl.style.setProperty('--app-width', `${Math.max(computeWidth(col.widthPreset), 160)}px`);

  const newCol = { id: newColId, appIds: [S.focusedId], widthPreset: col.widthPreset, el: newColEl };
  S.columns.splice(colIdx + 1, 0, newCol);
  col.el.after(newColEl);
  wireColEvents(newColEl);

  saveSession();
  updateTopBar();
  updateStripLayout();
  requestAnimationFrame(() => scrollToApp(S.focusedId));
}

// ── Top-bar rendering ─────────────────────────────────────────
function updateTopBar() {
  openAppsBar.innerHTML = '';
  for (const { id, type } of S.apps) {
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
            col.el.style.setProperty('--app-width', `${Math.max(computeWidth(preset), 160)}px`);
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
            col.el.style.setProperty('--app-width', `${Math.max(computeWidth(preset), 160)}px`);
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
  colEl.addEventListener('pointerdown', e => {
    const appEl = e.target.closest('.app-window');
    if (appEl?.dataset.id) {
      if (document.body.classList.contains('mod-overview')) {
        e.preventDefault();
        if (appEl.dataset.id === S.focusedId) {
          exitOverview();
        } else {
          focusApp(appEl.dataset.id); // positionOverview called by focusApp via rAF
        }
        return;
      }
      focusApp(appEl.dataset.id);
    }
  }, { capture: true });
}

// ── Global event listeners ────────────────────────────────────
appMenuBtn.addEventListener('click', e => { e.stopPropagation(); toggleAppMenu(); });

document.querySelectorAll('.app-launcher').forEach(btn => {
  btn.addEventListener('click', () => { openApp(btn.dataset.type); closeAppMenu(); });
});

closeBtn.addEventListener('click', () => { if (S.focusedId) closeApp(S.focusedId); });
overviewBtn.addEventListener('click', () => toggleOverview());
winMenuBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (document.getElementById('win-menu-open')) { closeWinMenu(); return; }
  openWinMenu();
});
helpOpenLauncher.addEventListener('click', () => { closeHelp(); openAppMenu(); });

document.addEventListener('click', e => {
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
    if (helpOpen) { closeHelp(); appMenuBtn.focus(); return; }
    if (menuOpen) { closeAppMenu(); appMenuBtn.focus(); return; }
    if (document.getElementById('win-menu-open')) { closeWinMenu(); return; }
    if (document.body.classList.contains('mod-overview')) { exitOverview(); return; }
    return;
  }

  if (e.key === '?' && !isTyping && !menuOpen) { e.preventDefault(); toggleHelp(); return; }

  if ((e.key === '[' || e.key === ']') && !isTyping && !helpOpen && !menuOpen) {
    e.preventDefault();
    e.key === '[' ? consumeLeft() : expelRight();
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
  }

  if (e.key === 'Tab' && !inContent) {
    e.preventDefault();
    e.shiftKey ? focusPrevApp() : focusNextApp();
  }
});

helpCloseBtn.addEventListener('click', () => closeHelp());
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) closeHelp(); });

// ── Overview mode ─────────────────────────────────────────────
function enterOverview() {
  document.body.classList.add('mod-overview');
  overviewBtn.setAttribute('aria-pressed', 'true');
  requestAnimationFrame(() => positionOverview());
}

function exitOverview() {
  document.body.classList.remove('mod-overview');
  overviewBtn.setAttribute('aria-pressed', 'false');
  appStrip.style.transform      = '';
  appStrip.style.transformOrigin = '';
  document.getElementById('overview-controls')?.remove();
}

function toggleOverview() {
  document.body.classList.contains('mod-overview') ? exitOverview() : enterOverview();
}

function positionOverview() {
  if (!document.body.classList.contains('mod-overview')) return;
  document.getElementById('overview-controls')?.remove();
  if (S.apps.length === 0) return;

  const SCALE    = 0.5;
  const TOPBAR_H = 48;

  // Reset transform before measuring natural positions (no-transition avoids flicker)
  appStrip.classList.add('ov-notransition');
  appStrip.style.transform      = '';
  appStrip.style.transformOrigin = '';
  void appStrip.offsetWidth; // force reflow

  const stripRect = appStrip.getBoundingClientRect();
  let tX = 0, tY = 0;

  if (S.focusedId) {
    const fApp = S.apps.find(a => a.id === S.focusedId);
    if (fApp) {
      const wr   = fApp.el.getBoundingClientRect();
      const wCxS = wr.left + wr.width  / 2 - stripRect.left;
      const wCyS = wr.top  + wr.height / 2 - stripRect.top;
      const vCX  = window.innerWidth  / 2;
      const vCY  = TOPBAR_H + (window.innerHeight - TOPBAR_H) / 2;
      // With transform: translate(tX,tY) scale(SCALE), origin 0 0:
      //   viewport_x = stripRect.left + tX + contentX * SCALE
      tX = vCX - stripRect.left - wCxS * SCALE;
      tY = vCY - stripRect.top  - wCyS * SCALE;
    }
  }

  appStrip.style.transformOrigin = '0 0';
  appStrip.style.transform       = `translate(${tX}px,${tY}px) scale(${SCALE})`;
  void appStrip.offsetWidth; // commit new transform before re-enabling transition
  appStrip.classList.remove('ov-notransition');

  _buildOverviewControls(stripRect, tX, tY, SCALE);
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

function _buildOverviewControls(stripRect, tX, tY, scale) {
  // NOTE: this is called AFTER the new transform is applied, so getBoundingClientRect()
  // returns post-transform viewport coords — exactly what we need for fixed-layer positioning.
  const layer = document.createElement('div');
  layer.id = 'overview-controls';
  document.body.appendChild(layer);

  const order   = getAppOrder();
  const firstId = order[0];
  const lastId  = order[order.length - 1];

  S.columns.forEach(col => {
    const cr   = col.el.getBoundingClientRect(); // visual viewport coords
    const midY = cr.top + cr.height / 2;

    // Left nav arrow
    const lBtn = document.createElement('button');
    lBtn.className = 'ov-arrow';
    lBtn.innerHTML = _ARROW_L;
    lBtn.setAttribute('aria-label', 'Previous window');
    lBtn.disabled  = S.focusedId === firstId;
    lBtn.style.cssText = `left:${cr.left - 40}px;top:${midY - 18}px;`;
    lBtn.addEventListener('click', e => { e.stopPropagation(); focusPrevApp(); });
    layer.appendChild(lBtn);

    // Right nav arrow
    const rBtn = document.createElement('button');
    rBtn.className = 'ov-arrow';
    rBtn.innerHTML = _ARROW_R;
    rBtn.setAttribute('aria-label', 'Next window');
    rBtn.disabled  = S.focusedId === lastId;
    rBtn.style.cssText = `left:${cr.left + cr.width + 8}px;top:${midY - 18}px;`;
    rBtn.addEventListener('click', e => { e.stopPropagation(); focusNextApp(); });
    layer.appendChild(rBtn);

    // Drag handle per window
    col.appIds.forEach(appId => {
      const app = S.apps.find(a => a.id === appId);
      if (!app) return;
      const wr = app.el.getBoundingClientRect(); // visual viewport coords
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

  // Width pill above focused window
  if (S.focusedId) {
    const fApp = S.apps.find(a => a.id === S.focusedId);
    const fCol = fApp ? getAppColumn(S.focusedId) : null;
    if (fApp && fCol) {
      const wr   = fApp.el.getBoundingClientRect(); // visual viewport coords
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
      pill.style.cssText = `left:${wr.left + wr.width / 2 - PW / 2}px;top:${wr.top - 52}px;width:${PW}px;`;
      layer.appendChild(pill);
    }
  }
}

// ── Overview drag-to-reorder ──────────────────────────────────
let _ovDrag = null;

function _wireOvDrag(handle, appId, layer) {
  let ghost = null;

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
  });

  handle.addEventListener('pointermove', e => {
    if (!_ovDrag || !ghost) return;
    ghost.style.left = (e.clientX - 20) + 'px';
    ghost.style.top  = (e.clientY - 14) + 'px';
    layer.querySelectorAll('.ov-drag-handle').forEach(h => h.classList.remove('drop-above', 'drop-below'));
    const t = _ovFindDrop(e.clientX, e.clientY, appId);
    if (t) t.el.classList.add(t.pos === 'above' ? 'drop-above' : 'drop-below');
  });

  handle.addEventListener('pointerup', e => {
    if (!_ovDrag) return;
    ghost?.remove(); ghost = null;
    handle.classList.remove('dragging');
    layer.querySelectorAll('.ov-drag-handle').forEach(h => h.classList.remove('drop-above', 'drop-below'));
    const t = _ovFindDrop(e.clientX, e.clientY, appId);
    if (t) _ovPerformDrop(appId, t.targetId, t.pos);
    _ovDrag = null;
  });

  handle.addEventListener('pointercancel', () => {
    ghost?.remove(); ghost = null;
    handle.classList.remove('dragging');
    _ovDrag = null;
  });
}

function _ovFindDrop(x, y, draggedId) {
  for (const h of document.querySelectorAll('#overview-controls .ov-drag-handle')) {
    const tid = h.dataset.appId;
    if (tid === draggedId) continue;
    const r = h.getBoundingClientRect();
    if (x >= r.left - 60 && x <= r.right + 60 && y >= r.top - 60 && y <= r.bottom + 60) {
      return { targetId: tid, pos: y < r.top + r.height / 2 ? 'above' : 'below', el: h };
    }
  }
  return null;
}

function _ovPerformDrop(draggedId, targetId, pos) {
  if (draggedId === targetId) return;
  const srcCol = getAppColumn(draggedId);
  const dstCol = getAppColumn(targetId);
  if (!srcCol || !dstCol) return;

  const srcIdx = srcCol.appIds.indexOf(draggedId);
  srcCol.appIds.splice(srcIdx, 1);
  const app = S.apps.find(a => a.id === draggedId);
  app.el.remove();

  if (srcCol.appIds.length === 0) {
    srcCol.el.remove();
    S.columns.splice(S.columns.indexOf(srcCol), 1);
  }

  const freshDst = getAppColumn(targetId);
  if (!freshDst) return;

  const dstIdx   = freshDst.appIds.indexOf(targetId);
  const insertAt = pos === 'above' ? dstIdx : dstIdx + 1;
  freshDst.appIds.splice(insertAt, 0, draggedId);

  const winEls = freshDst.el.querySelectorAll('.app-window');
  freshDst.el.insertBefore(app.el, winEls[insertAt] || null);

  saveSession();
  updateTopBar();
  updateStripLayout();
  requestAnimationFrame(() => positionOverview());
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

// ── First-visit welcome ───────────────────────────────────────
function populateEmptyState() {
  emptyState.innerHTML = `
    <div class="welcome-screen">
      <img src="jmt.svg" class="welcome-logo" alt="JMT logo" width="80" height="80">
      <h1 class="welcome-title">Jeffrey M. Tackett</h1>
      <p class="welcome-tagline">Documents, photos &amp; media</p>
      <button class="welcome-open-btn" id="welcome-open-fm">
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
        Open File Manager
      </button>
    </div>`;
  document.getElementById('welcome-open-fm')?.addEventListener('click', () => openApp('file-manager'));
}

function maybeShowWelcome() {
  try {
    if (localStorage.getItem(WELCOME_SHOWN_KEY)) return;
    localStorage.setItem(WELCOME_SHOWN_KEY, '1');
  } catch { return; }

  // Only show if no prior session was restored
  if (S.apps.length > 0) return;

  openApp('file-manager');
}

// ── Init ──────────────────────────────────────────────────────
populateEmptyState();
restoreSession();
maybeShowWelcome();
updateTopBar();
updateEmptyState();
updateStripLayout();
