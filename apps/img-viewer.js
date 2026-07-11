'use strict';

import { toolBtn } from './toolbar.js';

export function buildImgViewer(id, ctx) {
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

  const content = document.createElement('div');
  content.className = 'app-content';

  const viewport = document.createElement('div');
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

  ctx.appApis[id] = {
    openFile: (url, name) => {
      currentFile = { url, name };
      ctx.setAppTitle(id, name);
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
        else navigator.clipboard.writeText(url).then(() => ctx.toast(el, 'Link copied!')).catch(() => {});
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

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    scale = Math.min(Math.max(scale * factor, 0.1), 8);
    applyTransform();
  }, { passive: false });

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

  viewport.addEventListener('dblclick', () => resetTransform());

  transform.appendChild(img);
  viewport.appendChild(transform);
  content.appendChild(viewport);
  el.appendChild(toolbar);
  el.appendChild(content);
  return el;
}
