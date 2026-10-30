'use strict';

import { initResponsiveToolbar } from './toolbar.js';

export function buildFileManager(id, ctx) {
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
  const fileCache       = {};
  const _fetching       = {};
  const collapsedGroups = new Set();

  function parseEntry(folder, entry) {
    const { filename, url: mUrl, poster, size, date: manifestDate } = entry;
    const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
    if (!filename) return null;
    const rest = m ? m[4] : filename;
    const date = manifestDate
      ? new Date(`${manifestDate}T00:00:00`)
      : m
        ? new Date(+m[1], +m[2] - 1, +m[3])
        : new Date();
    const dotIdx  = rest.lastIndexOf('.');
    const ext     = dotIdx >= 0 ? rest.slice(dotIdx).toLowerCase() : '';
    const rawName = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
    const displayName = rawName.replace(/_/g, ' ');
    const typeMap = {
      md:'document', txt:'document', pdf:'document', xlsx:'document', doc:'document', docx:'document',
      jpg:'image', jpeg:'image', png:'image', gif:'image', webp:'image', svg:'image',
      mp4:'video', webm:'video', mov:'video', avi:'video',
    };
    const type = typeMap[ext.slice(1)] || 'document';
    const url  = mUrl || `/files/${folder}/${encodeURIComponent(filename)}`;
    return { filename, displayName, date, type, url, poster: poster || null, size: size || '\u2014', folder };
  }

  async function ensureFolder(folder) {
    if (fileCache[folder] !== undefined) return;
    if (_fetching[folder])               return _fetching[folder];
    _fetching[folder] = (async () => {
      try {
        const r = await fetch(`/files/${folder}/manifest.json`);
        if (!r.ok) throw new Error(r.status);
        fileCache[folder] = (await r.json()).map(e => parseEntry(folder, e)).filter(Boolean);
      } catch {
        fileCache[folder] = [];
      }
      delete _fetching[folder];
    })();
    return _fetching[folder];
  }

  // ── DOM ───────────────────────────────────────────────────────
  const el = document.createElement('div');

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
  initResponsiveToolbar(toolbar);

  const content = document.createElement('div');
  content.className = 'app-content';

  const layout = document.createElement('div');
  layout.className = 'fm-layout';

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
      <span class="fm-sidebar-count" data-folder="${fd.id}"></span>
    `;
    sidebar.appendChild(btn);
  });

  const main = document.createElement('div');
  main.className = 'fm-main';

  const scroll = document.createElement('div');
  scroll.className = 'fm-scroll';

  // ── Render helpers ────────────────────────────────────────────
  function fmDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildFileTile(file) {
    const tile = document.createElement('div');
    tile.className = 'fm-tile';
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('title', file.displayName);

    const iconColor = TYPE_COLOR[file.type] || TYPE_COLOR.document;
    const iconSvg   = TYPE_ICONS[file.type] || TYPE_ICONS.document;

    let iconHtml;
    if (file.type === 'video') {
      iconHtml = `
        <span class="fm-tile-icon fm-tile-icon--video" style="color:${iconColor}">
          ${iconSvg}
          <span class="fm-tile-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
          </span>
        </span>`;
    } else {
      iconHtml = `<span class="fm-tile-icon" style="color:${iconColor}">${iconSvg}</span>`;
    }

    tile.innerHTML = `
      ${iconHtml}
      <span class="fm-tile-name">${file.displayName}</span>
      <span class="fm-tile-date">${fmDate(file.date)}</span>
    `;
    tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.requestOpenFile(file); } });
    return tile;
  }

  function buildFileRow(file) {
    const row = document.createElement('div');
    row.className = 'fm-list-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('title', file.displayName);

    const iconColor = TYPE_COLOR[file.type] || TYPE_COLOR.document;
    const iconSvg   = TYPE_ICONS[file.type] || TYPE_ICONS.document;
    const iconHtml  = file.type === 'video'
      ? `<span class="fm-list-icon fm-list-icon--video" style="color:${iconColor}">
           ${iconSvg}
           <span class="fm-list-play" aria-hidden="true">
             <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
           </span>
         </span>`
      : `<span class="fm-list-icon" style="color:${iconColor}">${iconSvg}</span>`;

    row.innerHTML = `
      ${iconHtml}
      <span class="fm-list-name">${file.displayName}</span>
      <span class="fm-list-meta">${fmDate(file.date)}</span>
      <span class="fm-list-size">${file.size}</span>
    `;
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.requestOpenFile(file); } });
    return row;
  }

  function buildTimeline(container, files) {
    const grouped = new Map();
    const nowYear = new Date().getFullYear();
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
        item.addEventListener('click', () => ctx.requestOpenFile(file));
        grid.appendChild(item);
      }

      section.appendChild(grid);
      container.appendChild(section);
    }
  }

  function buildFolderItem(fd) {
    const cached   = fileCache[fd.id];
    const countStr = cached !== undefined
      ? `${cached.length}`
      : '';

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

  function updateSidebarCounts() {
    sidebar.querySelectorAll('.fm-sidebar-count[data-folder]').forEach(span => {
      const cached = fileCache[span.dataset.folder];
      if (cached !== undefined) span.textContent = cached.length;
    });
  }

  function loadFolderCountsInBackground() {
    const uncached = FOLDERS_DEF.filter(fd => fileCache[fd.id] === undefined);
    if (!uncached.length) return;
    let rendered = false;
    uncached.forEach(fd => {
      ensureFolder(fd.id).then(() => {
        updateSidebarCounts();
        if (currentPath === '/') {
          if (!rendered) { rendered = true; renderContent(); }
          // small delay to batch rapid completions into one re-render
          rendered = false;
          setTimeout(() => { if (currentPath === '/') renderContent(); }, 0);
        }
      });
    });
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
      loadFolderCountsInBackground();
      return;
    }
    const pending = fileCache[currentPath] === undefined ? [currentPath] : [];
    if (pending.length > 0) {
      scroll.innerHTML = '<p class="fm-empty-msg">Loading\u2026</p>';
      Promise.all(pending.map(ensureFolder)).then(() => { renderContent(); updateSidebarCounts(); });
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
    ctx.setAppTitle(id, currentPath === '/' ? '/home' : `/home/${fd ? fd.label : currentPath}`);
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

  ctx.appApis[id] = { openFile: null };
  ctx.setAppTitle(id, '/home');

  main.appendChild(scroll);
  layout.appendChild(sidebar);
  layout.appendChild(main);
  content.appendChild(layout);
  el.appendChild(toolbar);
  el.appendChild(content);

  render();
  return el;
}
