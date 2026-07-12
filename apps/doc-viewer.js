'use strict';

import { toolBtn }                    from './toolbar.js';
import { renderMarkdown, esc }        from '../shared/markdown.js';

// ── Document Viewer ────────────────────────────────────────────
export function buildDocViewer(id, ctx) {
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

  const content = document.createElement('div');
  content.className = 'app-content';

  const docScroll = document.createElement('div');
  docScroll.className = 'doc-scroll';

  const docBody = document.createElement('div');
  docBody.className = 'doc-body';

  const zoomReadout = toolbar.querySelector('.zoom-readout');

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

  ctx.appApis[id] = {
    openFile: (url, name) => {
      currentFile = { url, name };
      ctx.setAppTitle(id, name);
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
          navigator.clipboard.writeText(url).then(() => ctx.toast(el, 'Link copied!')).catch(() => {});
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
