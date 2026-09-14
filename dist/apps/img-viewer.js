'use strict';

import { toolBtn, initResponsiveToolbar } from './toolbar.js';

async function fetchPicturesManifest() {
  try {
    const r = await fetch('pictures/manifest.json');
    if (!r.ok) return [];
    const json = await r.json();
    return json.map(entry => {
      const { filename, url: mUrl, size } = entry;
      const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
      if (!m) return null;
      const [, yyyy, mm, dd, rest] = m;
      const dotIdx  = rest.lastIndexOf('.');
      const rawName = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
      const displayName = rawName.replace(/_/g, ' ');
      const url = mUrl || `pictures/${encodeURIComponent(filename)}`;
      return { filename, displayName, url, date: `${yyyy}-${mm}-${dd}`, size: size || '—' };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Image Viewer ───────────────────────────────────────────────
export function buildImgViewer(id, ctx) {
  let scale = 1, rot = 0, panX = 0, panY = 0;
  let isPanning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
  let pinching = false, pinchDist0 = 0, scale0 = 1;
  let currentFile = null;
  let gallery     = [];
  let galleryIdx  = 0;
  let sidebarOpen = false;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar img-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('open',     'open',     'Browse pictures')}
    <span class="toolbar-sep"></span>
    ${toolBtn('prev',     'prev',     'Previous image')}
    <span class="img-counter" aria-live="polite"></span>
    ${toolBtn('next',     'next',     'Next image')}
    <span class="toolbar-sep"></span>
    ${toolBtn('zoom-out', 'zoomOut',  'Zoom Out')}
    ${toolBtn('zoom-in',  'zoomIn',   'Zoom In')}
    ${toolBtn('rotate',   'rotate',   'Rotate')}
    <span class="toolbar-sep"></span>
    ${toolBtn('share',    'share',    'Share')}
    ${toolBtn('download', 'download', 'Download')}
  `;
  initResponsiveToolbar(toolbar);

  const counterEl = toolbar.querySelector('.img-counter');

  const content = document.createElement('div');
  content.className = 'app-content doc-layout';

  // ── Sidebar ────────────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.className = 'doc-sidebar';
  sidebar.setAttribute('aria-label', 'Picture list');
  sidebar.hidden = true;

  const sidebarList = document.createElement('div');
  sidebarList.className = 'doc-sidebar-list';
  sidebar.appendChild(sidebarList);

  // ── Viewport ───────────────────────────────────────────────────
  const viewport = document.createElement('div');
  viewport.className = 'img-viewport';

  const transform = document.createElement('div');
  transform.className = 'img-transform';

  const img = document.createElement('img');
  img.alt = 'Image';

  // ── Transform helpers ─────────────────────────────────────────
  function applyTransform() {
    transform.style.transform =
      `translate(${panX}px, ${panY}px) scale(${scale}) rotate(${rot}deg)`;
  }

  function resetTransform() { scale = 1; rot = 0; panX = 0; panY = 0; applyTransform(); }

  // ── Gallery navigation ────────────────────────────────────────
  function updateCounter() {
    counterEl.textContent = gallery.length ? `${galleryIdx + 1} / ${gallery.length}` : '';
  }

  function updateNavButtons() {
    toolbar.querySelector('[data-action="prev"]')?.toggleAttribute('disabled', gallery.length <= 1);
    toolbar.querySelector('[data-action="next"]')?.toggleAttribute('disabled', gallery.length <= 1);
  }

  function updateSidebarActive() {
    sidebarList.querySelectorAll('.doc-sidebar-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.url === currentFile?.url);
    });
  }

  function showGalleryItem(idx) {
    if (!gallery.length) return;
    galleryIdx  = ((idx % gallery.length) + gallery.length) % gallery.length;
    const item  = gallery[galleryIdx];
    currentFile = { url: item.url, name: item.displayName };
    ctx.setAppTitle(id, item.displayName);
    img.src = item.url;
    img.alt = item.displayName;
    resetTransform();
    updateCounter();
    updateSidebarActive();
  }

  // ── Sidebar rendering ─────────────────────────────────────────
  function renderSidebar(pics) {
    sidebarList.innerHTML = '';
    const label = document.createElement('p');
    label.className = 'doc-sidebar-section';
    label.textContent = 'Pictures';
    sidebarList.appendChild(label);
    for (const pic of pics) {
      const btn = document.createElement('button');
      btn.className   = 'doc-sidebar-item';
      btn.dataset.url = pic.url;
      btn.setAttribute('title', pic.displayName);
      btn.innerHTML = `
        <span class="doc-sidebar-name">${pic.displayName}</span>
        <span class="doc-sidebar-date">${pic.date}</span>
      `;
      btn.addEventListener('click', () => {
        const gIdx = gallery.findIndex(g => g.url === pic.url);
        if (gIdx >= 0) showGalleryItem(gIdx);
      });
      sidebarList.appendChild(btn);
    }
    updateSidebarActive();
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    sidebar.hidden = !sidebarOpen;
    const btn = toolbar.querySelector('[data-action="open"]');
    if (btn) btn.setAttribute('aria-pressed', String(sidebarOpen));
  }

  // ── Manifest loading ──────────────────────────────────────────
  async function loadGallery() {
    gallery = await fetchPicturesManifest();
    updateNavButtons();
    renderSidebar(gallery);
    if (gallery.length > 0 && !currentFile) {
      showGalleryItem(0);
    } else if (gallery.length === 0) {
      img.src = 'https://picsum.photos/seed/default/1200/800';
      img.alt = 'Sample image';
      counterEl.textContent = '';
    }
  }

  // ── Public API ────────────────────────────────────────────────
  ctx.appApis[id] = {
    openFile: (url, name) => {
      const gIdx = gallery.findIndex(g => g.url === url);
      if (gIdx >= 0) {
        showGalleryItem(gIdx);
      } else {
        currentFile = { url, name };
        ctx.setAppTitle(id, name);
        img.src = url;
        img.alt = name;
        resetTransform();
        counterEl.textContent = '';
        updateSidebarActive();
      }
    },
  };

  // ── Toolbar events ────────────────────────────────────────────
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'open':     toggleSidebar(); break;
      case 'prev':     showGalleryItem(galleryIdx - 1); break;
      case 'next':     showGalleryItem(galleryIdx + 1); break;
      case 'zoom-in':  scale = Math.min(scale * 1.25, 8);   applyTransform(); break;
      case 'zoom-out': scale = Math.max(scale / 1.25, 0.1); applyTransform(); break;
      case 'rotate':   rot = (rot + 90) % 360;              applyTransform(); break;
      case 'share': {
        const url = currentFile ? new URL(currentFile.url, location.href).href : img.src;
        if (navigator.share) {
          navigator.share({ title: currentFile?.name ?? 'Image', url }).catch(() => {});
        } else {
          navigator.clipboard.writeText(url)
            .then(() => ctx.toast(el, 'Link copied!'))
            .catch(() => {});
        }
        break;
      }
      case 'download': {
        const a = document.createElement('a');
        a.href     = currentFile?.url ?? img.src;
        a.download = currentFile?.name ?? 'image';
        a.click();
        break;
      }
    }
  });

  // ── Pan (mouse) ───────────────────────────────────────────────
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    scale = Math.min(Math.max(scale * (e.deltaY < 0 ? 1.1 : 0.9), 0.1), 8);
    applyTransform();
  }, { passive: false });

  viewport.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    isPanning  = true;
    panStartX  = e.clientX; panStartY = e.clientY;
    panOriginX = panX;      panOriginY = panY;
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

  // ── Pinch-to-zoom (touch) ─────────────────────────────────────
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
    scale = Math.min(Math.max(scale0 * (touchDist(e.touches) / pinchDist0), 0.1), 8);
    applyTransform();
  }, { passive: true });
  viewport.addEventListener('touchend', () => { pinching = false; });

  viewport.addEventListener('dblclick', () => resetTransform());

  // ── Assemble DOM ──────────────────────────────────────────────
  transform.appendChild(img);
  viewport.appendChild(transform);
  content.appendChild(sidebar);
  content.appendChild(viewport);
  el.appendChild(toolbar);
  el.appendChild(content);

  loadGallery();
  return el;
}
