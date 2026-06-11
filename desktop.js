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
};

// ── State ─────────────────────────────────────────────────────
/** @type {{ id: string; type: string; widthPreset: string; el: HTMLElement }[]} */
let apps = [];
let focusedId = null;
let nextId = 1;
let _skipSave = false;

// ── DOM refs ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const appMenuBtn   = $('app-menu-btn');
const appMenu      = $('app-menu');
const helpOverlay  = $('help-overlay');
const helpCloseBtn = $('help-close-btn');
const openAppsBar  = $('open-apps-bar');
const activeTitle  = $('active-title');
const closeBtn     = $('close-btn');
const appStrip     = $('app-strip');
const emptyState   = $('empty-state');

// ── Width helpers ─────────────────────────────────────────────
function rem() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize);
}

const EDGE = () => 2 * rem();
const GAP  = () => 1 * rem();

/**
 * Compute px width for width-preset button.
 * Accounts for 2rem edge insets and 1rem inter-window gaps.
 * @param {'full'|'half'|'third'} preset
 */
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
const SESSION_KEY = 'desktop-session-v1';

function saveSession() {
  if (_skipSave) return;
  try {
    const data = apps.map(({ type, widthPreset }) => ({ type, widthPreset }));
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

function safeRemoveSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) { safeRemoveSession(); return; }
    _skipSave = true;
    for (const entry of data) {
      if (typeof entry.type !== 'string' || !APP_DEFS[entry.type]) continue;
      openApp(entry.type);
      const app = apps[apps.length - 1];
      const preset = WIDTH_PRESETS.includes(entry.widthPreset) ? entry.widthPreset : 'full';
      if (app && preset !== 'full') {
        const px = computeWidth(preset);
        app.el.style.setProperty('--app-width', `${Math.max(px, 160)}px`);
        app.widthPreset = preset;
      }
    }
    _skipSave = false;
    saveSession();
  } catch {
    _skipSave = false;
    safeRemoveSession();
  }
}

// ── App lifecycle ─────────────────────────────────────────────
function openApp(type) {
  const def = APP_DEFS[type];
  if (!def) return;

  const id = `app-${nextId++}`;
  const el = def.build(id);
  el.classList.add('app-window');
  el.dataset.id = id;
  el.dataset.type = type;

  el.addEventListener('pointerdown', () => focusApp(id), { capture: true });

  appStrip.appendChild(el);
  apps.push({ id, type, widthPreset: 'full', el });

  focusApp(id);
  updateEmptyState();
  updateStripLayout();
  saveSession();

  // Give the DOM a tick then scroll to the new window
  requestAnimationFrame(() => scrollToApp(id));
}

function closeApp(id) {
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return;

  const { el } = apps[idx];
  apps.splice(idx, 1);
  el.remove();

  if (focusedId === id) {
    focusedId = null;
    if (apps.length > 0) {
      const next = apps[Math.max(0, idx - 1)];
      focusApp(next.id);
    }
  }

  updateTopBar();
  updateEmptyState();
  updateStripLayout();
  saveSession();
}

function focusApp(id) {
  if (focusedId === id) return;

  const prev = apps.find(a => a.id === focusedId);
  if (prev) prev.el.classList.remove('focused');

  focusedId = id;

  const next = apps.find(a => a.id === id);
  if (next) {
    next.el.classList.add('focused');
    requestAnimationFrame(() => scrollToApp(id));
  }

  updateTopBar();
}

function scrollToApp(id) {
  const app = apps.find(a => a.id === id);
  if (!app) return;
  app.el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
}

const WIDTH_PRESETS = ['third', 'half', 'full'];

function setFocusedWidth(preset) {
  if (!focusedId) return;
  const app = apps.find(a => a.id === focusedId);
  if (!app) return;
  const px = computeWidth(preset);
  app.el.style.setProperty('--app-width', `${Math.max(px, 160)}px`);
  app.widthPreset = preset;
  saveSession();
}

function cycleFocusedWidthWider() {
  if (!focusedId) return;
  const app = apps.find(a => a.id === focusedId);
  if (!app) return;
  const idx = WIDTH_PRESETS.indexOf(app.widthPreset);
  const next = WIDTH_PRESETS[Math.min(idx + 1, WIDTH_PRESETS.length - 1)];
  setFocusedWidth(next);
}

function cycleFocusedWidthNarrower() {
  if (!focusedId) return;
  const app = apps.find(a => a.id === focusedId);
  if (!app) return;
  const idx = WIDTH_PRESETS.indexOf(app.widthPreset);
  const next = WIDTH_PRESETS[Math.max(idx - 1, 0)];
  setFocusedWidth(next);
}

// ── Top-bar rendering ─────────────────────────────────────────
function updateTopBar() {
  // App tab buttons
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

  // Active title
  const focused = apps.find(a => a.id === focusedId);
  activeTitle.textContent = focused ? APP_DEFS[focused.type].title : '';

  // Close button
  closeBtn.disabled = focusedId === null;
}

function updateEmptyState() {
  if (apps.length === 0) {
    emptyState.removeAttribute('hidden');
  } else {
    emptyState.setAttribute('hidden', '');
  }
}

/** Center the strip when only 1 app is open (on non-small-portrait). */
function updateStripLayout() {
  appStrip.classList.toggle('center-apps', apps.length === 1);
}

// ── App focus navigation ───────────────────────────────────────
function focusNextApp() {
  if (apps.length === 0) return;
  const idx = apps.findIndex(a => a.id === focusedId);
  const next = apps[(idx + 1) % apps.length];
  focusApp(next.id);
}

function focusPrevApp() {
  if (apps.length === 0) return;
  const idx = apps.findIndex(a => a.id === focusedId);
  const prev = apps[(idx - 1 + apps.length) % apps.length];
  focusApp(prev.id);
}

function focusAppByIndex(n) {
  if (n < 1 || n > apps.length) return;
  focusApp(apps[n - 1].id);
}

// ── App menu ──────────────────────────────────────────────────
function openAppMenu() {
  appMenu.removeAttribute('hidden');
  appMenuBtn.setAttribute('aria-expanded', 'true');
  closeHelp();
  // Move DOM focus into the menu so keyboard users can pick an app
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
  zoomIn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><line x1="10" y1="6.5" x2="10" y2="13.5"/><line x1="6.5" y1="10" x2="13.5" y2="10"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/></svg>`,
  zoomOut:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><line x1="6.5" y1="10" x2="13.5" y2="10"/><line x1="15.5" y1="15.5" x2="20.5" y2="20.5"/></svg>`,
  share:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>`,
  download:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  print:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>`,
  rotate: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zm-.02 4.47H5.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L8.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`,
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

<h2>Responsive Layout</h2>
<p>The interface adapts to three size tiers:</p>
<ul>
  <li><strong>Small (portrait mobile)</strong> — Apps fill the full viewport width with no edge gap, providing a native app-like feel.</li>
  <li><strong>Medium</strong> — Apps have a 2 rem inset from screen edges; 1 rem of the adjacent app peeks in from the side to hint at horizontal scrolling.</li>
  <li><strong>Large (≥ 1024 px)</strong> — Two apps can be shown side by side, each occupying half the usable area with 1 rem gaps and 2 rem edge insets. A single open app stays centred at its column width without stretching.</li>
</ul>

<h2>Window Management</h2>
<p>The top bar provides core window management controls. On the left, the grid button opens the app launcher. The icons next to it represent open apps — click any to focus it. The centre of the bar shows the title of the focused app. On the right, three width-preset buttons resize the focused window to one-third, one-half, or full usable width (accounting for all gaps), and a close button dismisses the focused app.</p>

<h2>Technical Details</h2>
<p>This page is built with vanilla HTML, CSS, and JavaScript — no frameworks or build tools. It uses modern CSS including <code>scroll-snap</code>, <code>backdrop-filter</code>, CSS custom properties, and logical properties for left-to-right/right-to-left support.</p>
<p>The layout engine computes window widths precisely in JavaScript from the current viewport width, root font size, and the defined gap constants — so all three width presets always respect the spacing rules exactly.</p>

<h2>Lorem Ipsum</h2>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
<p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
<p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
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

  // Toolbar
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

  // Content
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
        } catch { /* user cancelled or not supported */ }
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

  // Toolbar
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

  // Content
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
        } catch { /* user cancelled or not supported */ }
        break;
    }
  });

  // Scroll-wheel zoom
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    zoom = Math.min(Math.max(+(zoom + delta).toFixed(2), 0.25), 6);
    applyTransform();
  }, { passive: false });

  return el;
}

// ── Wire events ───────────────────────────────────────────────
appMenuBtn.addEventListener('click', e => { e.stopPropagation(); toggleAppMenu(); });

document.querySelectorAll('.app-launcher').forEach(btn => {
  btn.addEventListener('click', () => { openApp(btn.dataset.type); closeAppMenu(); });
});

document.querySelectorAll('.width-btn').forEach(btn => {
  btn.addEventListener('click', () => setFocusedWidth(btn.dataset.width));
});

closeBtn.addEventListener('click', () => { if (focusedId) closeApp(focusedId); });

// Close app menu when clicking outside
document.addEventListener('click', e => {
  if (!appMenu.hasAttribute('hidden') &&
      !appMenu.contains(e.target) &&
      e.target !== appMenuBtn &&
      !appMenuBtn.contains(e.target)) {
    closeAppMenu();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const menuOpen = !appMenu.hasAttribute('hidden');
  const helpOpen = !helpOverlay.hasAttribute('hidden');
  const inContent = e.target.closest('.app-content');
  const isTyping  = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
                    e.target.isContentEditable;

  // Escape: close overlays
  if (e.key === 'Escape') {
    if (helpOpen) { closeHelp(); appMenuBtn.focus(); return; }
    if (menuOpen) { closeAppMenu(); appMenuBtn.focus(); return; }
    return;
  }

  // ? — toggle help (only when not typing)
  if (e.key === '?' && !isTyping && !menuOpen) {
    e.preventDefault();
    toggleHelp();
    return;
  }

  // Don't capture navigation shortcuts while overlays are open or focus is in a form
  if (helpOpen || menuOpen || isTyping) return;

  // Meta/Ctrl + D — open app launcher
  if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
    e.preventDefault();
    openAppMenu();
    return;
  }

  // Meta/Ctrl + 1–9 — focus app by number
  if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    focusAppByIndex(parseInt(e.key, 10));
    return;
  }

  // Meta/Ctrl + [ / ] — resize focused window narrower / wider
  if ((e.metaKey || e.ctrlKey) && e.key === '[') {
    e.preventDefault();
    cycleFocusedWidthNarrower();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === ']') {
    e.preventDefault();
    cycleFocusedWidthWider();
    return;
  }

  // Arrow keys — cycle apps (skip when focus is inside scrollable app content)
  if (!inContent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); focusPrevApp(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusNextApp(); return; }
  }

  // Tab / Shift+Tab — cycle apps (skip when focus is inside app content)
  if (e.key === 'Tab' && !inContent) {
    e.preventDefault();
    e.shiftKey ? focusPrevApp() : focusNextApp();
    return;
  }
});

helpCloseBtn.addEventListener('click', () => closeHelp());

// Close help when clicking outside its inner panel
helpOverlay.addEventListener('click', e => {
  if (e.target === helpOverlay) closeHelp();
});

// ── Init ──────────────────────────────────────────────────────
restoreSession();
updateTopBar();
updateEmptyState();
updateStripLayout();
