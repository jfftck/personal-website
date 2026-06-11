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
  'media-player': {
    title: 'Media Player',
    iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/>
    </svg>`,
    build: buildMediaPlayer,
  },
};

// ── Inter-app communication ───────────────────────────────────
const appApis   = {}; // { appId: { openFile(url, name, poster?) } }
const appTitles = {}; // { appId: string }

// ── State ─────────────────────────────────────────────────────
let apps      = [];
let columns   = [];
let focusedId = null;
let nextAppId = 1;
let nextColId = 1;
let _skipSave = false;
let metaHeld  = false;
let dragState = null;

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
function rem() { return parseFloat(getComputedStyle(document.documentElement).fontSize); }
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

// ── Markdown renderer ─────────────────────────────────────────
function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(src) {
  const lines = src.split('\n');
  let out = '';
  let inPre = false, preLang = '', preBuf = [];
  let inUL = false, inOL = false;
  let inTbl = false, tblBuf = [];
  let paraBuf = [];

  function flushPara() {
    if (!paraBuf.length) return;
    out += `<p>${inline(paraBuf.join(' ').trim())}</p>\n`;
    paraBuf = [];
  }
  function flushList() {
    if (inUL) { out += '</ul>\n'; inUL = false; }
    if (inOL) { out += '</ol>\n'; inOL = false; }
  }
  function flushTable() {
    if (!inTbl) return;
    inTbl = false;
    if (!tblBuf.length) { tblBuf = []; return; }
    const rows = tblBuf.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    const isSep = r => r.every(c => /^:?-+:?$/.test(c));
    let html = '<table class="md-table">', tbody = false;
    rows.forEach((row, i) => {
      if (isSep(row)) { if (!tbody) { html += '</thead><tbody>'; tbody = true; } return; }
      if (!tbody && i === 0) { html += '<thead><tr>' + row.map(c => `<th>${inline(c)}</th>`).join('') + '</tr>'; return; }
      if (!tbody) { html += '</thead><tbody>'; tbody = true; }
      html += '<tr>' + row.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
    });
    if (!tbody) html += '</thead><tbody>';
    out += html + '</tbody></table>\n';
    tblBuf = [];
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inPre) {
        out += `<pre><code class="lang-${esc(preLang)}">${esc(preBuf.join('\n'))}</code></pre>\n`;
        preBuf = []; inPre = false; preLang = '';
      } else { flushPara(); flushList(); flushTable(); inPre = true; preLang = line.slice(3).trim(); }
      continue;
    }
    if (inPre) { preBuf.push(line); continue; }

    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) { flushPara(); flushList(); flushTable(); out += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>\n`; continue; }

    if (/^(\*\*\*|---|___)\s*$/.test(line.trim()) && line.trim().length >= 3) {
      flushPara(); flushList(); flushTable(); out += '<hr>\n'; continue;
    }

    const tl = line.trim();
    if (tl.startsWith('|') && tl.lastIndexOf('|') > 0) {
      flushPara(); flushList(); inTbl = true; tblBuf.push(tl); continue;
    }
    if (inTbl) flushTable();

    const ulm = line.match(/^[ \t]*[*+-]\s+(.*)/);
    if (ulm) {
      flushPara(); flushTable();
      if (inOL) { out += '</ol>\n'; inOL = false; }
      if (!inUL) { out += '<ul>\n'; inUL = true; }
      out += `<li>${inline(ulm[1])}</li>\n`; continue;
    }
    const olm = line.match(/^[ \t]*\d+\.\s+(.*)/);
    if (olm) {
      flushPara(); flushTable();
      if (inUL) { out += '</ul>\n'; inUL = false; }
      if (!inOL) { out += '<ol>\n'; inOL = true; }
      out += `<li>${inline(olm[1])}</li>\n`; continue;
    }
    if (inUL || inOL) flushList();
    if (!line.trim()) { flushPara(); continue; }
    paraBuf.push(line.trim());
  }
  flushPara(); flushList(); flushTable();
  if (inPre) out += `<pre><code>${esc(preBuf.join('\n'))}</code></pre>\n`;
  return out;
}

// ── Session persistence ────────────────────────────────────────
const SESSION_KEY    = 'desktop-session-v2';
const SESSION_KEY_V1 = 'desktop-session-v1';

function saveSession() {
  if (_skipSave) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 2,
      columns: columns.map(col => ({
        widthPreset: col.widthPreset,
        apps: col.appIds.map(appId => {
          const app = apps.find(a => a.id === appId);
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

function restoreSession() {
  try {
    let raw = localStorage.getItem(SESSION_KEY);
    let isV1 = false;
    if (!raw) { raw = localStorage.getItem(SESSION_KEY_V1); isV1 = true; }
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data) { safeRemoveSession(); return; }

    _skipSave = true;

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
          const col = columns.find(c => c.id === colId);
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

    _skipSave = false;
    saveSession();
    if (focusedId) requestAnimationFrame(() => scrollToApp(focusedId));
  } catch {
    _skipSave = false;
    safeRemoveSession();
  }
}

// ── Context-aware title ────────────────────────────────────────
function setAppTitle(id, title) {
  appTitles[id] = title;
  if (id === focusedId) activeTitle.textContent = title;
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
  handle.setAttribute('title', 'Drag to move · Drop on a zone to swap or stack · Hold ⌘/Ctrl to drag from anywhere');
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
function openApp(type, insertIntoColId = null) {
  const def = APP_DEFS[type];
  if (!def) return null;

  const id = `app-${nextAppId++}`;
  const el = def.build(id);
  el.classList.add('app-window');
  el.dataset.id   = id;
  el.dataset.type = type;

  apps.push({ id, type, el });

  const existingCol = insertIntoColId ? columns.find(c => c.id === insertIntoColId) : null;
  if (existingCol) {
    existingCol.appIds.push(id);
    existingCol.el.appendChild(el);
  } else {
    const colId = `col-${nextColId++}`;
    const colEl = createColEl(colId);
    colEl.appendChild(el);
    colEl.style.setProperty('--app-width', `${computeWidth('full')}px`);
    const col = { id: colId, appIds: [id], widthPreset: 'full', el: colEl };
    columns.push(col);
    appStrip.appendChild(colEl);
    wireColEvents(colEl, colId);
  }

  focusApp(id);
  updateEmptyState();
  updateStripLayout();
  if (!_skipSave) { saveSession(); requestAnimationFrame(() => scrollToApp(id)); }
  return id;
}

function closeApp(id) {
  const appIdx = apps.findIndex(a => a.id === id);
  if (appIdx === -1) return;

  const { el } = apps[appIdx];
  const col = getAppColumn(id);

  apps.splice(appIdx, 1);
  el.remove();
  delete appApis[id];
  delete appTitles[id];

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

// ── Width presets ──────────────────────────────────────────────
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
    col.el.addEventListener('animationend', () => col.el.classList.remove('width-grow'), { once: true });
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
function consumeLeft() {
  if (!focusedId) return;
  const col = getAppColumn(focusedId);
  if (!col) return;
  const colIdx = columns.indexOf(col);
  if (colIdx === 0) return;

  const leftCol = columns[colIdx - 1];
  if (!leftCol.appIds.length) return;

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
  newColEl.style.setProperty('--app-width', `${Math.max(computeWidth(col.widthPreset), 160)}px`);

  const newCol = { id: newColId, appIds: [focusedId], widthPreset: col.widthPreset, el: newColEl };
  columns.splice(colIdx + 1, 0, newCol);
  col.el.after(newColEl);
  wireColEvents(newColEl, newColId);

  saveSession();
  updateTopBar();
  updateStripLayout();
  requestAnimationFrame(() => scrollToApp(focusedId));
}

// ── Column event wiring ────────────────────────────────────────
function wireColEvents(colEl, colId) {
  colEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.col-drag-handle') || metaHeld) {
      e.preventDefault();
      e.stopImmediatePropagation();
      startColDrag(colId, e, colEl);
      return;
    }
    const appEl = e.target.closest('.app-window');
    if (appEl && appEl.dataset.id) focusApp(appEl.dataset.id);
  }, { capture: true });
}

// ── Column merge helper ────────────────────────────────────────
function mergeColInto(fromCol, toCol, atTop, fromIdx) {
  for (const appId of [...fromCol.appIds]) {
    const app = apps.find(a => a.id === appId);
    if (!app) continue;
    fromCol.appIds.splice(fromCol.appIds.indexOf(appId), 1);
    app.el.remove();
    if (atTop) {
      toCol.appIds.unshift(appId);
      const firstWin = toCol.el.querySelector('.app-window');
      if (firstWin) toCol.el.insertBefore(app.el, firstWin);
      else          toCol.el.appendChild(app.el);
    } else {
      toCol.appIds.push(appId);
      toCol.el.appendChild(app.el);
    }
  }
  fromCol.el.remove();
  columns.splice(fromIdx, 1);
}

// ── Visual drag-and-drop ───────────────────────────────────────
function startColDrag(colId, e, colEl) {
  if (dragState) return;

  const dragIdx = columns.findIndex(c => c.id === colId);
  if (dragIdx === -1) return;

  const origRect = colEl.getBoundingClientRect();
  const startX   = e.clientX;
  const startY   = e.clientY;

  // ── Ghost: full-size floating clone ───────────────────────────
  const ghost = colEl.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.removeAttribute('data-col-id');
  Object.assign(ghost.style, {
    left:      origRect.left   + 'px',
    top:       origRect.top    + 'px',
    width:     origRect.width  + 'px',
    height:    origRect.height + 'px',
    transform: 'none',
  });
  document.body.appendChild(ghost);

  // ── Placeholder: narrow slot in original position ──────────────
  colEl.classList.add('col-placeholder');

  // ── Drop zones ─────────────────────────────────────────────────
  const zones = [];      // { action, rect:{left,top,width,height}, el }
  let hoveredZone = null;

  function buildZones() {
    zones.forEach(z => z.el.remove());
    zones.length = 0;

    const leftCol  = dragIdx > 0                  ? columns[dragIdx - 1] : null;
    const rightCol = dragIdx < columns.length - 1 ? columns[dragIdx + 1] : null;

    function addZone(action, r) {
      const el = document.createElement('div');
      el.className = 'drag-zone';
      Object.assign(el.style, {
        left:   r.left   + 'px',
        top:    r.top    + 'px',
        width:  r.width  + 'px',
        height: r.height + 'px',
      });
      document.body.appendChild(el);
      zones.push({ action, rect: r, el });
    }

    if (leftCol) {
      const lr = leftCol.el.getBoundingClientRect();
      if (lr.width > 1) {
        const w6 = lr.width  / 6;
        const h6 = lr.height / 6;
        // Stack zones span full width, at top/bottom 1/6 height
        addZone('stack-top-left',    { left: lr.left,        top: lr.top,          width: lr.width, height: h6              });
        addZone('stack-bottom-left', { left: lr.left,        top: lr.bottom - h6,  width: lr.width, height: h6              });
        // Swap zone: right 1/6 of column, middle 4/6 height (avoids overlap with stack zones)
        addZone('swap-left',         { left: lr.right - w6,  top: lr.top + h6,     width: w6,       height: lr.height - 2 * h6 });
      }
    }

    if (rightCol) {
      const rr = rightCol.el.getBoundingClientRect();
      if (rr.width > 1) {
        const w6 = rr.width  / 6;
        const h6 = rr.height / 6;
        addZone('stack-top-right',    { left: rr.left,        top: rr.top,          width: rr.width, height: h6              });
        addZone('stack-bottom-right', { left: rr.left,        top: rr.bottom - h6,  width: rr.width, height: h6              });
        addZone('swap-right',         { left: rr.left,        top: rr.top + h6,     width: w6,       height: rr.height - 2 * h6 });
      }
    }
  }

  requestAnimationFrame(buildZones);

  dragState = { colId, colEl, pointerId: e.pointerId };
  try { colEl.setPointerCapture(e.pointerId); } catch { /* */ }

  // ── Hit test (stack zones take priority over swap zones) ───────
  function hitTest(px, py) {
    for (const z of zones) {
      if (!z.action.startsWith('stack-')) continue;
      const r = z.rect;
      if (px >= r.left && px < r.left + r.width && py >= r.top && py < r.top + r.height) return z;
    }
    for (const z of zones) {
      if (!z.action.startsWith('swap-')) continue;
      const r = z.rect;
      if (px >= r.left && px < r.left + r.width && py >= r.top && py < r.top + r.height) return z;
    }
    return null;
  }

  function cleanup() {
    dragState = null;
    zones.forEach(z => z.el.remove());
    zones.length = 0;
    if (ghost.parentNode) ghost.remove();
    try { colEl.releasePointerCapture(e.pointerId); } catch { /* */ }
    colEl.removeEventListener('pointermove', onMove);
    colEl.removeEventListener('pointerup',   onEnd);
    colEl.removeEventListener('pointercancel', onEnd);
  }

  function onMove(ev) {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    ghost.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px)`;

    const hit = hitTest(ev.clientX, ev.clientY);
    if (hit !== hoveredZone) {
      if (hoveredZone) hoveredZone.el.classList.remove('hovered');
      hoveredZone = hit;
      if (hoveredZone) hoveredZone.el.classList.add('hovered');
    }
  }

  function onEnd(ev) {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    const action = hoveredZone ? hoveredZone.action : null;

    if (action === 'stack-top-left' && dragIdx > 0) {
      mergeColInto(columns[dragIdx], columns[dragIdx - 1], true,  dragIdx);

    } else if (action === 'stack-bottom-left' && dragIdx > 0) {
      mergeColInto(columns[dragIdx], columns[dragIdx - 1], false, dragIdx);

    } else if (action === 'stack-top-right' && dragIdx < columns.length - 1) {
      mergeColInto(columns[dragIdx], columns[dragIdx + 1], true,  dragIdx);

    } else if (action === 'stack-bottom-right' && dragIdx < columns.length - 1) {
      mergeColInto(columns[dragIdx], columns[dragIdx + 1], false, dragIdx);

    } else {
      // Swap or cancel: restore placeholder to full-width column
      colEl.classList.remove('col-placeholder');
      if (action === 'swap-left' && dragIdx > 0) {
        const ti = dragIdx - 1;
        columns[ti].el.before(colEl);
        [columns[dragIdx], columns[ti]] = [columns[ti], columns[dragIdx]];
      } else if (action === 'swap-right' && dragIdx < columns.length - 1) {
        const ti = dragIdx + 1;
        columns[ti].el.after(colEl);
        [columns[dragIdx], columns[ti]] = [columns[ti], columns[dragIdx]];
      }
      // null → cancel, column stays in original slot
    }

    updateStripLayout();
    saveSession();
    updateTopBar();
    cleanup();
  }

  colEl.addEventListener('pointermove', onMove);
  colEl.addEventListener('pointerup',   onEnd, { once: true });
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
  const def     = focused ? APP_DEFS[focused.type] : null;
  activeTitle.textContent = (focusedId && appTitles[focusedId]) || (def ? def.title : '');

  closeBtn.disabled = focusedId === null;
  updateWidthButtons();
}

function updateWidthButtons() {
  const col = focusedId ? getAppColumn(focusedId) : null;
  const activePreset = col ? col.widthPreset : null;
  document.querySelectorAll('.width-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.width === activePreset ? 'true' : 'false');
  });
}

function updateEmptyState() {
  apps.length === 0 ? emptyState.removeAttribute('hidden') : emptyState.setAttribute('hidden', '');
}

function updateStripLayout() {
  appStrip.classList.toggle('center-apps', columns.length === 1);
}

// ── App navigation ────────────────────────────────────────────
function focusNextApp() {
  const order = getAppOrder();
  if (!order.length) return;
  focusApp(order[(order.indexOf(focusedId) + 1) % order.length]);
}

function focusPrevApp() {
  const order = getAppOrder();
  if (!order.length) return;
  focusApp(order[(order.indexOf(focusedId) - 1 + order.length) % order.length]);
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
  requestAnimationFrame(() => { const f = appMenu.querySelector('.app-launcher'); if (f) f.focus(); });
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
function closeHelp() { helpOverlay.setAttribute('hidden', ''); }
function toggleHelp() { helpOverlay.hasAttribute('hidden') ? openHelp() : closeHelp(); }

// ── Toast ──────────────────────────────────────────────────────
function toast(anchorEl, msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  anchorEl.appendChild(t);
  t.addEventListener('animationend', e => { if (e.animationName === 'toastOut') t.remove(); });
}

// ── File opener ───────────────────────────────────────────────
function requestOpenFile(file) {
  const typeToApp = { document: 'doc-viewer', image: 'img-viewer', video: 'media-player' };
  const appType   = typeToApp[file.type] || 'doc-viewer';
  const newId = openApp(appType);
  if (newId) appApis[newId]?.openFile(file.url, file.displayName, file.poster);
}

// ── Icon helpers (toolbar) ────────────────────────────────────
const ICONS = {
  zoomIn:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><line x1="10" y1="6.5" x2="10" y2="13.5"/><line x1="6.5" y1="10" x2="13.5" y2="10"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/></svg>`,
  zoomOut:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><line x1="6.5" y1="10" x2="13.5" y2="10"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/></svg>`,
  share:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  print:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`,
  rotate:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zm-.02 4.47H5.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L8.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`,
};

function toolBtn(action, icon, label) {
  return `<button class="tool-btn" data-action="${action}" title="${label}" aria-label="${label}">
    ${ICONS[icon]}<span class="lbl">${label}</span>
  </button>`;
}

// ── Document Viewer ────────────────────────────────────────────
function buildDocViewer(id) {
  let docFontPct  = 100;
  let currentFile = null;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('zoom-out', 'zoomOut', 'Zoom Out')}
    <span class="zoom-readout" aria-live="polite">100%</span>
    ${toolBtn('zoom-in',  'zoomIn',  'Zoom In')}
    <span class="toolbar-sep"></span>
    ${toolBtn('share',    'share',    'Share')}
    ${toolBtn('download', 'download', 'Download')}
    ${toolBtn('print',    'print',    'Print')}
  `;

  const content  = document.createElement('div');
  content.className = 'app-content';

  const docScroll = document.createElement('div');
  docScroll.className = 'doc-scroll';

  const docBody = document.createElement('div');
  docBody.className = 'doc-body';

  const zoomReadout = toolbar.querySelector('.zoom-readout');

  // Default state
  docBody.innerHTML = `
    <div class="doc-welcome">
      <svg viewBox="0 0 24 24" fill="currentColor" class="doc-welcome-icon" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      </svg>
      <p>Open a document from the <strong>File Manager</strong> to get started.</p>
    </div>
  `;

  function applyZoom() {
    docBody.style.setProperty('--doc-size', `${docFontPct / 100}rem`);
    zoomReadout.textContent = `${docFontPct}%`;
  }

  function loadFile(url) {
    docBody.innerHTML = '<p class="doc-status">Loading\u2026</p>';
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(text => {
        docBody.innerHTML = renderMarkdown(text);
        docScroll.scrollTop = 0;
      })
      .catch(err => {
        docBody.innerHTML = `<p class="doc-status doc-error">\u26a0\ufe0f Could not load: ${esc(err.message)}</p>`;
      });
  }

  // Register API
  appApis[id] = {
    openFile: (url, name) => {
      currentFile = { url, name };
      setAppTitle(id, name);
      loadFile(url);
    },
  };

  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'zoom-in':
        docFontPct = Math.min(docFontPct + 10, 160);
        applyZoom();
        break;
      case 'zoom-out':
        docFontPct = Math.max(docFontPct - 10, 60);
        applyZoom();
        break;
      case 'share': {
        const url = currentFile ? new URL(currentFile.url, location.href).href : location.href;
        if (navigator.share) {
          navigator.share({ title: currentFile?.name ?? 'Document', url }).catch(() => {});
        } else {
          navigator.clipboard.writeText(url).then(() => toast(el, 'Link copied!')).catch(() => {});
        }
        break;
      }
      case 'download': {
        if (!currentFile) return;
        const a = document.createElement('a');
        a.href = currentFile.url;
        a.download = currentFile.name;
        a.click();
        break;
      }
      case 'print': {
        const win = window.open('', '_blank', 'width=800,height=600');
        if (!win) return;
        win.document.write(`<!doctype html><html><head><title>${esc(currentFile?.name ?? 'Document')}</title>
          <style>body{font-family:Georgia,serif;max-width:70ch;margin:2rem auto;line-height:1.7}
          table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.4em .7em;text-align:left}
          pre{background:#f4f4f4;padding:1em;overflow:auto}code{background:#f4f4f4;padding:.1em .3em}hr{border:none;border-top:1px solid #ccc}</style>
          </head><body>${docBody.innerHTML}</body></html>`);
        win.document.close();
        win.print();
        break;
      }
    }
  });

  docScroll.appendChild(docBody);
  content.appendChild(docScroll);
  el.appendChild(toolbar);
  el.appendChild(content);
  return el;
}

// ── Image Viewer ───────────────────────────────────────────────
function buildImgViewer(id) {
  let scale = 1, rot = 0, panX = 0, panY = 0;
  let isPanning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
  let pinching = false, pinchDist0 = 0, scale0 = 1;
  let currentFile = null;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('zoom-out', 'zoomOut', 'Zoom Out')}
    ${toolBtn('zoom-in',  'zoomIn',  'Zoom In')}
    ${toolBtn('rotate',   'rotate',  'Rotate')}
    <span class="toolbar-sep"></span>
    ${toolBtn('share',    'share',    'Share')}
    ${toolBtn('download', 'download', 'Download')}
  `;

  const content   = document.createElement('div');
  content.className = 'app-content';

  const viewport  = document.createElement('div');
  viewport.className = 'img-viewport';

  const transform = document.createElement('div');
  transform.className = 'img-transform';

  const img = document.createElement('img');
  img.alt = 'Image';
  const seed = Math.random().toString(36).slice(2, 8);
  img.src = `https://picsum.photos/seed/${seed}/1200/800`;

  function applyTransform() {
    transform.style.transform = `translate(${panX}px, ${panY}px) scale(${scale}) rotate(${rot}deg)`;
  }

  function resetTransform() { scale = 1; rot = 0; panX = 0; panY = 0; applyTransform(); }

  // Register API
  appApis[id] = {
    openFile: (url, name) => {
      currentFile = { url, name };
      setAppTitle(id, name);
      img.src = url;
      img.alt = name;
      resetTransform();
    },
  };

  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'zoom-in':  scale = Math.min(scale * 1.25, 8); applyTransform(); break;
      case 'zoom-out': scale = Math.max(scale / 1.25, 0.1); applyTransform(); break;
      case 'rotate':   rot   = (rot + 90) % 360; applyTransform(); break;
      case 'share': {
        const url = currentFile ? new URL(currentFile.url, location.href).href : img.src;
        if (navigator.share) navigator.share({ title: currentFile?.name ?? 'Image', url }).catch(() => {});
        else navigator.clipboard.writeText(url).then(() => toast(el, 'Link copied!')).catch(() => {});
        break;
      }
      case 'download': {
        const a = document.createElement('a');
        a.href = currentFile?.url ?? img.src;
        a.download = currentFile?.name ?? 'image';
        a.click();
        break;
      }
    }
  });

  // Wheel zoom
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    scale = Math.min(Math.max(scale * factor, 0.1), 8);
    applyTransform();
  }, { passive: false });

  // Pan
  viewport.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    isPanning = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panOriginX = panX; panOriginY = panY;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', e => {
    if (!isPanning) return;
    panX = panOriginX + e.clientX - panStartX;
    panY = panOriginY + e.clientY - panStartY;
    applyTransform();
  });
  viewport.addEventListener('pointerup',     () => { isPanning = false; });
  viewport.addEventListener('pointercancel', () => { isPanning = false; });

  // Pinch-to-zoom (touch)
  function touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
  viewport.addEventListener('touchstart', e => {
    if (e.touches.length === 2) { pinching = true; pinchDist0 = touchDist(e.touches); scale0 = scale; }
  }, { passive: true });
  viewport.addEventListener('touchmove', e => {
    if (!pinching || e.touches.length < 2) return;
    const d = touchDist(e.touches);
    scale = Math.min(Math.max(scale0 * (d / pinchDist0), 0.1), 8);
    applyTransform();
  }, { passive: true });
  viewport.addEventListener('touchend', () => { pinching = false; });

  // Double-click reset
  viewport.addEventListener('dblclick', () => resetTransform());

  transform.appendChild(img);
  viewport.appendChild(transform);
  content.appendChild(viewport);
  el.appendChild(toolbar);
  el.appendChild(content);
  return el;
}

// ── Media Player ───────────────────────────────────────────────
function buildMediaPlayer(id) {
  let currentFile = null;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    <span class="media-title-lbl" id="media-title-${id}">No file loaded</span>
    <span class="toolbar-sep"></span>
    ${toolBtn('external', 'external', 'Open in new tab')}
  `;

  const titleLbl = toolbar.querySelector(`#media-title-${id}`);

  const content = document.createElement('div');
  content.className = 'app-content';

  const wrapper = document.createElement('div');
  wrapper.className = 'media-player-wrapper';

  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'media-player-empty';
  emptyDiv.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" class="media-empty-icon" aria-hidden="true">
      <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/>
    </svg>
    <p>Open a video from the <strong>File Manager</strong> to get started.</p>
  `;

  const video = document.createElement('video');
  video.className = 'media-video';
  video.controls  = true;
  video.preload   = 'metadata';
  video.setAttribute('playsinline', '');
  video.hidden = true;

  // Register API
  appApis[id] = {
    openFile: (url, name, poster) => {
      currentFile = { url, name, poster };
      setAppTitle(id, name);
      titleLbl.textContent = name;
      video.poster = poster || '';
      video.src    = url;
      video.load();
      emptyDiv.hidden = true;
      video.hidden    = false;
    },
  };

  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'external' && currentFile) {
      window.open(currentFile.url, '_blank', 'noopener');
    }
  });

  wrapper.appendChild(emptyDiv);
  wrapper.appendChild(video);
  content.appendChild(wrapper);
  el.appendChild(toolbar);
  el.appendChild(content);
  return el;
}

// ── File Manager ───────────────────────────────────────────────
function buildFileManager(id) {
  const FOLDERS_DEF = [
    { id: 'posts',     label: 'Posts',     color: '#10b981' },
    { id: 'documents', label: 'Documents', color: 'var(--accent)' },
    { id: 'pictures',  label: 'Pictures',  color: '#8b5cf6' },
    { id: 'videos',    label: 'Videos',    color: '#f59e0b' },
  ];

  const FOLDER_ICONS = {
    posts:     `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`,
    documents: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`,
    pictures:  `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
    videos:    `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  };

  const TYPE_ICONS = {
    document: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`,
    image:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
    video:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  };

  const TYPE_COLOR = { document: 'var(--accent)', image: '#8b5cf6', video: '#f59e0b' };
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let currentPath = '/';
  let viewMode    = 'tile';
  const fileCache      = {};
  const _fetching      = {};
  const collapsedGroups = new Set();

  function parseEntry(folder, entry) {
    const { filename, url: mUrl, poster, size } = entry;
    const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
    if (!m) return null;
    const [, yyyy, mm, dd, rest] = m;
    const date     = new Date(+yyyy, +mm - 1, +dd);
    const dotIdx   = rest.lastIndexOf('.');
    const ext      = dotIdx >= 0 ? rest.slice(dotIdx).toLowerCase() : '';
    const rawName  = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
    const displayName = rawName.replace(/_/g, ' ');
    const typeMap  = {
      md:'document', txt:'document', pdf:'document', xlsx:'document', doc:'document', docx:'document',
      jpg:'image', jpeg:'image', png:'image', gif:'image', webp:'image', svg:'image',
      mp4:'video', webm:'video', mov:'video', avi:'video',
    };
    const type = typeMap[ext.slice(1)] || 'document';
    const url  = mUrl || `${folder}/${encodeURIComponent(filename)}`;
    return { filename, displayName, date, type, url, poster: poster || null, size: size || '\u2014', folder };
  }

  async function ensureFolder(folder) {
    if (fileCache[folder] !== undefined) return;
    if (_fetching[folder])               return _fetching[folder];
    _fetching[folder] = (async () => {
      try {
        const r = await fetch(`${folder}/manifest.json`);
        if (!r.ok) throw new Error(r.status);
        fileCache[folder] = (await r.json()).map(e => parseEntry(folder, e)).filter(Boolean);
      } catch {
        fileCache[folder] = [];
      }
      delete _fetching[folder];
    })();
    return _fetching[folder];
  }

  // ── Build DOM ─────────────────────────────────────────────────
  const el = document.createElement('div');

  // Toolbar (view toggle only)
  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar fm-toolbar';
  toolbar.innerHTML = `
    <div class="fm-view-toggle" role="group" aria-label="View mode">
      <button class="tool-btn fm-view-btn" data-view="tile" aria-pressed="true"  title="Tile view"  aria-label="Tile view">
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>
        <span class="lbl">Tile</span>
      </button>
      <button class="tool-btn fm-view-btn" data-view="list" aria-pressed="false" title="List view"  aria-label="List view">
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
        <span class="lbl">List</span>
      </button>
    </div>
  `;

  const content = document.createElement('div');
  content.className = 'app-content';

  const layout = document.createElement('div');
  layout.className = 'fm-layout';

  // Sidebar
  const sidebar = document.createElement('nav');
  sidebar.className = 'fm-sidebar';
  sidebar.setAttribute('aria-label', 'Folders');

  const homeBtn = document.createElement('button');
  homeBtn.className = 'fm-sidebar-btn active';
  homeBtn.dataset.path = '/';
  homeBtn.setAttribute('aria-current', 'true');
  homeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
    </svg>
    <span class="fm-sidebar-label">/home</span>
  `;
  sidebar.appendChild(homeBtn);

  FOLDERS_DEF.forEach(fd => {
    const btn = document.createElement('button');
    btn.className = 'fm-sidebar-btn';
    btn.dataset.path = fd.id;
    btn.setAttribute('aria-current', 'false');
    btn.innerHTML = `
      <span style="color:${fd.color}">${FOLDER_ICONS[fd.id]}</span>
      <span class="fm-sidebar-label">${fd.label}</span>
    `;
    sidebar.appendChild(btn);
  });

  const main = document.createElement('div');
  main.className = 'fm-main';

  const scroll = document.createElement('div');
  scroll.className = 'fm-scroll';

  // ── Timeline render helpers ───────────────────────────────────
  function fmDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildFileTile(file) {
    const tile = document.createElement('div');
    tile.className = 'fm-tile';
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('title', file.displayName);
    tile.innerHTML = `
      <span class="fm-tile-icon" style="color:${TYPE_COLOR[file.type] || TYPE_COLOR.document}">${TYPE_ICONS[file.type] || TYPE_ICONS.document}</span>
      <span class="fm-tile-name">${file.displayName}</span>
      <span class="fm-tile-date">${fmDate(file.date)}</span>
    `;
    tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestOpenFile(file); } });
    return tile;
  }

  function buildFileRow(file) {
    const row = document.createElement('div');
    row.className = 'fm-list-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('title', file.displayName);
    row.innerHTML = `
      <span class="fm-list-icon" style="color:${TYPE_COLOR[file.type] || TYPE_COLOR.document}">${TYPE_ICONS[file.type] || TYPE_ICONS.document}</span>
      <span class="fm-list-name">${file.displayName}</span>
      <span class="fm-list-meta">${fmDate(file.date)}</span>
      <span class="fm-list-size">${file.size}</span>
    `;
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestOpenFile(file); } });
    return row;
  }

  function buildTimeline(container, files) {
    const grouped  = new Map();
    const nowYear  = new Date().getFullYear();
    for (const f of files) {
      const yr = f.date.getFullYear(), mo = f.date.getMonth();
      const k  = `${yr}-${String(mo).padStart(2, '0')}`;
      if (!grouped.has(k)) grouped.set(k, { year: yr, month: mo, files: [] });
      grouped.get(k).files.push(f);
    }

    if (!grouped.size) {
      const msg = document.createElement('p');
      msg.className = 'fm-empty-msg fm-empty-small';
      msg.textContent = 'No files';
      container.appendChild(msg);
      return;
    }

    for (const [k, { year, month, files: gf }] of grouped) {
      const section = document.createElement('details');
      section.className = 'fm-group';
      if (!collapsedGroups.has(k)) section.open = true;
      section.addEventListener('toggle', () => {
        if (section.open) collapsedGroups.delete(k); else collapsedGroups.add(k);
      });

      const summary = document.createElement('summary');
      summary.className = 'fm-group-header';
      const label = year === nowYear ? MONTHS[month] : `${MONTHS[month]} ${year}`;
      summary.innerHTML = `
        <svg class="fm-group-arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg>
        <span class="fm-group-label">${label}</span>
        <span class="fm-group-count">${gf.length}</span>
      `;
      section.appendChild(summary);

      const grid = document.createElement('div');
      grid.className = viewMode === 'tile' ? 'fm-tile-grid' : 'fm-list-rows';

      if (viewMode === 'list') {
        const hdr = document.createElement('div');
        hdr.className = 'fm-list-header';
        hdr.innerHTML = '<span></span><span>Name</span><span>Date</span><span>Size</span>';
        grid.appendChild(hdr);
      }

      for (const file of gf) {
        const item = viewMode === 'tile' ? buildFileTile(file) : buildFileRow(file);
        item.addEventListener('click', () => requestOpenFile(file));
        grid.appendChild(item);
      }

      section.appendChild(grid);
      container.appendChild(section);
    }
  }

  function buildFolderItem(fd) {
    const cached = fileCache[fd.id];
    const countStr = cached !== undefined
      ? `${cached.length} item${cached.length !== 1 ? 's' : ''}`
      : '\u2014';

    if (viewMode === 'tile') {
      const tile = document.createElement('div');
      tile.className = 'fm-tile';
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('title', fd.label);
      tile.innerHTML = `
        <span class="fm-tile-icon" style="color:${fd.color}">${FOLDER_ICONS[fd.id]}</span>
        <span class="fm-tile-name">${fd.label}</span>
        <span class="fm-tile-date">${countStr}</span>
      `;
      tile.addEventListener('click', () => navigateTo(fd.id));
      tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateTo(fd.id); } });
      return tile;
    } else {
      const row = document.createElement('div');
      row.className = 'fm-list-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('title', fd.label);
      row.innerHTML = `
        <span class="fm-list-icon" style="color:${fd.color}">${FOLDER_ICONS[fd.id]}</span>
        <span class="fm-list-name">${fd.label}</span>
        <span class="fm-list-meta">${countStr}</span>
        <span class="fm-list-size">\u2014</span>
      `;
      row.addEventListener('click', () => navigateTo(fd.id));
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateTo(fd.id); } });
      return row;
    }
  }

  // ── Render ────────────────────────────────────────────────────
  function renderContent() {
    scroll.innerHTML = '';
    if (currentPath === '/') {
      const grid = document.createElement('div');
      grid.className = viewMode === 'tile' ? 'fm-tile-grid' : 'fm-list-rows';
      FOLDERS_DEF.forEach(fd => grid.appendChild(buildFolderItem(fd)));
      scroll.appendChild(grid);
    } else {
      buildTimeline(scroll, fileCache[currentPath] || []);
    }
  }

  function render() {
    if (currentPath === '/') {
      renderContent();
      return;
    }
    const pending = fileCache[currentPath] === undefined ? [currentPath] : [];
    if (pending.length > 0) {
      scroll.innerHTML = '<p class="fm-empty-msg">Loading\u2026</p>';
      Promise.all(pending.map(ensureFolder)).then(renderContent);
    } else {
      renderContent();
    }
  }

  function updateSidebar() {
    sidebar.querySelectorAll('.fm-sidebar-btn').forEach(btn => {
      const active = btn.dataset.path === currentPath;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'true' : 'false');
    });
    const fd = FOLDERS_DEF.find(f => f.id === currentPath);
    setAppTitle(id, currentPath === '/' ? '/home' : `/home/${fd ? fd.label : currentPath}`);
  }

  function navigateTo(path) {
    currentPath = path;
    updateSidebar();
    render();
  }

  // ── Events ────────────────────────────────────────────────────
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('.fm-view-btn');
    if (!btn) return;
    viewMode = btn.dataset.view;
    toolbar.querySelectorAll('.fm-view-btn').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.view === viewMode ? 'true' : 'false');
    });
    render();
  });

  sidebar.addEventListener('click', e => {
    const btn = e.target.closest('.fm-sidebar-btn');
    if (!btn) return;
    navigateTo(btn.dataset.path);
  });

  // Register API
  appApis[id] = { openFile: null };
  setAppTitle(id, '/home');

  main.appendChild(scroll);
  layout.appendChild(sidebar);
  layout.appendChild(main);
  content.appendChild(layout);
  el.appendChild(toolbar);
  el.appendChild(content);

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

document.addEventListener('click', e => {
  if (!appMenu.hasAttribute('hidden') &&
      !appMenu.contains(e.target) &&
      e.target !== appMenuBtn &&
      !appMenuBtn.contains(e.target)) closeAppMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Meta' || e.key === 'Control') { metaHeld = true;  appStrip.classList.add('mod-held'); }
});
document.addEventListener('keyup', e => {
  if (e.key === 'Meta' || e.key === 'Control') { metaHeld = false; appStrip.classList.remove('mod-held'); }
});

document.addEventListener('keydown', e => {
  const menuOpen  = !appMenu.hasAttribute('hidden');
  const helpOpen  = !helpOverlay.hasAttribute('hidden');
  const inContent = e.target.closest('.app-content');
  const isTyping  = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

  if (e.key === 'Escape') {
    if (helpOpen) { closeHelp(); appMenuBtn.focus(); return; }
    if (menuOpen) { closeAppMenu(); appMenuBtn.focus(); return; }
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

// ── Init ──────────────────────────────────────────────────────
restoreSession();
updateTopBar();
updateEmptyState();
updateStripLayout();
