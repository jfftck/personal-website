'use strict';

import { renderMarkdown, esc } from './markdown.js';

// ── Clerk auth (sandbox stub) ─────────────────────────────────
// A representative signed-in admin session keeps the extracted console
// viewable without requiring Clerk credentials or loading Clerk's bundle.
let clerk = {
  user: { id: 'user_preview_admin', firstName: 'Jamie', lastName: 'Morgan' },
  session: { getToken: async () => 'preview-admin-session-token' },
  signOut: async () => {},
  mountSignIn: () => {},
};

async function initClerk() {
  return clerk;
}

async function getAuthToken() {
  if (!clerk || !clerk.session) return null;
  return clerk.session.getToken();
}

// ── Section schemas ───────────────────────────────────────────
const SECTIONS = {
  posts: {
    dir: 'posts', label: 'Posts',
    fields: ['filename', 'size'],
    mdEdit: true,
  },
  documents: {
    dir: 'documents', label: 'Documents',
    fields: ['filename', 'size'],
    mdEdit: true,
  },
  pictures: {
    dir: 'pictures', label: 'Pictures',
    fields: ['filename', 'size', 'url'],
    mdEdit: false,
  },
  videos: {
    dir: 'videos', label: 'Videos',
    fields: ['filename', 'size', 'url', 'poster'],
    mdEdit: false,
  },
};

// ── API base ──────────────────────────────────────────────────
// Set by the inline <script> in admin.html. Empty string = same-origin
// (when opened directly on port 3001). Full origin when opened from
// another port (e.g. port 80 static server).
const API = (window.ADMIN_API_BASE != null) ? window.ADMIN_API_BASE : '';

// ── State ─────────────────────────────────────────────────────
let activeSection     = 'posts';
let manifests         = {};
let editorOpen        = false;
let editorDirty       = false;
let editorEntry       = null; // { dir, filename }
let inlineEditPromise = null; // non-null while an inline-edit input is active

// ── Drag-to-reorder state ─────────────────────────────────────
let dragSrcIdx = -1;

// ── Welcome editor state ──────────────────────────────────────
let welcomeDirty = false;

// ── DOM refs ──────────────────────────────────────────────────
const tabBtns        = document.querySelectorAll('.tab-btn');
const sectionTitle   = document.getElementById('section-title');
const manifestList   = document.getElementById('manifest-list');
const addEntryBtn    = document.getElementById('add-entry-btn');
const addForm        = document.getElementById('add-form');
const addFilename    = document.getElementById('add-filename');
const addUrlRow      = document.getElementById('add-url-row');
const addUrl         = document.getElementById('add-url');
const addPosterRow   = document.getElementById('add-poster-row');
const addPoster      = document.getElementById('add-poster');
const addCancelBtn   = document.getElementById('add-cancel-btn');
const uploadForm     = document.getElementById('upload-form');
const uploadInput    = document.getElementById('upload-input');
const uploadProgress = document.getElementById('upload-progress');
const editorPane     = document.getElementById('editor-pane');
const editorFilename = document.getElementById('editor-filename');
const editorTextarea = document.getElementById('editor-textarea');
const editorPreview  = document.getElementById('editor-preview');
const editorSaveBtn  = document.getElementById('editor-save-btn');
const editorCloseBtn = document.getElementById('editor-close-btn');
const welcomePane     = document.getElementById('welcome-pane');
const welcomeTextarea = document.getElementById('welcome-textarea');
const welcomePreview  = document.getElementById('welcome-preview');
const welcomeSaveBtn  = document.getElementById('welcome-save-btn');
const toastContainer = document.getElementById('toast-container');
const mainArea       = document.getElementById('main-area');
const authScreen     = document.getElementById('auth-screen');
const loadingScreen  = document.getElementById('loading-screen');
const signoutBtn     = document.getElementById('signout-btn');
const tabStrip       = document.getElementById('tab-strip');

// ── SVG icons ─────────────────────────────────────────────────
const SVG_EDIT   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_TRASH  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const SVG_RENAME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
const SVG_DRAG   = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>`;

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  toastContainer.appendChild(t);
  t.addEventListener('animationend', e => { if (e.animationName === 'toastOut') t.remove(); });
}

// ── API helpers ───────────────────────────────────────────────
const previewManifests = {
  posts: [
    { filename: '20260712_Notes_From_The_Coast.md', size: '2.4 KB' },
    { filename: '20260628_A_Small_Internet.md', size: '1.8 KB' },
    { filename: '20260602_Summer_Reading_List.md', size: '936 B' },
    { filename: '20260514_The_Garden_In_May.md', size: '3.1 KB' },
    { filename: '20260420_Things_I_Made.md', size: '1.2 KB' },
  ],
  documents: [
    { filename: 'Field_Notes_2026.pdf', size: '842 KB' },
    { filename: 'Reading_List.pdf', size: '126 KB' },
    { filename: 'Project_Archive.zip', size: '4.8 MB' },
  ],
  pictures: [
    { filename: 'coast-at-dawn.jpg', size: '2.1 MB', url: 'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?w=240&h=240&fit=crop' },
    { filename: 'garden-after-rain.jpg', size: '1.6 MB', url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=240&h=240&fit=crop' },
    { filename: 'old-town-window.jpg', size: '1.1 MB', url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=240&h=240&fit=crop' },
  ],
  videos: [
    { filename: 'walking-the-harbor.mp4', size: '18.7 MB', url: 'https://example.com/media/walking-the-harbor.mp4', poster: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=240&h=240&fit=crop' },
    { filename: 'rain-on-the-window.mp4', size: '9.2 MB', url: 'https://example.com/media/rain-on-the-window.mp4', poster: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=240&h=240&fit=crop' },
  ],
};

const previewFiles = {
  'posts/20260712_Notes_From_The_Coast.md': '# Notes From The Coast\n\nA few quiet days by the water, with a notebook in my pocket and nowhere particular to be.\n\n## Morning\n\nThe harbor is already awake before the sun clears the headland. Nets drying on the quay, gulls negotiating over breakfast, coffee cooling beside an open window.\n\n- Walk without a route\n- Take the long way back\n- Remember the blue hour\n',
  'posts/20260628_A_Small_Internet.md': '# A Small Internet\n\nThe best corners of the web still feel like finding a handwritten note tucked inside a library book.\n\nHere are a few places worth lingering: **personal, curious, and made with care.**\n',
  'posts/20260602_Summer_Reading_List.md': '# Summer Reading List\n\nA shelf of books for bright evenings and slow weekends.\n\n1. The Living Mountain\n2. A Field Guide to Getting Lost\n3. The Book of Delights\n',
  'posts/20260514_The_Garden_In_May.md': '# The Garden in May\n\nThe first peas are climbing, the rosemary is full of bees, and the weather has finally remembered spring.\n',
  'posts/20260420_Things_I_Made.md': '# Things I Made\n\nA small collection of experiments, useful tools, and happy accidents from this year.\n',
  'posts/20240101_Welcome.md': '# Welcome\n\nHello, and welcome to my little corner of the internet.\n\nI write about **making things**, the places I visit, books I love, and the small details that make an ordinary day memorable.\n',
  'posts/20240115_About_Me.md': '# About Me\n\nI’m Jamie — a designer, writer, and enthusiastic collector of notebooks. I live near the coast and make things for the web.\n',
  'posts/20240201_My_Sites.md': '# Around the web\n\n- [My photographs](https://example.com/photos)\n- [Notes and essays](https://example.com/notes)\n- [Now](https://example.com/now)\n',
};

function previewResponse(data, status = 200, textBody = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    json: async () => data,
    text: async () => textBody == null ? JSON.stringify(data) : textBody,
  };
}

async function previewApiFetch(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'api') return previewResponse({ error: 'Preview API route not found' }, 404);

  if (parts[1] === 'manifest' && parts[2]) {
    const dir = parts[2];
    if (!Object.hasOwn(previewManifests, dir)) return previewResponse({ error: 'Manifest not found' }, 404);
    if (method === 'PUT') previewManifests[dir] = JSON.parse(opts.body || '[]');
    return previewResponse(previewManifests[dir]);
  }

  if (parts[1] === 'file' && parts[2] && parts[3]) {
    const key = `${parts[2]}/${parts[3]}`;
    if (method === 'GET') {
      return Object.hasOwn(previewFiles, key)
        ? previewResponse(null, 200, previewFiles[key])
        : previewResponse({ error: 'File not found' }, 404);
    }
    if (method === 'PUT') {
      const text = String(opts.body || '');
      previewFiles[key] = text;
      const size = new TextEncoder().encode(text).length;
      return previewResponse({ size: size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB` });
    }
    if (method === 'PATCH') {
      const data = JSON.parse(opts.body || '{}');
      const manifest = previewManifests[parts[2]] || [];
      const entry = manifest.find(item => item.filename === parts[3]);
      if (entry) {
        entry.filename = data.newFilename;
        const renamedKey = `${parts[2]}/${data.newFilename}`;
        if (Object.hasOwn(previewFiles, key)) {
          previewFiles[renamedKey] = previewFiles[key];
          delete previewFiles[key];
        }
      }
      return previewResponse({ ok: true });
    }
    if (method === 'DELETE') {
      previewManifests[parts[2]] = (previewManifests[parts[2]] || []).filter(item => item.filename !== parts[3]);
      delete previewFiles[key];
      return previewResponse({ ok: true });
    }
  }

  if (parts[1] === 'upload' && parts[2] && method === 'POST') {
    const file = opts.body?.get?.('file');
    if (file) {
      previewManifests[parts[2]] ||= [];
      previewManifests[parts[2]].unshift({ filename: file.name, size: `${file.size} B` });
    }
    return previewResponse({ ok: true });
  }
  return previewResponse({ error: 'Preview API route not found' }, 404);
}

async function apiFetch(path, opts = {}) {
  await getAuthToken();
  const res = await previewApiFetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res;
}

async function loadManifest(dir) {
  const res  = await apiFetch(`/api/manifest/${dir}`);
  const data = await res.json();
  manifests[dir] = data;
  return data;
}

async function saveManifest(dir) {
  await apiFetch(`/api/manifest/${dir}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manifests[dir], null, 2),
  });
}

// ── Connectivity check ────────────────────────────────────────
async function checkConnectivity() {
  return true;
}

// ── Inline field editing ──────────────────────────────────────
// Creates a clickable span. Clicking it replaces it with an input;
// blur/Enter saves the change; URL fields update in place.
function makeEditable(entry, dir, key, opts = {}) {
  const { isUrl = false, placeholder = '—', onCommit } = opts;

  const span = document.createElement('span');
  span.className = 'editable-field';
  if (isUrl) span.classList.add('editable-url');
  span.title = `Click to edit ${key}`;
  span.textContent = entry[key] || placeholder;

  span.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type       = isUrl ? 'text' : 'text';
    input.value      = entry[key] || '';
    input.className  = 'inline-edit-input';
    input.placeholder = isUrl ? 'https://…' : key;

    span.replaceWith(input);
    input.focus();
    input.select();

    // Shared by size, URL and poster fields: beforeunload warns while editing
    // or saving, and switchTab waits for the same commit to finish.
    let resolveInlineEdit;
    inlineEditPromise = new Promise(resolve => { resolveInlineEdit = resolve; });

    let committed = false;
    async function commit() {
      if (committed) return;
      committed = true;
      const newVal = input.value.trim();
      const oldVal = entry[key] || '';
      const hadValue = Object.hasOwn(entry, key);
      if (newVal !== oldVal) {
        if (newVal) {
          entry[key] = newVal;
        } else if (key !== 'filename' && key !== 'size') {
          delete entry[key];
        } else {
          entry[key] = newVal;
        }
        try {
          await saveManifest(dir);
          onCommit?.();
        } catch (e) {
          if (hadValue) entry[key] = oldVal;
          else delete entry[key];
          toast(`Save failed: ${e.message}`, true);
        }
      }
      if (isUrl) {
        span.textContent = entry[key] || placeholder;
        input.replaceWith(span);
      }
      inlineEditPromise = null;
      resolveInlineEdit();
      if (!isUrl) renderList();
    }

    input.addEventListener('blur',    () => commit());
    input.addEventListener('keydown', e => {
      if (committed) return;
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') {
        committed = true;
        inlineEditPromise = null;
        resolveInlineEdit();
        if (isUrl) input.replaceWith(span);
        else renderList();
      }
    });
  });

  return span;
}

// ── Rename a file ─────────────────────────────────────────────
async function handleRename(dir, entry) {
  const oldName = entry.filename;
  const newName = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || newName === oldName) return;
  const trimmed = newName.trim();
  if (!trimmed) return;

  try {
    await apiFetch(`/api/file/${dir}/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newFilename: trimmed }),
    });
    entry.filename = trimmed;
    await loadManifest(dir);
    renderList();
    toast(`Renamed to ${trimmed}`);
    if (editorOpen && editorEntry?.dir === dir && editorEntry?.filename === oldName) {
      editorEntry.filename = trimmed;
      editorFilename.textContent = `${dir}/${trimmed}`;
    }
  } catch (e) {
    toast(`Rename failed: ${e.message}`, true);
  }
}

// ── Render manifest list ──────────────────────────────────────
function renderList() {
  const section = SECTIONS[activeSection];
  const entries = manifests[section.dir] || [];
  sectionTitle.textContent = section.label;

  if (entries.length === 0) {
    manifestList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <div>No entries yet — upload a file or add one manually.</div>
      </div>`;
    return;
  }

  manifestList.innerHTML = '';

  entries.forEach((entry, idx) => {
    const item = document.createElement('div');
    item.className = 'manifest-item';
    item.setAttribute('role', 'listitem');
    item.draggable = true;
    item.dataset.idx = idx;

    const isMd    = entry.filename.endsWith('.md');
    const canEdit = section.mdEdit && isMd;

    // ── Drag handle ─────────────────────────────────────────
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.title = 'Drag to reorder';
    handle.innerHTML = SVG_DRAG;
    item.appendChild(handle);

    // ── Info column ─────────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'item-info';

    // Thumbnail — pictures (url) and videos (poster)
    let refreshThumbnail;
    if (activeSection === 'pictures' || activeSection === 'videos') {
      const thumbKey = activeSection === 'pictures' ? 'url' : 'poster';
      const thumb = document.createElement('img');
      thumb.className = 'item-thumb';
      thumb.loading  = 'lazy';
      thumb.alt      = '';
      thumb.addEventListener('error', () => {
        thumb.classList.add('item-thumb--empty');
        thumb.removeAttribute('src');
      });
      refreshThumbnail = () => {
        const thumbUrl = entry[thumbKey] || '';
        thumb.classList.toggle('item-thumb--empty', !thumbUrl);
        if (thumbUrl) thumb.src = thumbUrl;
        else thumb.removeAttribute('src');
      };
      refreshThumbnail();

      if (activeSection === 'videos') {
        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'item-thumb-wrap';
        thumbWrap.appendChild(thumb);
        const playOverlay = document.createElement('div');
        playOverlay.className = 'item-thumb-play';
        playOverlay.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`;
        thumbWrap.appendChild(playOverlay);
        info.appendChild(thumbWrap);
      } else {
        info.appendChild(thumb);
      }
    }

    // Text stack (filename + meta)
    const textStack = document.createElement('div');
    textStack.className = 'item-text';

    const filenamEl = document.createElement('div');
    filenamEl.className = 'item-filename';
    filenamEl.textContent = entry.filename;
    textStack.appendChild(filenamEl);

    const meta = document.createElement('div');
    meta.className = 'item-meta';

    // Size — always editable
    const sizeEl = makeEditable(entry, section.dir, 'size');
    sizeEl.classList.add('meta-size');
    meta.appendChild(sizeEl);

    // URL — pictures and videos
    if (section.fields.includes('url')) {
      const sep1 = document.createElement('span');
      sep1.className = 'meta-sep';
      sep1.textContent = '·';
      meta.appendChild(sep1);

      const urlLabel = document.createElement('span');
      urlLabel.className = 'meta-label';
      urlLabel.textContent = 'url ';
      meta.appendChild(urlLabel);

      const urlEl = makeEditable(entry, section.dir, 'url', {
        isUrl: true,
        onCommit: section.dir === 'pictures' ? refreshThumbnail : undefined,
      });
      meta.appendChild(urlEl);
    }

    // Poster — videos only
    if (section.fields.includes('poster')) {
      const sep2 = document.createElement('span');
      sep2.className = 'meta-sep';
      sep2.textContent = '·';
      meta.appendChild(sep2);

      const posterLabel = document.createElement('span');
      posterLabel.className = 'meta-label';
      posterLabel.textContent = 'poster ';
      meta.appendChild(posterLabel);

      const posterEl = makeEditable(entry, section.dir, 'poster', {
        isUrl: true,
        onCommit: refreshThumbnail,
      });
      meta.appendChild(posterEl);
    }

    textStack.appendChild(meta);
    info.appendChild(textStack);
    item.appendChild(info);

    // ── Actions column ──────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'icon-btn rename-btn';
    renameBtn.title     = 'Rename';
    renameBtn.innerHTML = SVG_RENAME;
    renameBtn.addEventListener('click', () => handleRename(section.dir, entry));
    actions.appendChild(renameBtn);

    if (canEdit) {
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn edit-btn';
      editBtn.title     = 'Edit markdown';
      editBtn.innerHTML = SVG_EDIT;
      editBtn.addEventListener('click', () => openEditor(section.dir, entry.filename));
      actions.appendChild(editBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn delete-btn danger';
    deleteBtn.title     = 'Delete';
    deleteBtn.innerHTML = SVG_TRASH;
    deleteBtn.addEventListener('click', () => handleDelete(section.dir, entry.filename));
    actions.appendChild(deleteBtn);

    item.appendChild(actions);

    // ── Drag-to-reorder events ───────────────────────────────
    item.addEventListener('dragstart', e => {
      dragSrcIdx = idx;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', idx);
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      manifestList.querySelectorAll('.manifest-item').forEach(el => el.classList.remove('drag-over'));
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      manifestList.querySelectorAll('.manifest-item').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });

    item.addEventListener('dragleave', e => {
      if (!item.contains(e.relatedTarget)) item.classList.remove('drag-over');
    });

    item.addEventListener('drop', async e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (dragSrcIdx === -1 || dragSrcIdx === idx) return;

      const dir     = section.dir;
      const arr     = manifests[dir];
      const [moved] = arr.splice(dragSrcIdx, 1);
      arr.splice(idx, 0, moved);
      dragSrcIdx = -1;

      renderList();
      try {
        await saveManifest(dir);
        toast('Order saved');
      } catch (err) {
        toast(`Save failed: ${err.message}`, true);
        await loadManifest(dir);
        renderList();
      }
    });

    manifestList.appendChild(item);
  });
}

// ── Delete ────────────────────────────────────────────────────
async function handleDelete(dir, filename) {
  if (!confirm(`Delete "${filename}" from disk and manifest?`)) return;
  try {
    await apiFetch(`/api/file/${dir}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    await loadManifest(dir);
    renderList();
    toast(`Deleted ${filename}`);
    if (editorOpen && editorEntry?.dir === dir && editorEntry?.filename === filename) closeEditor();
  } catch (e) {
    toast(`Delete failed: ${e.message}`, true);
  }
}

// ── Add entry manually ────────────────────────────────────────
function showAddForm() {
  const section = SECTIONS[activeSection];
  addUrlRow.hidden    = !section.fields.includes('url');
  addPosterRow.hidden = !section.fields.includes('poster');
  addForm.hidden = false;
  addFilename.focus();
}

addEntryBtn.addEventListener('click', () => {
  addForm.hidden ? showAddForm() : hideAddForm();
});
addCancelBtn.addEventListener('click', hideAddForm);

function hideAddForm() {
  addForm.hidden = true;
  addForm.reset();
}

addForm.addEventListener('submit', async e => {
  e.preventDefault();
  const section = SECTIONS[activeSection];
  let filename  = addFilename.value.trim();
  if (!filename) return;

  if (section.mdEdit && !filename.endsWith('.md')) {
    filename += '.md';
    addFilename.value = filename;
  }

  const entry = { filename, size: '0 B' };
  if (addUrl.value.trim())    entry.url    = addUrl.value.trim();
  if (addPoster.value.trim()) entry.poster = addPoster.value.trim();

  manifests[section.dir] = manifests[section.dir] || [];
  manifests[section.dir].unshift(entry);

  try {
    await saveManifest(section.dir);

    if (section.mdEdit && filename.endsWith('.md')) {
      const stem     = filename.replace(/\.md$/i, '');
      const template = `# ${stem}\n`;
      try {
        const res  = await apiFetch(
          `/api/file/${section.dir}/${encodeURIComponent(filename)}`,
          { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: template },
        );
        const data = await res.json();
        if (data.size) {
          entry.size = data.size;
          await saveManifest(section.dir);
        }
      } catch (e3) {
        toast(`Warning: could not create starter file: ${e3.message}`, true);
      }
    }

    renderList();
    hideAddForm();
    toast(`Added ${filename}`);
    if (section.mdEdit && filename.endsWith('.md')) {
      openEditor(section.dir, filename);
    }
  } catch (e2) {
    toast(`Save failed: ${e2.message}`, true);
  }
});

// ── Upload ────────────────────────────────────────────────────
uploadInput.addEventListener('change', () => {
  if (uploadInput.files.length) uploadFiles([...uploadInput.files]);
});

uploadForm.addEventListener('dragover', e => { e.preventDefault(); });
uploadForm.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files.length) uploadFiles([...e.dataTransfer.files]);
});

async function uploadFiles(files) {
  const section = SECTIONS[activeSection];
  uploadProgress.textContent = `Uploading ${files.length} file(s)…`;
  uploadProgress.hidden = false;

  let errors = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    try {
      await apiFetch(`/api/upload/${section.dir}`, { method: 'POST', body: fd });
    } catch (e) {
      errors++;
      toast(`Upload failed for ${file.name}: ${e.message}`, true);
    }
  }

  uploadProgress.hidden = true;
  uploadInput.value = '';
  await loadManifest(section.dir);
  renderList();
  if (errors < files.length) toast(`Uploaded ${files.length - errors} file(s)`);
}

// ── Markdown editor ───────────────────────────────────────────
async function openEditor(dir, filename) {
  if (editorDirty && !confirm('You have unsaved changes. Discard them?')) return;

  try {
    const res  = await apiFetch(`/api/file/${dir}/${encodeURIComponent(filename)}`);
    const text = await res.text();

    editorEntry    = { dir, filename };
    editorDirty    = false;
    editorOpen     = true;
    editorFilename.textContent = `${dir}/${filename}`;
    editorTextarea.value = text;
    updatePreview();
    editorPane.removeAttribute('hidden');
    editorTextarea.focus();
  } catch (e) {
    toast(`Could not load file: ${e.message}`, true);
  }
}

function updatePreview() {
  editorPreview.innerHTML = renderMarkdown(editorTextarea.value);
}

editorTextarea.addEventListener('input', () => {
  editorDirty = true;
  updatePreview();
});

editorSaveBtn.addEventListener('click', async () => {
  if (!editorEntry) return;
  editorSaveBtn.disabled = true;
  try {
    const text = editorTextarea.value;
    const res  = await apiFetch(
      `/api/file/${editorEntry.dir}/${encodeURIComponent(editorEntry.filename)}`,
      { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: text },
    );
    const data = await res.json();
    editorDirty = false;

    const manifest = manifests[editorEntry.dir] || [];
    const idx = manifest.findIndex(e => e.filename === editorEntry.filename);
    if (idx !== -1 && data.size) {
      manifest[idx] = { ...manifest[idx], size: data.size };
      await saveManifest(editorEntry.dir);
      renderList();
    }

    toast('Saved');
  } catch (e) {
    toast(`Save failed: ${e.message}`, true);
  } finally {
    editorSaveBtn.disabled = false;
  }
});

editorCloseBtn.addEventListener('click', () => {
  if (editorDirty && !confirm('Discard unsaved changes?')) return;
  closeEditor();
});

function closeEditor() {
  editorOpen  = false;
  editorDirty = false;
  editorEntry = null;
  editorPane.setAttribute('hidden', '');
}

// ── Welcome editor ────────────────────────────────────────────
const listPane = document.getElementById('list-pane');

// Track which of the three welcome-window files is active
let welcomeActiveDir      = 'posts';
let welcomeActiveFilename = '20240101_Welcome.md';

async function openWelcomeEditor() {
  try {
    const res  = await apiFetch(
      `/api/file/${welcomeActiveDir}/${encodeURIComponent(welcomeActiveFilename)}`
    );
    const text = await res.text();
    welcomeTextarea.value = text;
    welcomeDirty = false;
    updateWelcomePreview();
  } catch (e) {
    toast(`Could not load ${welcomeActiveFilename}: ${e.message}`, true);
  }
}

function updateWelcomePreview() {
  welcomePreview.innerHTML = renderMarkdown(welcomeTextarea.value);
}

welcomeTextarea.addEventListener('input', () => {
  welcomeDirty = true;
  updateWelcomePreview();
});

welcomeSaveBtn.addEventListener('click', async () => {
  welcomeSaveBtn.disabled = true;
  try {
    await apiFetch(
      `/api/file/${welcomeActiveDir}/${encodeURIComponent(welcomeActiveFilename)}`,
      { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: welcomeTextarea.value }
    );
    welcomeDirty = false;
    toast('Saved');
  } catch (e) {
    toast(`Save failed: ${e.message}`, true);
  } finally {
    welcomeSaveBtn.disabled = false;
  }
});

// Sub-tab switching inside the Welcome pane
document.getElementById('welcome-file-tabs')?.addEventListener('click', async e => {
  const btn = e.target.closest('.wf-tab');
  if (!btn) return;
  if (welcomeDirty && !confirm('You have unsaved changes. Discard them?')) return;

  document.querySelectorAll('.wf-tab').forEach(b => {
    const active = b === btn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  welcomeActiveDir      = btn.dataset.dir;
  welcomeActiveFilename = btn.dataset.filename;
  welcomeTextarea.value = '';
  welcomePreview.innerHTML = '';
  await openWelcomeEditor();
});

// ── Tab switching ─────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.section));
});

async function switchTab(section) {
  // Auto-commit any active size, URL or poster input before switching tabs.
  if (inlineEditPromise) {
    const active = document.activeElement;
    if (active && active.classList.contains('inline-edit-input')) active.blur();
    await inlineEditPromise;
  }
  if (editorDirty && !confirm('You have unsaved changes. Discard them?')) return;
  if (welcomeDirty && !confirm('You have unsaved changes to the welcome message. Discard them?')) return;
  closeEditor();

  activeSection = section;
  tabBtns.forEach(b => {
    const active = b.dataset.section === section;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  // Show/hide the welcome pane vs the regular list pane
  if (section === 'welcome') {
    listPane.hidden = true;
    welcomePane.removeAttribute('hidden');
    welcomeDirty = false;
    await openWelcomeEditor();
    return;
  }

  welcomePane.setAttribute('hidden', '');
  listPane.hidden = false;

  hideAddForm();
  manifestList.innerHTML = '<div class="empty-state"><div>Loading…</div></div>';

  try {
    await loadManifest(SECTIONS[section].dir);
    renderList();
  } catch (e) {
    manifestList.innerHTML = `<div class="empty-state"><div>Error: ${esc(e.message)}</div></div>`;
  }
}

// ── Unload guard ──────────────────────────────────────────────
// Warn before navigating away or closing the tab while any inline size,
// URL or poster edit is active, including while its save is pending.
window.addEventListener('beforeunload', e => {
  if (inlineEditPromise || welcomeDirty) {
    e.preventDefault();
  }
});

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!addForm.hidden) { hideAddForm(); return; }
    if (editorOpen) {
      if (editorDirty && !confirm('Discard unsaved changes?')) return;
      closeEditor();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    if (editorOpen) { e.preventDefault(); editorSaveBtn.click(); }
    else if (activeSection === 'welcome') { e.preventDefault(); welcomeSaveBtn.click(); }
  }
});

// ── Auth UI helpers ───────────────────────────────────────────
function showAuthScreen() {
  loadingScreen.setAttribute('hidden', '');
  authScreen.removeAttribute('hidden');
  tabStrip.setAttribute('hidden', '');
  mainArea.setAttribute('hidden', '');
  signoutBtn.setAttribute('hidden', '');
  clerk.mountSignIn(document.getElementById('clerk-signin-root'), {
    // Hide the "Don't have an account? Sign up" footer — invite-only, no public registration.
    signUpUrl: null,
    appearance: {
      variables: {
        colorPrimary: '#069',
        colorBackground: '#011826',
        colorText: '#ddeeff',
        colorInputBackground: 'rgba(0,45,70,0.90)',
        colorInputText: '#ddeeff',
        borderRadius: '0.5rem',
      },
      elements: {
        // Hide the sign-up link in the footer
        footerAction: { display: 'none' },
      },
    },
  });
}

function showAdminUI() {
  loadingScreen.setAttribute('hidden', '');
  authScreen.setAttribute('hidden', '');
  tabStrip.removeAttribute('hidden');
  mainArea.removeAttribute('hidden');
  signoutBtn.removeAttribute('hidden');
}

// ── Sign out ──────────────────────────────────────────────────
signoutBtn.addEventListener('click', async () => {
  await clerk.signOut();
  location.reload();
});

// ── Init ──────────────────────────────────────────────────────
(async () => {
  const ok = await checkConnectivity();
  if (!ok) {
    loadingScreen.setAttribute('hidden', '');
    mainArea.removeAttribute('hidden');
    mainArea.innerHTML = `
      <div class="connectivity-error">
        <div class="empty-icon">⚠️</div>
        <strong>Admin server not reachable</strong>
        <p>Make sure the <strong>Admin server</strong> workflow is running on port 3001.<br>
           You can open this page from either the port 80 or port 3001 preview.</p>
      </div>`;
    return;
  }

  try {
    await initClerk();
  } catch (e) {
    loadingScreen.setAttribute('hidden', '');
    mainArea.removeAttribute('hidden');
    mainArea.innerHTML = `
      <div class="connectivity-error">
        <div class="empty-icon">⚠️</div>
        <strong>Auth failed to initialize</strong>
        <p>${esc(e.message)}</p>
      </div>`;
    return;
  }

  if (clerk.user) {
    showAdminUI();
    switchTab('posts');
  } else {
    showAuthScreen();
    clerk.addListener(({ user }) => {
      if (user) {
        showAdminUI();
        switchTab('posts');
      }
    });
  }
})();
