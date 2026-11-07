'use strict';

import { toolBtn, initResponsiveToolbar } from './toolbar.js';
import { renderMarkdown, esc } from '../shared/markdown.js';
import { retryWithBackoff, responseLoadError } from '../shared/retry.js';

const MANIFEST_SOURCES = [
  { folder: 'documents', label: 'Documents' },
  { folder: 'posts',     label: 'Posts' },
];

function parseManifestEntry(folder, entry) {
  const { filename, url: mUrl, size, date: manifestDate } = entry;
  if (!filename) return null;
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
  const rest = m ? m[4] : filename;
  const dotIdx    = rest.lastIndexOf('.');
  const rawName   = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
  const displayName = rawName.replace(/_/g, ' ');
  const ext       = dotIdx >= 0 ? rest.slice(dotIdx + 1).toLowerCase() : 'md';
  const url       = mUrl || `/files/${folder}/${encodeURIComponent(filename)}`;
  const date      = manifestDate || (m ? `${m[1]}-${m[2]}-${m[3]}` : '');
  return {
    filename,
    displayName,
    url,
    ext,
    date,
    folder,
    size: size || '—',
    stylesheetUrl: typeof entry.stylesheetUrl === 'string' ? entry.stylesheetUrl : null,
  };
}

function splitSelectorList(selectorText) {
  const selectors = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < selectorText.length; index += 1) {
    const character = selectorText[index];
    if (quote) {
      if (character === quote && selectorText[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      selectors.push(selectorText.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(selectorText.slice(start).trim());
  return selectors.filter(Boolean);
}

function scopeDocumentStylesheet(cssText) {
  if (typeof CSSStyleSheet !== 'function') {
    throw new Error('This browser cannot safely scope document styles.');
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);

  const scopeSelector = selector => {
    const normalized = selector.trim();
    if (/^(?:html|body|:root)(?:\s+(?:html|body|:root))*(?=$|\s|[>+~.#:]|\[)/i.test(normalized)) {
      return normalized.replace(/^(?:html|body|:root)(?:\s+(?:html|body|:root))*/i, '.doc-body');
    }
    if (/^\.doc-body(?:$|\s|[>+~.#:]|\[)/i.test(normalized)) return normalized;
    return `.doc-body ${normalized}`;
  };

  const serializeRule = rule => {
    if (rule.type === 3) throw new Error('Document stylesheets cannot import other files.');
    if (rule.type === 1) {
      rule.selectorText = splitSelectorList(rule.selectorText).map(scopeSelector).join(', ');
      return rule.cssText;
    }
    if (rule.cssRules && rule.cssRules.length) {
      const openingBrace = rule.cssText.indexOf('{');
      if (openingBrace >= 0) {
        const nested = [...rule.cssRules].map(serializeRule).filter(Boolean).join('\n');
        return `${rule.cssText.slice(0, openingBrace)}{${nested}}`;
      }
    }
    return rule.cssText;
  };

  return [...sheet.cssRules].map(serializeRule).filter(Boolean).join('\n');
}

async function fetchDocManifest(folder) {
  try {
    const r = await fetch(`/files/${folder}/manifest.json`);
    if (!r.ok) return [];
    const json = await r.json();
    return json.map(e => parseManifestEntry(folder, e)).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Document Viewer ────────────────────────────────────────────
export function buildDocViewer(id, ctx, initialState = null) {
  let docFontPct  = 100;
  let currentFile = null;
  let allDocs     = [];
  let sidebarOpen = false;
  let pendingState = typeof initialState?.url === 'string' ? { url: initialState.url } : null;

  const el = document.createElement('div');
  const selectionStatus = document.createElement('span');
  selectionStatus.className = 'sr-only viewer-selection-status';
  selectionStatus.setAttribute('role', 'status');
  selectionStatus.setAttribute('aria-live', 'polite');
  selectionStatus.setAttribute('aria-atomic', 'true');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar doc-toolbar';
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
  initResponsiveToolbar(toolbar);

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
      const active = btn.dataset.url === currentFile?.url;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function showDocumentLoading(messageText) {
    docBody.setAttribute('aria-busy', 'true');
    docBody.replaceChildren();
    const status = document.createElement('p');
    status.className = 'doc-status doc-loading-status';
    status.setAttribute('role', 'status');
    status.textContent = messageText;
    const skeleton = document.createElement('div');
    skeleton.className = 'doc-loading-skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    skeleton.innerHTML = `
      <i class="doc-skeleton-heading"></i>
      <i class="doc-skeleton-subheading"></i>
      <i class="doc-skeleton-line"></i><i class="doc-skeleton-line"></i>
      <i class="doc-skeleton-line"></i><i class="doc-skeleton-line doc-skeleton-line-short"></i>
      <i class="doc-skeleton-gap"></i>
      <i class="doc-skeleton-line"></i><i class="doc-skeleton-line"></i>
      <i class="doc-skeleton-line doc-skeleton-line-medium"></i>`;
    docBody.append(status, skeleton);
  }

  let fileLoadGeneration = 0;
  function loadFile(url, name, stylesheetUrl = null) {
    const generation = ++fileLoadGeneration;
    pendingState = null;
    const matchedDocument = allDocs.find(doc => doc.url === url);
    stylesheetUrl = stylesheetUrl || matchedDocument?.stylesheetUrl || null;
    currentFile = { url, name, stylesheetUrl };
    selectionStatus.textContent = `Selected document: ${name}`;
    ctx.setAppTitle(id, name);
    updateSidebarActive();
    ctx.saveSession?.();

    if (isPDF(url)) {
      docBody.style.display = 'none';
      pdfFrame.style.display = 'block';
      pdfFrame.src = url;
      return;
    }

    pdfFrame.style.display = 'none';
    docBody.style.display  = '';
    showDocumentLoading('Loading document…');

    const contentPromise = retryWithBackoff(async () => {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw responseLoadError(response, name || 'document');
      return response.text();
    }, {
      onRetry: ({ attempt, maxRetries, delayMs }) => {
        if (generation === fileLoadGeneration) {
          showDocumentLoading(`Connection issue. Retrying ${attempt} of ${maxRetries} in ${(delayMs / 1000).toFixed(1)}s…`);
        }
      },
    });
    const stylesheetPromise = stylesheetUrl
      ? fetch(stylesheetUrl, { cache: 'no-cache' })
          .then(response => response.ok ? response.text() : Promise.reject(new Error('Could not load the assigned stylesheet.')))
          .then(cssText => ({ cssText, warning: '' }))
          .catch(() => ({ cssText: '', warning: 'The assigned stylesheet could not be loaded. Showing the default document style.' }))
      : Promise.resolve({ cssText: '', warning: '' });

    Promise.all([contentPromise, stylesheetPromise]).then(([text, stylesheet]) => {
        if (generation !== fileLoadGeneration) return;
        docBody.setAttribute('aria-busy', 'false');
        docBody.innerHTML = renderMarkdown(text);
        if (stylesheet.cssText) {
          try {
            const style = document.createElement('style');
            style.dataset.documentStylesheet = 'true';
            style.textContent = scopeDocumentStylesheet(stylesheet.cssText);
            docBody.prepend(style);
          } catch {
            stylesheet.warning = 'The assigned stylesheet could not be applied. Showing the default document style.';
          }
        }
        if (stylesheet.warning) {
          const warning = document.createElement('p');
          warning.className = 'doc-style-warning';
          warning.setAttribute('role', 'status');
          warning.textContent = stylesheet.warning;
          docBody.prepend(warning);
        }
        docScroll.scrollTop = 0;
      })
      .catch(err => {
        if (generation !== fileLoadGeneration) return;
        docBody.setAttribute('aria-busy', 'false');
        docBody.replaceChildren();
        const message = document.createElement('p');
        message.className = 'doc-status doc-error';
        message.setAttribute('role', 'alert');
        message.textContent = `Could not load “${name}”.`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'welcome-retry-button';
        retry.textContent = 'Try Again';
        retry.addEventListener('click', () => loadFile(url, name, stylesheetUrl));
        docBody.append(message, retry);
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
      btn.addEventListener('click', () => loadFile(doc.url, doc.displayName, doc.stylesheetUrl));
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
      const doc = allDocs.find(doc => doc.url === pendingState?.url) || allDocs[0];
      loadFile(doc.url, doc.displayName, doc.stylesheetUrl);
    } else if (allDocs.length === 0 && !currentFile) {
      pendingState = null;
      ctx.saveSession?.();
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
    getSessionState: () => currentFile ? { url: currentFile.url } : pendingState,
  };

  // ── Assemble DOM ──────────────────────────────────────────────
  docScroll.appendChild(docBody);
  docScroll.appendChild(pdfFrame);
  content.appendChild(sidebar);
  content.appendChild(docScroll);
  el.appendChild(toolbar);
  el.appendChild(selectionStatus);
  el.appendChild(content);

  loadManifests();
  return el;
}
