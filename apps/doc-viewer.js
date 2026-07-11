'use strict';

import { toolBtn } from './toolbar.js';

// ── Markdown renderer ──────────────────────────────────────────
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
    const rows  = tblBuf.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
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
