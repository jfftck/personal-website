'use strict';

import { toolBtn, initResponsiveToolbar } from '../shared/app-toolbar.js';

async function fetchPicturesManifest() {
  try {
    const r = await fetch('/files/pictures/manifest.json');
    if (!r.ok) return [];
    const json = await r.json();
    return json.map(entry => {
      const { filename, url: mUrl, size, date: manifestDate } = entry;
      if (!filename) return null;
      const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(.+)$/);
      const rest = m ? m[4] : filename;
      const dotIdx  = rest.lastIndexOf('.');
      const rawName = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
      const displayName = rawName.replace(/_/g, ' ');
      const url = mUrl || `/files/pictures/${encodeURIComponent(filename)}`;
      return { filename, displayName, url, date: manifestDate || (m ? `${m[1]}-${m[2]}-${m[3]}` : ''), size: size || '—' };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Image Viewer ───────────────────────────────────────────────
export function buildImgViewer(id, ctx, initialState = null) {
  let scale = 1, rot = 0, panX = 0, panY = 0;
  const MIN_SCALE = 0.01;
  const MAX_SCALE = 8;
  let fitPending = false;
  let isPanning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
  let pinching = false, pinchDist0 = 0, scale0 = 1;
  let currentFile = null;
  let gallery     = [];
  let galleryIdx  = 0;
  let sidebarOpen = false;
  let pendingState = initialState && (
    typeof initialState.url === 'string' || Number.isInteger(initialState.galleryIdx)
  ) ? {
    ...(typeof initialState.url === 'string' ? { url: initialState.url } : {}),
    galleryIdx: Number.isInteger(initialState.galleryIdx) ? initialState.galleryIdx : 0,
  } : null;

  const el = document.createElement('div');
  const selectionStatus = document.createElement('span');
  selectionStatus.className = 'sr-only viewer-selection-status';
  selectionStatus.setAttribute('role', 'status');
  selectionStatus.setAttribute('aria-live', 'polite');
  selectionStatus.setAttribute('aria-atomic', 'true');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar img-toolbar';
  toolbar.innerHTML = `
    ${toolBtn('open',     'open',     'Browse pictures')}
    <span class="toolbar-sep"></span>
    ${toolBtn('prev',     'prev',     'Previous image')}
    <span class="img-counter" aria-live="polite"></span>
    ${toolBtn('next',     'next',     'Next image')}
    <span class="toolbar-sep"></span>
    ${toolBtn('fit',      'fit',      'Fit Image')}
    ${toolBtn('actual-size', 'actualSize', '100% Zoom')}
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

  const stage = document.createElement('div');
  stage.className = 'img-stage';

  const thumbnails = document.createElement('nav');
  thumbnails.className = 'img-thumbnails';
  thumbnails.setAttribute('aria-label', 'Photo thumbnails');
  thumbnails.hidden = true;

  // ── Transform helpers ─────────────────────────────────────────
  function applyTransform() {
    transform.style.transform =
      `translate(${panX}px, ${panY}px) scale(${scale}) rotate(${rot}deg)`;
  }

  function resetTransform() { scale = 1; rot = 0; panX = 0; panY = 0; applyTransform(); }

  function fitImageToFrame() {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const frameWidth = viewport.clientWidth;
    const frameHeight = viewport.clientHeight;
    if (!width || !height) return;
    if (!frameWidth || !frameHeight) {
      fitPending = true;
      return;
    }
    const rotated = Math.abs(rot % 180) === 90;
    const imageWidth = rotated ? height : width;
    const imageHeight = rotated ? width : height;
    scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight, MAX_SCALE);
    fitPending = false;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  new ResizeObserver(() => {
    if (fitPending) fitImageToFrame();
  }).observe(viewport);

  function sizeLoadedImage() {
    if (!img.naturalWidth || !img.naturalHeight) return;
    img.style.width = `${img.naturalWidth}px`;
    img.style.height = `${img.naturalHeight}px`;
    requestAnimationFrame(fitImageToFrame);
  }

  img.addEventListener('load', sizeLoadedImage);

  function setImageSource(url, alt) {
    img.alt = alt;
    img.src = url;
    if (img.complete && img.naturalWidth) sizeLoadedImage();
  }

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
      const active = btn.dataset.url === currentFile?.url;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    thumbnails.querySelectorAll('.img-thumbnail').forEach(btn => {
      const active = btn.dataset.url === currentFile?.url;
      btn.classList.toggle('active', active);
      if (active) {
        btn.setAttribute('aria-current', 'true');
        // Scroll only the strip, not the surrounding desktop or window.
        if (btn.offsetLeft < thumbnails.scrollLeft) {
          thumbnails.scrollLeft = btn.offsetLeft;
        } else if (btn.offsetLeft + btn.offsetWidth > thumbnails.scrollLeft + thumbnails.clientWidth) {
          thumbnails.scrollLeft = btn.offsetLeft + btn.offsetWidth - thumbnails.clientWidth;
        }
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  function renderThumbnails() {
    thumbnails.replaceChildren();
    thumbnails.hidden = gallery.length <= 1;
    if (thumbnails.hidden) return;
    gallery.forEach((pic, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'img-thumbnail';
      btn.dataset.url = pic.url;
      btn.title = pic.displayName;
      btn.setAttribute('aria-label', `View ${pic.displayName}`);
      const preview = document.createElement('img');
      preview.src = pic.url;
      preview.alt = '';
      preview.loading = 'lazy';
      preview.decoding = 'async';
      btn.appendChild(preview);
      btn.addEventListener('click', () => showGalleryItem(idx));
      thumbnails.appendChild(btn);
    });
  }

  function showGalleryItem(idx) {
    if (!gallery.length) return;
    pendingState = null;
    galleryIdx  = ((idx % gallery.length) + gallery.length) % gallery.length;
    const item  = gallery[galleryIdx];
    currentFile = { url: item.url, name: item.displayName };
    selectionStatus.textContent = `Selected picture: ${item.displayName}`;
    ctx.setAppTitle(id, item.displayName);
    setImageSource(item.url, item.displayName);
    resetTransform();
    updateCounter();
    updateSidebarActive();
    ctx.saveSession?.();
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
    renderThumbnails();
    if (gallery.length > 0 && !currentFile) {
      // Prefer file identity so a reordered manifest still opens the same photo.
      const idx = pendingState?.url
        ? gallery.findIndex(item => item.url === pendingState.url)
        : pendingState?.galleryIdx ?? 0;
      showGalleryItem(idx >= 0 && idx < gallery.length ? idx : 0);
    } else if (currentFile) {
      const idx = gallery.findIndex(item => item.url === currentFile.url);
      if (idx >= 0) showGalleryItem(idx);
    } else if (gallery.length === 0) {
      pendingState = null;
      ctx.saveSession?.();
      setImageSource('https://picsum.photos/seed/default/1200/800', 'Sample image');
      counterEl.textContent = '';
    }
  }

  // ── Public API ────────────────────────────────────────────────
  ctx.appApis[id] = {
    getSessionState: () => currentFile
      ? { url: currentFile.url, galleryIdx }
      : pendingState,
    openFile: (url, name) => {
      pendingState = null;
      const gIdx = gallery.findIndex(g => g.url === url);
      if (gIdx >= 0) {
        showGalleryItem(gIdx);
      } else {
        currentFile = { url, name };
        selectionStatus.textContent = `Selected picture: ${name}`;
        ctx.setAppTitle(id, name);
        setImageSource(url, name);
        resetTransform();
        counterEl.textContent = '';
        updateSidebarActive();
        ctx.saveSession?.();
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
      case 'fit':      fitImageToFrame(); break;
      case 'actual-size': scale = 1; panX = 0; panY = 0; applyTransform(); break;
      case 'zoom-in':  scale = Math.min(scale * 1.25, MAX_SCALE);   applyTransform(); break;
      case 'zoom-out': scale = Math.max(scale / 1.25, MIN_SCALE); applyTransform(); break;
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
    scale = Math.min(Math.max(scale * (e.deltaY < 0 ? 1.1 : 0.9), MIN_SCALE), MAX_SCALE);
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
    scale = Math.min(Math.max(scale0 * (touchDist(e.touches) / pinchDist0), MIN_SCALE), MAX_SCALE);
    applyTransform();
  }, { passive: true });
  viewport.addEventListener('touchend', () => { pinching = false; });

  viewport.addEventListener('dblclick', () => resetTransform());

  // ── Assemble DOM ──────────────────────────────────────────────
  transform.appendChild(img);
  viewport.appendChild(transform);
  content.appendChild(sidebar);
  stage.appendChild(viewport);
  stage.appendChild(thumbnails);
  content.appendChild(stage);
  el.appendChild(toolbar);
  el.appendChild(selectionStatus);
  el.appendChild(content);

  loadGallery();
  return el;
}
