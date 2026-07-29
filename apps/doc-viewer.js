'use strict';

import { toolBtn }             from './toolbar.js';
import { renderMarkdown, esc } from '../shared/markdown.js';

const MANIFEST_SOURCES = [
  { folder: 'documents', label: 'Documents' },
  { folder: 'posts',     label: 'Posts' },
];

function parseManifestEntry(folder, entry) {
  const { filename, url: mUrl, size } = entry;
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
  if (!m) return null;
  const [, yyyy, mm, dd, rest] = m;
  const dotIdx    = rest.lastIndexOf('.');
  const rawName   = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
  const displayName = rawName.replace(/_/g, ' ');
  const ext       = dotIdx >= 0 ? rest.slice(dotIdx + 1).toLowerCase() : 'md';
  const url       = mUrl || `${folder}/${encodeURIComponent(filename)}`;
  const date      = `${yyyy}-${mm}-${dd}`;
  return { filename, displayName, url, ext, date, folder, size: size || '—' };
}

async function fetchDocManifest(folder) {
  try {
    const r = await fetch(`${folder}/manifest.json`);
    if (!r.ok) return [];
    const json = await r.json();
    return json.map(e => parseManifestEntry(folder, e)).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Document Viewer ────────────────────────────────────────────
export function buildDocViewer(id, ctx) {
  let docFontPct  = 100;
  let currentFile = null;
  let allDocs     = [];
  let sidebarOpen = false;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('open', 'open', 'Browse documents')}
    <span class="toolbar-sep"></span>
    ${toolBtn('zoom-out', 'zoomOut', 'Zoom Out')}
    <span class="zoom-readout" aria-live="polite">100%</span>
    ${toolBtn('zoom-in',  'zoomIn',  'Zoom In')}
    <span class="toolbar-sep"></span>
    ${toolBtn('share',    'share',    'Share')}
    ${toolBtn('download', 'download', 'Download')}
    ${toolBtn('print',    'print',    'Print')}
  `;

  const content = document.createElement('div');
  content.className = 'app-content doc-layout';

  // ── Sidebar ───────────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.className = 'doc-sidebar';
  sidebar.setAttribute('aria-label', 'Document list');
  sidebar.hidden = true;

  const sidebarList = document.createElement('div');
  sidebarList.className = 'doc-sidebar-list';
  sidebar.appendChild(sidebarList);

  // ── Scroll + body ─────────────────────────────────────────────
  const docScroll = document.createElement('div');
  docScroll.className = 'doc-scroll';

  const docBody = document.createElement('div');
  docBody.className = 'doc-body';

  // PDF iframe (hidden until a PDF is loaded)
  const pdfFrame = document.createElement('iframe');
  pdfFrame.className = 'doc-pdf-frame';
  pdfFrame.setAttribute('title', 'PDF document');
  pdfFrame.style.display = 'none';

  const zoomReadout = toolbar.querySelector('.zoom-readout');

  // Loading state shown while manifests are fetched
  docBody.innerHTML = `
    <div class="doc-welcome">
      <svg viewBox="0 0 24 24" fill="currentColor" class="doc-welcome-icon" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      </svg>
      <p>Loading documents…</p>
    </div>
  `;

  // ── Helpers ───────────────────────────────────────────────────
  function applyZoom() {
    docBody.style.setProperty('--doc-size', `${docFontPct / 100}rem`);
    zoomReadout.textContent = `${docFontPct}%`;
  }

  function isPDF(url) {
    return /\.pdf(\?|$)/i.test(url);
  }

  function updateSidebarActive() {
    sidebarList.querySelectorAll('.doc-sidebar-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.url === currentFile?.url);
    });
  }

  function loadFile(url, name) {
    currentFile = { url, name };
    ctx.setAppTitle(id, name);
    updateSidebarActive();

    if (isPDF(url)) {
      docBody.style.display = 'none';
      pdfFrame.style.display = 'block';
      pdfFrame.src = url;
      return;
    }

    pdfFrame.style.display = 'none';
    docBody.style.display  = '';
    docBody.innerHTML = '<p class="doc-status">Loading\u2026</p>';

    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(text => {
        docBody.innerHTML = renderMarkdown(text);
        docScroll.scrollTop = 0;
      })
      .catch(err => {
        docBody.innerHTML =
          `<p class="doc-status doc-error">\u26a0\ufe0f Could not load: ${esc(err.message)}</p>`;
      });
  }

  // ── Sidebar rendering ─────────────────────────────────────────
  function renderSidebar(docs) {
    sidebarList.innerHTML = '';
    let lastFolder = null;
    for (const doc of docs) {
      if (doc.folder !== lastFolder) {
        const label = document.createElement('p');
        label.className = 'doc-sidebar-section';
        label.textContent =
          MANIFEST_SOURCES.find(s => s.folder === doc.folder)?.label ?? doc.folder;
        sidebarList.appendChild(label);
        lastFolder = doc.folder;
      }
      const btn = document.createElement('button');
      btn.className = 'doc-sidebar-item';
      btn.dataset.url = doc.url;
      btn.setAttribute('title', doc.displayName);
      btn.innerHTML = `
        <span class="doc-sidebar-name">${doc.displayName}</span>
        <span class="doc-sidebar-date">${doc.date}</span>
      `;
      btn.addEventListener('click', () => loadFile(doc.url, doc.displayName));
      sidebarList.appendChild(btn);
    }
    updateSidebarActive();
  }

  // ── Manifest loading ──────────────────────────────────────────
  async function loadManifests() {
    const results = await Promise.all(
      MANIFEST_SOURCES.map(s => fetchDocManifest(s.folder))
    );
    allDocs = results.flat();
    renderSidebar(allDocs);

    if (allDocs.length > 0 && !currentFile) {
      loadFile(allDocs[0].url, allDocs[0].displayName);
    } else if (allDocs.length === 0) {
      docBody.innerHTML = `
        <div class="doc-welcome">
          <svg viewBox="0 0 24 24" fill="currentColor" class="doc-welcome-icon" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
          </svg>
          <p>No documents found. Add files to the <code>documents/</code> folder.</p>
        </div>
      `;
    }
  }

  // ── Sidebar toggle ────────────────────────────────────────────
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    sidebar.hidden = !sidebarOpen;
    const btn = toolbar.querySelector('[data-action="open"]');
    if (btn) btn.setAttribute('aria-pressed', sidebarOpen ? 'true' : 'false');
  }

  // ── Toolbar events ────────────────────────────────────────────
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'open':
        toggleSidebar();
        break;
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
          navigator.clipboard.writeText(url)
            .then(() => ctx.toast(el, 'Link copied!'))
            .catch(() => {});
        }
        break;
      }
      case 'download': {
        if (!currentFile) return;
        const a = document.createElement('a');
        a.href     = currentFile.url;
        a.download = currentFile.name;
        a.click();
        break;
      }
      case 'print': {
        const win = window.open('', '_blank', 'width=800,height=600');
        if (!win) return;
        win.document.write(`<!doctype html><html><head>
          <title>${esc(currentFile?.name ?? 'Document')}</title>
          <style>body{font-family:Georgia,serif;max-width:70ch;margin:2rem auto;line-height:1.7}
          table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.4em .7em;text-align:left}
          pre{background:#f4f4f4;padding:1em;overflow:auto}code{background:#f4f4f4;padding:.1em .3em}
          hr{border:none;border-top:1px solid #ccc}</style>
          </head><body>${docBody.innerHTML}</body></html>`);
        win.document.close();
        win.print();
        break;
      }
    }
  });

  // ── Public API ────────────────────────────────────────────────
  ctx.appApis[id] = {
    openFile: (url, name) => loadFile(url, name),
  };

  // ── Assemble DOM ──────────────────────────────────────────────
  docScroll.appendChild(docBody);
  docScroll.appendChild(pdfFrame);
  content.appendChild(sidebar);
  content.appendChild(docScroll);
  el.appendChild(toolbar);
  el.appendChild(content);

  loadManifests();
  return el;
}
