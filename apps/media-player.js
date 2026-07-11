'use strict';

import { toolBtn } from './toolbar.js';

export function buildMediaPlayer(id, ctx) {
  let currentFile = null;

  const el = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'app-toolbar';
  toolbar.innerHTML = `
    <span class="media-title-lbl" id="media-title-${id}">No file loaded</span>
    <span class="toolbar-sep"></span>
    ${toolBtn('external', 'external', 'Open in new tab')}
  `;

  const titleLbl = toolbar.querySelector(`#media-title-${id}`);

  const content = document.createElement('div');
  content.className = 'app-content';

  const wrapper = document.createElement('div');
  wrapper.className = 'media-player-wrapper';

  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'media-player-empty';
  emptyDiv.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" class="media-empty-icon" aria-hidden="true">
      <path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/>
    </svg>
    <p>Open a video from the <strong>File Manager</strong> to get started.</p>
  `;

  const video = document.createElement('video');
  video.className = 'media-video';
  video.controls  = true;
  video.preload   = 'metadata';
  video.setAttribute('playsinline', '');
  video.hidden = true;

  ctx.appApis[id] = {
    openFile: (url, name, poster) => {
      currentFile = { url, name, poster };
      ctx.setAppTitle(id, name);
      titleLbl.textContent = name;
      video.poster = poster || '';
      video.src    = url;
      video.load();
      emptyDiv.hidden = true;
      video.hidden    = false;
    },
  };

  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'external' && currentFile) {
      window.open(currentFile.url, '_blank', 'noopener');
    }
  });

  wrapper.appendChild(emptyDiv);
  wrapper.appendChild(video);
  content.appendChild(wrapper);
  el.appendChild(toolbar);
  el.appendChild(content);
  return el;
}
