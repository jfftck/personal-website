'use strict';

import { S } from './desktop-state.js';

let cb = {};

export function initDrag(callbacks) {
  cb = callbacks;
}

// ── Column event wiring ────────────────────────────────────────
export function wireColEvents(colEl) {
  colEl.addEventListener('pointerdown', e => {
    const dragHandle = e.target.closest('.win-drag-handle');
    if (dragHandle || S.metaHeld) {
      const appEl = e.target.closest('.app-window');
      if (!appEl?.dataset.id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      startWindowDrag(appEl.dataset.id, e, appEl, colEl);
      return;
    }
    const appEl = e.target.closest('.app-window');
    if (appEl?.dataset.id) cb.focusApp(appEl.dataset.id);
  }, { capture: true });
}

// ── Per-window drag ────────────────────────────────────────────
function startWindowDrag(winId, e, winEl, colEl) {
  if (S.dragState) return;

  const col = cb.getAppColumn(winId);
  if (!col) return;

  const colIdx   = S.columns.indexOf(col);
  const posInCol = col.appIds.indexOf(winId);
  const wasAlone = col.appIds.length === 1;

  const origRect = winEl.getBoundingClientRect();
  const startX   = e.clientX;
  const startY   = e.clientY;

  S.dragState = { winId, pointerId: e.pointerId };
  try { colEl.setPointerCapture(e.pointerId); } catch { /* */ }

  // Mark window as a placeholder in-place
  winEl.classList.add('win-placeholder');
  if (wasAlone) colEl.classList.add('col-placeholder');

  // Ghost: lightweight styled div with app icon + title
  const appDef = cb.getAppDef(winEl.dataset.type);
  const title  = S.appTitles[winId] || appDef?.title || '';
  const ghost  = document.createElement('div');
  ghost.className = 'app-window win-drag-ghost';
  ghost.innerHTML = `
    <div class="win-ghost-inner">
      <div class="win-ghost-icon">${appDef?.iconSvg ?? ''}</div>
      <span class="win-ghost-title">${title}</span>
    </div>`;
  Object.assign(ghost.style, {
    position: 'fixed',
    left:     origRect.left   + 'px',
    top:      origRect.top    + 'px',
    width:    origRect.width  + 'px',
    height:   origRect.height + 'px',
  });
  document.body.appendChild(ghost);

  // Drop zones
  const zones = [];
  let hoveredZone = null;

  function addZone(action, left, top, width, height) {
    const el = document.createElement('div');
    el.className = 'drag-zone';
    Object.assign(el.style, {
      left:   left   + 'px',
      top:    top    + 'px',
      width:  width  + 'px',
      height: height + 'px',
    });
    document.body.appendChild(el);
    zones.push({ action, rect: { left, top, right: left + width, bottom: top + height }, el });
  }

  function buildZones() {
    zones.forEach(z => z.el.remove());
    zones.length = 0;

    const vw           = window.innerWidth;
    const topbarEl     = document.getElementById('topbar');
    const topbarBottom = topbarEl ? topbarEl.getBoundingClientRect().bottom : 48;
    const availH       = window.innerHeight - topbarBottom;
    const zoneW        = vw / 6;

    // Left zone: only if columns exist to the left
    if (colIdx > 0) {
      addZone('move-left', 0, topbarBottom, zoneW, availH);
    }

    // Right zone: only if columns exist to the right
    if (colIdx < S.columns.length - 1) {
      addZone('move-right', vw - zoneW, topbarBottom, zoneW, availH);
    }

    // Stack zone: only when other windows remain in the source column
    if (!wasAlone) {
      const colRect = col.el.getBoundingClientRect();
      const zoneH   = Math.max(colRect.height / 6, 48);
      if (posInCol === 0) {
        // Window was at top → offer bottom slot
        addZone('stack-bottom', colRect.left, colRect.bottom - zoneH, colRect.width, zoneH);
      } else {
        // Window was below top → offer top slot
        addZone('stack-top', colRect.left, colRect.top, colRect.width, zoneH);
      }
    }
  }

  requestAnimationFrame(buildZones);

  // ── Hit test ────────────────────────────────────────────────
  function hitTest(px, py) {
    for (const z of zones) {
      if (px >= z.rect.left && px < z.rect.right && py >= z.rect.top && py < z.rect.bottom) return z;
    }
    return null;
  }

  // ── Cleanup ─────────────────────────────────────────────────
  function cleanup() {
    S.dragState = null;
    try { colEl.releasePointerCapture(e.pointerId); } catch { /* */ }
    colEl.removeEventListener('pointermove', onMove);
    colEl.removeEventListener('pointerup',   onEnd);
    colEl.removeEventListener('pointercancel', onEnd);
    ghost.remove();
    zones.forEach(z => z.el.remove());
    zones.length = 0;
  }

  // ── Drop ────────────────────────────────────────────────────
  function performDrop(action) {
    winEl.classList.remove('win-placeholder');

    if (!action) {
      // Cancel: restore column if it was shrunk
      if (wasAlone) colEl.classList.remove('col-placeholder');
      return;
    }

    if (action === 'stack-top' || action === 'stack-bottom') {
      // Restack window within source column at the opposite end
      col.appIds.splice(posInCol, 1);
      const otherWins = [...col.el.querySelectorAll('.app-window')].filter(w => w !== winEl);
      if (action === 'stack-top') {
        col.appIds.unshift(winId);
        if (otherWins.length > 0) col.el.insertBefore(winEl, otherWins[0]);
        else                      col.el.appendChild(winEl);
      } else {
        col.appIds.push(winId);
        col.el.appendChild(winEl);
      }
      return;
    }

    // move-left or move-right: extract window into its own new column
    col.appIds.splice(posInCol, 1);
    winEl.remove();

    if (wasAlone) {
      colEl.classList.remove('col-placeholder');
      colEl.remove();
      const ci = S.columns.indexOf(col);
      if (ci !== -1) S.columns.splice(ci, 1);
    }

    const newColId = `col-${S.nextColId++}`;
    const newColEl = cb.createColEl(newColId);
    newColEl.appendChild(winEl);
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    newColEl.style.setProperty('--app-width', `${Math.max(window.innerWidth - 4 * remPx, 160)}px`);
    const newCol = { id: newColId, appIds: [winId], widthPreset: 'full', el: newColEl };

    const strip = document.getElementById('app-strip');
    if (action === 'move-left') {
      strip.insertBefore(newColEl, strip.firstElementChild);
      S.columns.unshift(newCol);
    } else {
      strip.appendChild(newColEl);
      S.columns.push(newCol);
    }

    wireColEvents(newColEl);
    cb.focusApp(winId);
  }

  // ── Event handlers ──────────────────────────────────────────
  function onMove(ev) {
    if (!S.dragState || ev.pointerId !== e.pointerId) return;
    ghost.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px)`;
    const hit = hitTest(ev.clientX, ev.clientY);
    if (hit !== hoveredZone) {
      hoveredZone?.el.classList.remove('hovered');
      hoveredZone = hit;
      hoveredZone?.el.classList.add('hovered');
    }
  }

  function onEnd(ev) {
    if (!S.dragState || ev.pointerId !== e.pointerId) return;
    const action = hoveredZone?.action ?? null;
    cleanup();
    performDrop(action);
    cb.updateStripLayout();
    cb.saveSession();
    cb.updateTopBar();
  }

  colEl.addEventListener('pointermove', onMove);
  colEl.addEventListener('pointerup',   onEnd, { once: true });
  colEl.addEventListener('pointercancel', onEnd, { once: true });
}
