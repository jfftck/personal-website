'use strict';

/* ============================================================
   desktop.js — Niri-style tiling window manager
   ============================================================ */

// ── App registry ──────────────────────────────────────────────
const APP_DEFS = {
  'doc-viewer': {
    title: 'Document Viewer',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
    </svg>`,
    build: buildDocViewer,
  },
  'img-viewer': {
    title: 'Image Viewer',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
    </svg>`,
    build: buildImgViewer,
  },
  'file-manager': {
    title: 'File Manager',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>`,
    build: buildFileManager,
  },
};

// ── State ─────────────────────────────────────────────────────
/**
 * apps:    [{ id, type, el }]
 * columns: [{ id, appIds, widthPreset, el }]
 * Each column contains one or more stacked app windows.
 */
let apps      = [];
let columns   = [];
let focusedId = null;
let nextAppId = 1;
let nextColId = 1;
let _skipSave = false;
let metaHeld  = false;
let dragState = null; // { colId, colEl, pointerId }

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
const appStrip         = $('app-strip');
const emptyState       = $('empty-state');

// ── Width helpers ─────────────────────────────────────────────
function rem() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize);
}

const EDGE = () => 2 * rem();
const GAP  = () => 1 * rem();

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
const SESSION_KEY    = 'desktop-session-v2';
const SESSION_KEY_V1 = 'desktop-session-v1';

function saveSession() {
  if (_skipSave) return;
  try {
    const data = {
      v: 2,
      columns: columns.map(col => ({
        widthPreset: col.widthPreset,
        apps: col.appIds.map(appId => {
          const app = apps.find(a => a.id === appId);
          return { type: app.type };
        }),
      })),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

function safeRemoveSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* */ }
  try { localStorage.removeItem(SESSION_KEY_V1); } catch { /* */ }
}

function restoreSession() {
  try {
    let raw = localStorage.getItem(SESSION_KEY);
    let isV1 = false;
    if (!raw) {
      raw = localStorage.getItem(SESSION_KEY_V1);
      isV1 = true;
    }
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data) { safeRemoveSession(); return; }

    _skipSave = true;

    if (!isV1 && data.v === 2 && Array.isArray(data.columns)) {
      // v2 format
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
          const col = columns.find(c => c.id === colId);
          if (col) {
            col.widthPreset = preset;
            col.el.style.setProperty('--app-width', `${Math.max(computeWidth(preset), 160)}px`);
          }
        }
      }
    } else if (isV1 && Array.isArray(data)) {
      // v1 format (flat array, single-app columns)
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

    _skipSave = false;
    saveSession();
    // Scroll to focused after restore
    if (focusedId) requestAnimationFrame(() => scrollToApp(focusedId));
  } catch {
    _skipSave = false;
    safeRemoveSession();
  }
}

// ── Column helpers ─────────────────────────────────────────────
function getAppColumn(appId) {
  return columns.find(col => col.appIds.includes(appId));
}

function getAppOrder() {
  return columns.flatMap(col => col.appIds);
}

function createColEl(colId) {
  const el = document.createElement('div');
  el.className = 'app-col';
  el.dataset.colId = colId;

  const handle = document.createElement('div');
  handle.className = 'col-drag-handle';
  handle.setAttribute('title', 'Drag to reorder  ·  Hold ⌘/Ctrl then drag anywhere');
  handle.setAttribute('aria-hidden', 'true');
  handle.innerHTML = `<svg width="22" height="6" viewBox="0 0 22 6" fill="currentColor" aria-hidden="true">
    <circle cx="3"  cy="3" r="1.75"/>
    <circle cx="11" cy="3" r="1.75"/>
    <circle cx="19" cy="3" r="1.75"/>
  </svg>`;
  el.appendChild(handle);

  return el;
}

// ── App lifecycle ─────────────────────────────────────────────
/**
 * Open an app of the given type.
 * If insertIntoColId is provided, add to that column instead of creating a new one.
 * Returns the new app ID.
 */
function openApp(type, insertIntoColId = null) {
  const def = APP_DEFS[type];
  if (!def) return null;

  const id = `app-${nextAppId++}`;
  const el = def.build(id);
  el.classList.add('app-window');
  el.dataset.id = id;
  el.dataset.type = type;

  apps.push({ id, type, el });

  const existingCol = insertIntoColId ? columns.find(c => c.id === insertIntoColId) : null;

  if (existingCol) {
    existingCol.appIds.push(id);
    existingCol.el.appendChild(el);
  } else {
    const colId    = `col-${nextColId++}`;
    const colEl    = createColEl(colId);
    colEl.appendChild(el);

    const px = computeWidth('full');
    colEl.style.setProperty('--app-width', `${px}px`);

    const col = { id: colId, appIds: [id], widthPreset: 'full', el: colEl };
    columns.push(col);
    appStrip.appendChild(colEl);
    wireColEvents(colEl, colId);
  }

  focusApp(id);
  updateEmptyState();
  updateStripLayout();
  if (!_skipSave) {
    saveSession();
    requestAnimationFrame(() => scrollToApp(id));
  }

  return id;
}

function closeApp(id) {
  const appIdx = apps.findIndex(a => a.id === id);
  if (appIdx === -1) return;

  const { el } = apps[appIdx];
  const col    = getAppColumn(id);

  apps.splice(appIdx, 1);
  el.remove();

  if (col) {
    const cIdx = col.appIds.indexOf(id);
    col.appIds.splice(cIdx, 1);

    if (col.appIds.length === 0) {
      const colIdx = columns.indexOf(col);
      col.el.remove();
      columns.splice(colIdx, 1);
    }
  }

  if (focusedId === id) {
    focusedId = null;
    const order = getAppOrder();
    if (order.length > 0) {
      let nextId = null;
      // Prefer an app in the same column
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
  if (focusedId === id) return;

  if (focusedId) {
    const prev = apps.find(a => a.id === focusedId);
    if (prev) prev.el.classList.remove('focused');
  }

  focusedId = id;

  const next = apps.find(a => a.id === id);
  if (next) {
    next.el.classList.add('focused');
    if (!_skipSave) requestAnimationFrame(() => scrollToApp(id));
  }

  updateTopBar();
}

function scrollToApp(id) {
  const col = getAppColumn(id);
  if (!col) return;
  col.el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
}

const WIDTH_PRESETS = ['third', 'half', 'full'];

function setFocusedWidth(preset) {
  if (!focusedId) return;
  const col = getAppColumn(focusedId);
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
    col.el.addEventListener('animationend', () => {
      col.el.classList.remove('width-grow');
    }, { once: true });
  }, { once: true });

  col.widthPreset = preset;
  saveSession();
  updateWidthButtons();
}

function cycleFocusedWidthWider() {
  if (!focusedId) return;
  const col = getAppColumn(focusedId);
  if (!col) return;
  const idx = WIDTH_PRESETS.indexOf(col.widthPreset);
  setFocusedWidth(WIDTH_PRESETS[Math.min(idx + 1, WIDTH_PRESETS.length - 1)]);
}

function cycleFocusedWidthNarrower() {
  if (!focusedId) return;
  const col = getAppColumn(focusedId);
  if (!col) return;
  const idx = WIDTH_PRESETS.indexOf(col.widthPreset);
  setFocusedWidth(WIDTH_PRESETS[Math.max(idx - 1, 0)]);
}

// ── Consume / Expel ───────────────────────────────────────────
/** Take the last app from the column to the left and append it to the focused column. */
function consumeLeft() {
  if (!focusedId) return;
  const col    = getAppColumn(focusedId);
  if (!col) return;
  const colIdx = columns.indexOf(col);
  if (colIdx === 0) return;

  const leftCol = columns[colIdx - 1];
  if (leftCol.appIds.length === 0) return;

  const takenId  = leftCol.appIds[leftCol.appIds.length - 1];
  const takenApp = apps.find(a => a.id === takenId);
  if (!takenApp) return;

  leftCol.appIds.pop();
  takenApp.el.remove();

  if (leftCol.appIds.length === 0) {
    leftCol.el.remove();
    columns.splice(colIdx - 1, 1);
  }

  col.appIds.push(takenId);
  col.el.appendChild(takenApp.el);

  saveSession();
  updateTopBar();
  updateStripLayout();
}

/** Move the focused app out of its column into a new column to the right. */
function expelRight() {
  if (!focusedId) return;
  const col = getAppColumn(focusedId);
  if (!col || col.appIds.length <= 1) return;

  const colIdx = columns.indexOf(col);
  const appIdx = col.appIds.indexOf(focusedId);
  col.appIds.splice(appIdx, 1);
  const app = apps.find(a => a.id === focusedId);
  app.el.remove();

  const newColId = `col-${nextColId++}`;
  const newColEl = createColEl(newColId);
  newColEl.appendChild(app.el);

  const px = Math.max(computeWidth(col.widthPreset), 160);
  newColEl.style.setProperty('--app-width', `${px}px`);

  const newCol = { id: newColId, appIds: [focusedId], widthPreset: col.widthPreset, el: newColEl };
  columns.splice(colIdx + 1, 0, newCol);
  col.el.after(newColEl);
  wireColEvents(newColEl, newColId);

  saveSession();
  updateTopBar();
  updateStripLayout();
  requestAnimationFrame(() => scrollToApp(focusedId));
}

// ── Column event wiring (focus + drag) ───────────────────────
function wireColEvents(colEl, colId) {
  colEl.addEventListener('pointerdown', e => {
    const onHandle = !!e.target.closest('.col-drag-handle');
    if (onHandle || metaHeld) {
      e.preventDefault();
      e.stopImmediatePropagation();
      startColDrag(colId, e, colEl);
      return;
    }
    // Focus whichever app window was clicked
    const appEl = e.target.closest('.app-window');
    if (appEl && appEl.dataset.id) focusApp(appEl.dataset.id);
  }, { capture: true });
}

// ── Drag to reorder columns ───────────────────────────────────
function startColDrag(colId, e, colEl) {
  dragState = { colId, colEl, pointerId: e.pointerId };
  colEl.classList.add('col-dragging');
  try { colEl.setPointerCapture(e.pointerId); } catch { /* */ }

  function onMove(ev) {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;

    const dragIdx = columns.findIndex(c => c.id === dragState.colId);
    if (dragIdx === -1) return;

    let targetIdx = -1;
    for (let i = 0; i < columns.length; i++) {
      if (i === dragIdx) continue;
      const rect = columns[i].el.getBoundingClientRect();
      if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return;

    // Swap in state array
    const temp = columns[dragIdx];
    columns[dragIdx] = columns[targetIdx];
    columns[targetIdx] = temp;

    // Swap in DOM
    if (dragIdx < targetIdx) {
      columns[targetIdx].el.after(dragState.colEl);
    } else {
      columns[targetIdx].el.before(dragState.colEl);
    }
  }

  function onEnd(ev) {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    dragState.colEl.classList.remove('col-dragging');
    dragState = null;
    colEl.removeEventListener('pointermove', onMove);
    saveSession();
  }

  colEl.addEventListener('pointermove', onMove);
  colEl.addEventListener('pointerup',     onEnd, { once: true });
  colEl.addEventListener('pointercancel', onEnd, { once: true });
}

// ── Top-bar rendering ─────────────────────────────────────────
function updateTopBar() {
  openAppsBar.innerHTML = '';
  for (const { id, type } of apps) {
    const def = APP_DEFS[type];
    const btn = document.createElement('button');
    btn.className = 'app-tab-btn' + (id === focusedId ? ' focused' : '');
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', def.title);
    btn.setAttribute('title', def.title);
    btn.innerHTML = def.iconSvg;
    btn.addEventListener('click', () => { focusApp(id); closeAppMenu(); });
    openAppsBar.appendChild(btn);
  }

  const focused = apps.find(a => a.id === focusedId);
  activeTitle.textContent = focused ? APP_DEFS[focused.type].title : '';

  closeBtn.disabled = focusedId === null;

  updateWidthButtons();
}

function updateWidthButtons() {
  const col         = focusedId ? getAppColumn(focusedId) : null;
  const activePreset = col ? col.widthPreset : null;
  document.querySelectorAll('.width-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.width === activePreset ? 'true' : 'false');
  });
}

function updateEmptyState() {
  if (apps.length === 0) {
    emptyState.removeAttribute('hidden');
  } else {
    emptyState.setAttribute('hidden', '');
  }
}

function updateStripLayout() {
  appStrip.classList.toggle('center-apps', columns.length === 1);
}

// ── App navigation ────────────────────────────────────────────
function focusNextApp() {
  const order = getAppOrder();
  if (order.length === 0) return;
  const idx = order.indexOf(focusedId);
  focusApp(order[(idx + 1) % order.length]);
}

function focusPrevApp() {
  const order = getAppOrder();
  if (order.length === 0) return;
  const idx = order.indexOf(focusedId);
  focusApp(order[(idx - 1 + order.length) % order.length]);
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
  requestAnimationFrame(() => {
    const first = appMenu.querySelector('.app-launcher');
    if (first) first.focus();
  });
}

function closeAppMenu() {
  appMenu.setAttribute('hidden', '');
  appMenuBtn.setAttribute('aria-expanded', 'false');
}

function toggleAppMenu() {
  appMenu.hasAttribute('hidden') ? openAppMenu() : closeAppMenu();
}

// ── Help overlay ───────────────────────────────────────────────
function openHelp() {
  helpOverlay.removeAttribute('hidden');
  closeAppMenu();
  requestAnimationFrame(() => helpCloseBtn.focus());
}

function closeHelp() {
  helpOverlay.setAttribute('hidden', '');
}

function toggleHelp() {
  helpOverlay.hasAttribute('hidden') ? openHelp() : closeHelp();
}

// ── Toast ──────────────────────────────────────────────────────
function toast(anchorEl, msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  anchorEl.appendChild(t);
  t.addEventListener('animationend', e => {
    if (e.animationName === 'toastOut') t.remove();
  });
}

// ── SVG icon helpers (toolbar) ────────────────────────────────
const ICONS = {
  zoomIn:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><line x1="10" y1="6.5" x2="10" y2="13.5"/><line x1="6.5" y1="10" x2="13.5" y2="10"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/></svg>`,
  zoomOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><line x1="6.5" y1="10" x2="13.5" y2="10"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/></svg>`,
  share:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>`,
  download:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  print:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`,
  rotate:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zm-.02 4.47H5.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L8.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`,
};

function toolBtn(action, icon, label) {
  return `<button class="tool-btn" data-action="${action}" title="${label}" aria-label="${label}">
    ${ICONS[icon]}
    <span class="lbl">${label}</span>
  </button>`;
}

// ── Document Viewer ────────────────────────────────────────────
const DOC_HTML = `
<h1>Sample Document</h1>
<p class="doc-meta">Jeffrey M. Tackett &nbsp;·&nbsp; June 2026 &nbsp;·&nbsp; Personal Site</p>

<h2>Introduction</h2>
<p>This is a sample document displayed in the Document Viewer. In a real deployment this viewer would load PDF files, markdown documents, or other formatted content from the server. For now it demonstrates the zoom, share, download, and print capabilities of the application shell.</p>

<h2>Features</h2>
<p>The Document Viewer supports the following operations:</p>
<ul>
  <li><strong>Zoom In / Out</strong> — Adjust text size for comfortable reading at any distance.</li>
  <li><strong>Share</strong> — Use the Web Share API (with clipboard fallback) to share the document URL.</li>
  <li><strong>Download</strong> — Save the document content as an HTML file to your device.</li>
  <li><strong>Print</strong> — Open the browser's print dialog with just the document content.</li>
</ul>

<h2>Design Philosophy</h2>
<p>This desktop environment takes inspiration from the Niri tiling window manager for Wayland. Niri uses a scrollable, horizontal strip layout where windows are arranged side by side and the user scrolls to navigate between them.</p>
<p>Unlike traditional tiling window managers, Niri does not try to fill every pixel of the screen — it allows windows to breathe and centre naturally. Apps "want" to be centred on screen, much like the windows in this very interface you're using right now.</p>

<h2>Column Stacking</h2>
<p>Press <strong>[</strong> to consume the last window from the column to the left into the current column (stacking it vertically). Press <strong>]</strong> to expel the focused window out into its own new column to the right. This mirrors the column-stacking behaviour of the Niri window manager.</p>

<h2>Responsive Layout</h2>
<p>The interface adapts to three size tiers:</p>
<ul>
  <li><strong>Small (portrait mobile)</strong> — Apps fill the full viewport width with no edge gap, providing a native app-like feel.</li>
  <li><strong>Medium</strong> — Apps have a 2 rem inset from screen edges; 1 rem of the adjacent app peeks in from the side to hint at horizontal scrolling.</li>
  <li><strong>Large (≥ 1024 px)</strong> — Two apps can be shown side by side, each occupying half the usable area with 1 rem gaps and 2 rem edge insets. A single open app stays centred at its column width without stretching.</li>
</ul>

<h2>Technical Details</h2>
<p>This page is built with vanilla HTML, CSS, and JavaScript — no frameworks or build tools. It uses modern CSS including <code>scroll-snap</code>, <code>backdrop-filter</code>, CSS custom properties, container queries, and logical properties for left-to-right/right-to-left support.</p>
<p>The layout engine computes window widths precisely in JavaScript from the current viewport width, root font size, and the defined gap constants — so all three width presets always respect the spacing rules exactly.</p>

<h2>Lorem Ipsum</h2>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
<p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
`;

function docHtmlPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sample Document — Jeffrey M. Tackett</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; max-width: 68ch; margin: 2.5rem auto; line-height: 1.75; padding: 0 1.5rem; color: #111; }
    h1 { font-size: 1.75rem; margin-bottom: 0.2em; }
    .doc-meta { font-size: 0.8125rem; color: #777; margin-bottom: 2em; padding-bottom: 1em; border-bottom: 1px solid #ddd; }
    h2 { font-size: 1.125rem; color: #069; margin-top: 2em; }
    code { background: #eef5ff; padding: 0.1em 0.3em; border-radius: 0.25em; }
    @media print { body { max-width: 100%; } }
  </style>
</head>
<body>${DOC_HTML}</body>
</html>`;
}

function buildDocViewer() {
  let zoom = 1.0;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('zoom-out', 'zoomOut', 'Zoom Out')}
    <span class="zoom-readout" aria-live="polite">100%</span>
    ${toolBtn('zoom-in',  'zoomIn',  'Zoom In')}
    <span class="toolbar-sep" role="separator"></span>
    ${toolBtn('share',    'share',    'Share')}
    ${toolBtn('download', 'download', 'Download')}
    ${toolBtn('print',    'print',    'Print')}
  `;

  const content = document.createElement('div');
  content.className = 'app-content';

  const scroll = document.createElement('div');
  scroll.className = 'doc-scroll';

  const body = document.createElement('article');
  body.className = 'doc-body';
  body.innerHTML = DOC_HTML;

  scroll.appendChild(body);
  content.appendChild(scroll);
  el.appendChild(toolbar);
  el.appendChild(content);

  const readout = toolbar.querySelector('.zoom-readout');

  function applyZoom() {
    body.style.setProperty('--doc-size', `${zoom}rem`);
    readout.textContent = `${Math.round(zoom * 100)}%`;
  }

  toolbar.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'zoom-in':
        zoom = Math.min(+(zoom + 0.125).toFixed(3), 3);
        applyZoom();
        break;

      case 'zoom-out':
        zoom = Math.max(+(zoom - 0.125).toFixed(3), 0.5);
        applyZoom();
        break;

      case 'share':
        try {
          if (navigator.share) {
            await navigator.share({ title: 'Sample Document', url: location.href });
          } else {
            await navigator.clipboard.writeText(location.href);
            toast(el, 'URL copied to clipboard');
          }
        } catch { /* user cancelled */ }
        break;

      case 'download': {
        const blob = new Blob([docHtmlPage()], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'document.html' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        break;
      }

      case 'print': {
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) { toast(el, 'Allow pop-ups to print'); break; }
        win.document.write(docHtmlPage());
        win.document.close();
        win.addEventListener('load', () => { win.focus(); win.print(); });
        break;
      }
    }
  });

  return el;
}

// ── Image Viewer ───────────────────────────────────────────────
function buildImgViewer() {
  let zoom     = 1.0;
  let rotation = 0;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('zoom-out', 'zoomOut', 'Zoom Out')}
    <span class="zoom-readout" aria-live="polite">100%</span>
    ${toolBtn('zoom-in',  'zoomIn',  'Zoom In')}
    ${toolBtn('rotate',   'rotate',  'Rotate 90°')}
    <span class="toolbar-sep" role="separator"></span>
    ${toolBtn('share',    'share',   'Share')}
  `;

  const content = document.createElement('div');
  content.className = 'app-content';

  const viewport = document.createElement('div');
  viewport.className = 'img-viewport';

  const wrap = document.createElement('div');
  wrap.className = 'img-transform';

  const img = document.createElement('img');
  img.src = 'https://picsum.photos/seed/niri42/1200/800';
  img.alt = 'Sample landscape photograph';
  img.draggable = false;

  wrap.appendChild(img);
  viewport.appendChild(wrap);
  content.appendChild(viewport);
  el.appendChild(toolbar);
  el.appendChild(content);

  const readout = toolbar.querySelector('.zoom-readout');

  function applyTransform() {
    wrap.style.transform = `rotate(${rotation}deg) scale(${zoom})`;
    readout.textContent = `${Math.round(zoom * 100)}%`;
  }

  toolbar.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'zoom-in':
        zoom = Math.min(+(zoom + 0.25).toFixed(2), 6);
        applyTransform();
        break;

      case 'zoom-out':
        zoom = Math.max(+(zoom - 0.25).toFixed(2), 0.25);
        applyTransform();
        break;

      case 'rotate':
        rotation = (rotation + 90) % 360;
        applyTransform();
        break;

      case 'share':
        try {
          if (navigator.share) {
            await navigator.share({ title: 'Sample Image', url: img.src });
          } else {
            await navigator.clipboard.writeText(img.src);
            toast(el, 'Image URL copied to clipboard');
          }
        } catch { /* user cancelled */ }
        break;
    }
  });

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    zoom = Math.min(Math.max(+(zoom + delta).toFixed(2), 0.25), 6);
    applyTransform();
  }, { passive: false });

  return el;
}

// ── File Manager ───────────────────────────────────────────────
function buildFileManager() {
  const FOLDERS   = ['All Files', 'Documents', 'Pictures', 'Videos', 'Posts'];
  const TYPE_KEYS = ['document', 'image', 'video', 'post'];
  const TYPE_LABEL  = { document: 'Docs', image: 'Images', video: 'Videos', post: 'Posts' };
  const FOLDER_TYPE = { Documents: 'document', Pictures: 'image', Videos: 'video', Posts: 'post' };
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  const FM_FILES = [
    { name: 'Pacific Crest Trail Day 1', type: 'post',     folder: 'Posts',     date: new Date(2026, 5, 8),  size: '3.8 KB'  },
    { name: 'trail-sunrise.jpg',          type: 'image',    folder: 'Pictures',  date: new Date(2026, 5, 7),  size: '4.2 MB'  },
    { name: 'annual-review.pdf',          type: 'document', folder: 'Documents', date: new Date(2026, 5, 3),  size: '182 KB'  },
    { name: 'Spring Garden Update',       type: 'post',     folder: 'Posts',     date: new Date(2026, 4, 22), size: '2.1 KB'  },
    { name: 'garden-may.jpg',             type: 'image',    folder: 'Pictures',  date: new Date(2026, 4, 20), size: '2.8 MB'  },
    { name: 'seattle-walk.mp4',           type: 'video',    folder: 'Videos',    date: new Date(2026, 4, 14), size: '124 MB'  },
    { name: 'recipe-notes.txt',           type: 'document', folder: 'Documents', date: new Date(2026, 4, 5),  size: '8 KB'    },
    { name: 'Family Visit Notes',         type: 'post',     folder: 'Posts',     date: new Date(2026, 3, 18), size: '1.6 KB'  },
    { name: 'family-dinner.jpg',          type: 'image',    folder: 'Pictures',  date: new Date(2026, 3, 17), size: '3.1 MB'  },
    { name: 'family-reunion.mp4',         type: 'video',    folder: 'Videos',    date: new Date(2026, 3, 17), size: '890 MB'  },
    { name: 'tax-return-2025.pdf',        type: 'document', folder: 'Documents', date: new Date(2026, 3, 2),  size: '412 KB'  },
    { name: 'Spring Arrives in Seattle',  type: 'post',     folder: 'Posts',     date: new Date(2026, 2, 20), size: '2.4 KB'  },
    { name: 'cherry-blossoms.jpg',        type: 'image',    folder: 'Pictures',  date: new Date(2026, 2, 19), size: '5.7 MB'  },
    { name: 'budget-q1.xlsx',             type: 'document', folder: 'Documents', date: new Date(2026, 2, 2),  size: '68 KB'   },
    { name: 'snowfall-2026.jpg',          type: 'image',    folder: 'Pictures',  date: new Date(2026, 1, 11), size: '2.2 MB'  },
    { name: 'meeting-notes.txt',          type: 'document', folder: 'Documents', date: new Date(2026, 1, 5),  size: '14 KB'   },
    { name: 'winter-walk.mp4',            type: 'video',    folder: 'Videos',    date: new Date(2026, 1, 3),  size: '58 MB'   },
    { name: 'New Year Reflections',       type: 'post',     folder: 'Posts',     date: new Date(2026, 0, 2),  size: '3.2 KB'  },
    { name: 'new-year-fireworks.jpg',     type: 'image',    folder: 'Pictures',  date: new Date(2026, 0, 1),  size: '3.9 MB'  },
    { name: 'goals-2026.txt',             type: 'document', folder: 'Documents', date: new Date(2026, 0, 1),  size: '6 KB'    },
    { name: 'Christmas Morning',          type: 'post',     folder: 'Posts',     date: new Date(2025, 11, 25), size: '2.8 KB' },
    { name: 'christmas-tree.jpg',         type: 'image',    folder: 'Pictures',  date: new Date(2025, 11, 25), size: '4.4 MB' },
    { name: 'xmas-party.mp4',             type: 'video',    folder: 'Videos',    date: new Date(2025, 11, 24), size: '210 MB' },
    { name: 'holiday-budget.xlsx',        type: 'document', folder: 'Documents', date: new Date(2025, 11, 1),  size: '34 KB'  },
    { name: 'Thanksgiving in Ohio',       type: 'post',     folder: 'Posts',     date: new Date(2025, 10, 28), size: '1.9 KB' },
    { name: 'thanksgiving.jpg',           type: 'image',    folder: 'Pictures',  date: new Date(2025, 10, 27), size: '2.6 MB' },
    { name: 'q3-report.pdf',              type: 'document', folder: 'Documents', date: new Date(2025, 10, 10), size: '1.1 MB' },
  ];

  let currentFolder   = 'All Files';
  let viewMode        = 'tile';
  let activeTypes     = new Set(TYPE_KEYS);
  let collapsedGroups = new Set();

  const FM_ICON = {
    folder:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
    document: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 14h8v1.5H8zm0 3h8v1.5H8zm0-6h4v1.5H8z"/></svg>`,
    image:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
    video:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
    post:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
  };

  const TYPE_COLOR = {
    document: 'var(--accent)',
    image:    '#8b5cf6',
    video:    '#f59e0b',
    post:     '#10b981',
    folder:   '#e07b39',
  };

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar fm-toolbar';
  toolbar.innerHTML = `
    <div class="fm-view-toggle" role="group" aria-label="View mode">
      <button class="tool-btn fm-view-btn" data-view="tile" aria-pressed="true" title="Tile view" aria-label="Tile view">
        <svg viewBox="0 0 20 20" fill="currentColor"><rect x="1" y="1" width="7" height="7" rx="1.5"/><rect x="12" y="1" width="7" height="7" rx="1.5"/><rect x="1" y="12" width="7" height="7" rx="1.5"/><rect x="12" y="12" width="7" height="7" rx="1.5"/></svg>
        <span class="lbl">Tile</span>
      </button>
      <button class="tool-btn fm-view-btn" data-view="list" aria-pressed="false" title="List view" aria-label="List view">
        <svg viewBox="0 0 20 20" fill="currentColor"><rect x="1" y="2" width="18" height="3" rx="1.5"/><rect x="1" y="8.5" width="18" height="3" rx="1.5"/><rect x="1" y="15" width="18" height="3" rx="1.5"/></svg>
        <span class="lbl">List</span>
      </button>
    </div>
    <span class="toolbar-sep fm-filter-sep" role="separator"></span>
    <div class="fm-type-filters" role="group" aria-label="File type filters">
      <button class="fm-filter-chip fm-chip-all active" data-filter="all">All</button>
      ${TYPE_KEYS.map(t => `<button class="fm-filter-chip fm-chip-type active" data-filter="${t}" style="--chip-color:${TYPE_COLOR[t]}">${TYPE_LABEL[t]}</button>`).join('')}
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'app-content fm-body';

  const sidebar = document.createElement('nav');
  sidebar.className = 'fm-sidebar';
  sidebar.setAttribute('aria-label', 'Folders');

  for (const folder of FOLDERS) {
    const btn = document.createElement('button');
    btn.className = 'fm-sidebar-btn' + (folder === 'All Files' ? ' active' : '');
    btn.dataset.folder = folder;
    btn.setAttribute('aria-current', folder === 'All Files' ? 'true' : 'false');

    const iconKey = folder === 'All Files' ? 'folder' : FOLDER_TYPE[folder];
    btn.innerHTML = `
      <span class="fm-sidebar-icon" style="color:${folder === 'All Files' ? TYPE_COLOR.folder : TYPE_COLOR[iconKey]}">${FM_ICON[folder === 'All Files' ? 'folder' : iconKey]}</span>
      <span class="fm-sidebar-label">${folder}</span>
    `;
    sidebar.appendChild(btn);
  }

  const main = document.createElement('div');
  main.className = 'fm-main';

  const scroll = document.createElement('div');
  scroll.className = 'fm-scroll';

  main.appendChild(scroll);
  body.appendChild(sidebar);
  body.appendChild(main);
  el.appendChild(toolbar);
  el.appendChild(body);

  function fmDate(d) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildFolderCard(folder, mode) {
    const typeKey = FOLDER_TYPE[folder];
    const card = document.createElement('button');
    card.className = `fm-folder-card fm-folder-card--${mode}`;
    card.dataset.folder = folder;
    const count = FM_FILES.filter(f => f.folder === folder).length;
    if (mode === 'tile') {
      card.innerHTML = `
        <span class="fm-folder-card-icon" style="color:${TYPE_COLOR[typeKey]}">${FM_ICON[typeKey]}</span>
        <span class="fm-folder-card-name">${folder}</span>
        <span class="fm-folder-card-count">${count}</span>
      `;
    } else {
      card.innerHTML = `
        <span class="fm-list-icon" style="color:${TYPE_COLOR.folder}">${FM_ICON.folder}</span>
        <span class="fm-list-name">${folder}</span>
        <span class="fm-list-meta">${count} items</span>
        <span class="fm-list-size"></span>
      `;
    }
    card.addEventListener('click', () => {
      currentFolder = folder;
      updateSidebar();
      render();
    });
    return card;
  }

  function buildFileTile(file) {
    const tile = document.createElement('div');
    tile.className = 'fm-tile';
    tile.innerHTML = `
      <span class="fm-tile-icon" style="color:${TYPE_COLOR[file.type]}">${FM_ICON[file.type]}</span>
      <span class="fm-tile-name">${file.name}</span>
      <span class="fm-tile-date">${fmDate(file.date)}</span>
    `;
    return tile;
  }

  function buildFileRow(file) {
    const row = document.createElement('div');
    row.className = 'fm-list-row';
    row.innerHTML = `
      <span class="fm-list-icon" style="color:${TYPE_COLOR[file.type]}">${FM_ICON[file.type]}</span>
      <span class="fm-list-name">${file.name}</span>
      <span class="fm-list-meta">${fmDate(file.date)}</span>
      <span class="fm-list-size">${file.size}</span>
    `;
    return row;
  }

  function updateSidebar() {
    sidebar.querySelectorAll('.fm-sidebar-btn').forEach(btn => {
      const active = btn.dataset.folder === currentFolder;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function render() {
    const filtered = FM_FILES.filter(f => {
      if (currentFolder !== 'All Files' && f.folder !== currentFolder) return false;
      return activeTypes.has(f.type);
    });

    const groupMap = new Map();
    for (const file of filtered) {
      const yr  = file.date.getFullYear();
      const mo  = file.date.getMonth();
      const key = `${yr}-${String(mo).padStart(2, '0')}`;
      if (!groupMap.has(key)) groupMap.set(key, { year: yr, month: mo, files: [] });
      groupMap.get(key).files.push(file);
    }

    scroll.innerHTML = '';

    if (currentFolder === 'All Files') {
      const foldersRow = document.createElement('div');
      foldersRow.className = viewMode === 'tile' ? 'fm-folder-section fm-folder-tile-row' : 'fm-folder-section fm-folder-list-rows';
      for (const folder of ['Documents', 'Pictures', 'Videos', 'Posts']) {
        foldersRow.appendChild(buildFolderCard(folder, viewMode));
      }
      scroll.appendChild(foldersRow);
    }

    if (groupMap.size === 0) {
      const msg = document.createElement('p');
      msg.className = 'fm-empty-msg';
      msg.textContent = 'No files match the current filters.';
      scroll.appendChild(msg);
      return;
    }

    const nowYear = new Date().getFullYear();

    for (const [key, { year, month, files: gf }] of groupMap) {
      const section = document.createElement('details');
      section.className = 'fm-group';
      if (!collapsedGroups.has(key)) section.open = true;

      section.addEventListener('toggle', () => {
        if (section.open) collapsedGroups.delete(key);
        else collapsedGroups.add(key);
      });

      const summary = document.createElement('summary');
      summary.className = 'fm-group-header';
      const label = year === nowYear ? MONTH_NAMES[month] : `${MONTH_NAMES[month]} ${year}`;
      summary.innerHTML = `
        <svg class="fm-group-arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg>
        <span class="fm-group-label">${label}</span>
        <span class="fm-group-count">${gf.length}</span>
      `;
      section.appendChild(summary);

      const content = document.createElement('div');
      content.className = viewMode === 'tile' ? 'fm-tile-grid' : 'fm-list-rows';

      if (viewMode === 'list') {
        const header = document.createElement('div');
        header.className = 'fm-list-header';
        header.innerHTML = `<span></span><span>Name</span><span>Date</span><span>Size</span>`;
        content.appendChild(header);
      }

      for (const file of gf) {
        content.appendChild(viewMode === 'tile' ? buildFileTile(file) : buildFileRow(file));
      }

      section.appendChild(content);
      scroll.appendChild(section);
    }
  }

  toolbar.addEventListener('click', e => {
    const viewBtn = e.target.closest('.fm-view-btn');
    if (viewBtn) {
      viewMode = viewBtn.dataset.view;
      toolbar.querySelectorAll('.fm-view-btn').forEach(b => {
        b.setAttribute('aria-pressed', b.dataset.view === viewMode ? 'true' : 'false');
      });
      render();
      return;
    }

    const chip = e.target.closest('.fm-filter-chip');
    if (!chip) return;

    if (chip.dataset.filter === 'all') {
      const allActive = activeTypes.size === TYPE_KEYS.length;
      if (allActive) activeTypes.clear();
      else TYPE_KEYS.forEach(t => activeTypes.add(t));
    } else {
      const t = chip.dataset.filter;
      if (activeTypes.has(t)) activeTypes.delete(t);
      else activeTypes.add(t);
    }

    toolbar.querySelectorAll('.fm-chip-type').forEach(c => {
      c.classList.toggle('active', activeTypes.has(c.dataset.filter));
    });
    toolbar.querySelector('.fm-chip-all').classList.toggle('active', activeTypes.size === TYPE_KEYS.length);

    render();
  });

  sidebar.addEventListener('click', e => {
    const btn = e.target.closest('.fm-sidebar-btn');
    if (!btn) return;
    currentFolder = btn.dataset.folder;
    updateSidebar();
    render();
  });

  render();
  return el;
}

// ── Wire global events ───────────────────────────────────────
appMenuBtn.addEventListener('click', e => { e.stopPropagation(); toggleAppMenu(); });

document.querySelectorAll('.app-launcher').forEach(btn => {
  btn.addEventListener('click', () => { openApp(btn.dataset.type); closeAppMenu(); });
});

document.querySelectorAll('.width-btn').forEach(btn => {
  btn.addEventListener('click', () => setFocusedWidth(btn.dataset.width));
});

closeBtn.addEventListener('click', () => { if (focusedId) closeApp(focusedId); });

helpOpenLauncher.addEventListener('click', () => { closeHelp(); openAppMenu(); });

// Close app menu when clicking outside
document.addEventListener('click', e => {
  if (!appMenu.hasAttribute('hidden') &&
      !appMenu.contains(e.target) &&
      e.target !== appMenuBtn &&
      !appMenuBtn.contains(e.target)) {
    closeAppMenu();
  }
});

// Track meta/ctrl key for drag activation
document.addEventListener('keydown', e => {
  if (e.key === 'Meta' || e.key === 'Control') {
    metaHeld = true;
    appStrip.classList.add('mod-held');
  }
});
document.addEventListener('keyup', e => {
  if (e.key === 'Meta' || e.key === 'Control') {
    metaHeld = false;
    appStrip.classList.remove('mod-held');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const menuOpen  = !appMenu.hasAttribute('hidden');
  const helpOpen  = !helpOverlay.hasAttribute('hidden');
  const inContent = e.target.closest('.app-content');
  const isTyping  = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
                    e.target.isContentEditable;

  if (e.key === 'Escape') {
    if (helpOpen) { closeHelp(); appMenuBtn.focus(); return; }
    if (menuOpen) { closeAppMenu(); appMenuBtn.focus(); return; }
    return;
  }

  if (e.key === '?' && !isTyping && !menuOpen) {
    e.preventDefault();
    toggleHelp();
    return;
  }

  // Consume / Expel (bare [ ] — not typing, no overlay)
  if ((e.key === '[' || e.key === ']') && !isTyping && !helpOpen && !menuOpen) {
    e.preventDefault();
    if (e.key === '[') consumeLeft();
    else expelRight();
    return;
  }

  if (helpOpen || menuOpen || isTyping) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
    e.preventDefault();
    openAppMenu();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    focusAppByIndex(parseInt(e.key, 10));
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key === '<') {
    e.preventDefault();
    cycleFocusedWidthNarrower();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === '>') {
    e.preventDefault();
    cycleFocusedWidthWider();
    return;
  }

  if (!inContent) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); focusPrevApp(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusNextApp(); return; }
  }

  if (e.key === 'Tab' && !inContent) {
    e.preventDefault();
    e.shiftKey ? focusPrevApp() : focusNextApp();
    return;
  }
});

helpCloseBtn.addEventListener('click', () => closeHelp());

helpOverlay.addEventListener('click', e => {
  if (e.target === helpOverlay) closeHelp();
});

// ── Init ──────────────────────────────────────────────────────
restoreSession();
updateTopBar();
updateEmptyState();
updateStripLayout();
