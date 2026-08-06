'use strict';

import { toolBtn } from './toolbar.js';

async function fetchVideoManifest() {
  try {
    const r = await fetch('videos/manifest.json');
    if (!r.ok) return [];
    const json = await r.json();
    return json.map(entry => {
      const { filename, url: mUrl, size, poster } = entry;
      const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
      if (!m) return null;
      const [, yyyy, mm, dd, rest] = m;
      const dotIdx     = rest.lastIndexOf('.');
      const rawName    = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
      const displayName = rawName.replace(/_/g, ' ');
      const url = mUrl || `videos/${encodeURIComponent(filename)}`;
      return { filename, displayName, url, date: `${yyyy}-${mm}-${dd}`, size: size || '—', poster: poster || '' };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Media Player ───────────────────────────────────────────────
export function buildMediaPlayer(id, ctx) {
  let currentFile = null;
  let allVideos   = [];
  let sidebarOpen = false;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('open', 'open', 'Browse videos')}
    <span class="toolbar-sep"></span>
    ${toolBtn('external', 'external', 'Open in new tab')}
  `;

  const content = document.createElement('div');
  content.className = 'app-content doc-layout';

  // ── Sidebar ────────────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.className = 'doc-sidebar';
  sidebar.setAttribute('aria-label', 'Video list');
  sidebar.hidden = true;

  const sidebarList = document.createElement('div');
  sidebarList.className = 'doc-sidebar-list';
  sidebar.appendChild(sidebarList);

  // ── Video area ─────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'media-player-wrapper';

  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'media-player-empty';
  emptyDiv.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" class="media-empty-icon" aria-hidden="true">
      <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/>
    </svg>
    <p>Loading videos…</p>
  `;

  const video = document.createElement('video');
  video.className = 'media-video';
  video.controls  = true;
  video.preload   = 'metadata';
  video.setAttribute('playsinline', '');
  video.hidden = true;

  // ── Helpers ────────────────────────────────────────────────────
  function updateSidebarActive() {
    sidebarList.querySelectorAll('.doc-sidebar-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.url === currentFile?.url);
    });
  }

  function playFile(url, name, poster) {
    currentFile = { url, name, poster };
    ctx.setAppTitle(id, name);
    video.poster = poster || '';
    video.src    = url;
    video.load();
    emptyDiv.hidden = true;
    video.hidden    = false;
    updateSidebarActive();
  }

  function renderSidebar(videos) {
    sidebarList.innerHTML = '';
    const label = document.createElement('p');
    label.className = 'doc-sidebar-section';
    label.textContent = 'Videos';
    sidebarList.appendChild(label);
    for (const vid of videos) {
      const btn = document.createElement('button');
      btn.className    = 'doc-sidebar-item';
      btn.dataset.url  = vid.url;
      btn.setAttribute('title', vid.displayName);
      btn.innerHTML = `
        <span class="doc-sidebar-name">${vid.displayName}</span>
        <span class="doc-sidebar-date">${vid.date}</span>
      `;
      btn.addEventListener('click', () => playFile(vid.url, vid.displayName, vid.poster));
      sidebarList.appendChild(btn);
    }
    updateSidebarActive();
  }

  async function loadManifest() {
    allVideos = await fetchVideoManifest();
    if (allVideos.length > 0) {
      renderSidebar(allVideos);
      if (!currentFile) playFile(allVideos[0].url, allVideos[0].displayName, allVideos[0].poster);
    } else {
      emptyDiv.querySelector('p').textContent =
        'No videos found. Add files to the videos/ folder.';
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    sidebar.hidden = !sidebarOpen;
    const btn = toolbar.querySelector('[data-action="open"]');
    if (btn) btn.setAttribute('aria-pressed', String(sidebarOpen));
  }

  // ── Error handling ─────────────────────────────────────────────
  video.addEventListener('error', () => {
    if (!video.hidden) {
      const p = emptyDiv.querySelector('p');
      if (p) p.textContent = '⚠️ Could not load this video.';
      emptyDiv.hidden = false;
      video.hidden    = true;
    }
  });

  // ── Public API ─────────────────────────────────────────────────
  ctx.appApis[id] = {
    openFile: (url, name, poster) => {
      const match = allVideos.find(v => v.url === url);
      if (match) playFile(match.url, match.displayName, match.poster);
      else        playFile(url, name, poster);
    },
  };

  // ── Toolbar events ─────────────────────────────────────────────
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'open') { toggleSidebar(); return; }
    if (btn.dataset.action === 'external' && currentFile) {
      window.open(currentFile.url, '_blank', 'noopener');
    }
  });

  // ── Assemble DOM ───────────────────────────────────────────────
  wrapper.appendChild(emptyDiv);
  wrapper.appendChild(video);
  content.appendChild(sidebar);
  content.appendChild(wrapper);
  el.appendChild(toolbar);
  el.appendChild(content);

  loadManifest();
  return el;
}
