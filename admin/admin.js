'use strict';

import { renderMarkdown, esc } from '/shared/markdown.js';

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

// ── API base: same-origin when on port 3001; show error otherwise ──
// The admin server self-hosts on port 3001. If opened from any other
// port, the connectivity check will fail and show a helpful message.
const API = '';

// ── State ─────────────────────────────────────────────────────
let activeSection = 'posts';
let manifests     = {};
let editorOpen    = false;
let editorDirty   = false;
let editorEntry   = null; // { dir, filename }

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
const toastContainer = document.getElementById('toast-container');
const mainArea       = document.getElementById('main-area');

// ── SVG icons ─────────────────────────────────────────────────
const SVG_EDIT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  toastContainer.appendChild(t);
  t.addEventListener('animationend', e => { if (e.animationName === 'toastOut') t.remove(); });
}

// ── API helpers ───────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, opts);
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
  try {
    const res = await fetch('/api/manifest/posts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected response');
    return true;
  } catch {
    return false;
  }
}

// ── Inline field editing ──────────────────────────────────────
// Creates a clickable span. Clicking it replaces it with an input;
// blur/Enter commits the change back to the manifest and re-renders.
function makeEditable(entry, dir, key, opts = {}) {
  const { isUrl = false, placeholder = '—' } = opts;

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

    let committed = false;
    async function commit() {
      if (committed) return;
      committed = true;
      const newVal = input.value.trim();
      const oldVal = entry[key] || '';
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
        } catch (e) {
          toast(`Save failed: ${e.message}`, true);
        }
      }
      renderList();
    }

    input.addEventListener('blur',    () => commit());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { committed = true; renderList(); }
    });
  });

  return span;
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

  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'manifest-item';
    item.setAttribute('role', 'listitem');

    const isMd    = entry.filename.endsWith('.md');
    const canEdit = section.mdEdit && isMd;

    // ── Info column ─────────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'item-info';

    const filenamEl = document.createElement('div');
    filenamEl.className = 'item-filename';
    filenamEl.textContent = entry.filename;
    info.appendChild(filenamEl);

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

      const urlEl = makeEditable(entry, section.dir, 'url', { isUrl: true });
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

      const posterEl = makeEditable(entry, section.dir, 'poster', { isUrl: true });
      meta.appendChild(posterEl);
    }

    info.appendChild(meta);
    item.appendChild(info);

    // ── Actions column ──────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'item-actions';

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
    manifestList.appendChild(item);
  }
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
  const section  = SECTIONS[activeSection];
  const filename = addFilename.value.trim();
  if (!filename) return;

  const entry = { filename, size: '0 B' };
  if (addUrl.value.trim())    entry.url    = addUrl.value.trim();
  if (addPoster.value.trim()) entry.poster = addPoster.value.trim();

  manifests[section.dir] = manifests[section.dir] || [];
  manifests[section.dir].unshift(entry);

  try {
    await saveManifest(section.dir);
    renderList();
    hideAddForm();
    toast(`Added ${filename}`);
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

// ── Tab switching ─────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.section));
});

async function switchTab(section) {
  if (editorDirty && !confirm('You have unsaved changes. Discard them?')) return;
  closeEditor();

  activeSection = section;
  tabBtns.forEach(b => {
    const active = b.dataset.section === section;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  hideAddForm();
  manifestList.innerHTML = '<div class="empty-state"><div>Loading…</div></div>';

  try {
    await loadManifest(SECTIONS[section].dir);
    renderList();
  } catch (e) {
    manifestList.innerHTML = `<div class="empty-state"><div>Error: ${esc(e.message)}</div></div>`;
  }
}

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!addForm.hidden) { hideAddForm(); return; }
    if (editorOpen) {
      if (editorDirty && !confirm('Discard unsaved changes?')) return;
      closeEditor();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && editorOpen) {
    e.preventDefault();
    editorSaveBtn.click();
  }
});

// ── Init ──────────────────────────────────────────────────────
(async () => {
  const ok = await checkConnectivity();
  if (!ok) {
    mainArea.innerHTML = `
      <div class="connectivity-error">
        <div class="empty-icon">⚠️</div>
        <strong>Admin server not reachable</strong>
        <p>This page must be opened via the <strong>port 3001</strong> preview.<br>
           Switch to the "Admin server" workflow in Replit and open its preview.</p>
      </div>`;
    return;
  }
  switchTab('posts');
})();
