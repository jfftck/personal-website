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

// ── State ─────────────────────────────────────────────────────
const API = ''; // same-origin (served from port 3001)
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

// ── Toast ──────────────────────────────────────────────────────
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

    const isMd = entry.filename.endsWith('.md');
    const canEdit = section.mdEdit && isMd;

    const metaParts = [`<span>${esc(entry.size ?? '')}</span>`];
    if (entry.url) metaParts.push(`<span class="item-meta-url" title="${esc(entry.url)}">${esc(entry.url)}</span>`);
    if (entry.poster) metaParts.push(`<span class="item-meta-url" title="${esc(entry.poster)}">poster</span>`);

    item.innerHTML = `
      <div class="item-info">
        <div class="item-filename">${esc(entry.filename)}</div>
        <div class="item-meta">${metaParts.join('')}</div>
      </div>
      <div class="item-actions">
        ${canEdit ? `<button class="icon-btn edit-btn" title="Edit markdown" data-filename="${esc(entry.filename)}">${SVG_EDIT}</button>` : ''}
        <button class="icon-btn delete-btn danger" title="Delete" data-filename="${esc(entry.filename)}">${SVG_TRASH}</button>
      </div>`;

    item.querySelector('.delete-btn')?.addEventListener('click', () => handleDelete(section.dir, entry.filename));
    item.querySelector('.edit-btn')?.addEventListener('click',   () => openEditor(section.dir, entry.filename));

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
  if (addUrl.value)    entry.url    = addUrl.value.trim();
  if (addPoster.value) entry.poster = addPoster.value.trim();

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

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    try {
      await apiFetch(`/api/upload/${section.dir}`, { method: 'POST', body: formData });
    } catch (e) {
      toast(`Upload failed for ${file.name}: ${e.message}`, true);
    }
  }

  uploadProgress.hidden = true;
  uploadInput.value = '';
  await loadManifest(section.dir);
  renderList();
  toast(`Uploaded ${files.length} file(s)`);
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
    const res  = await apiFetch(`/api/file/${editorEntry.dir}/${encodeURIComponent(editorEntry.filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    });
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
    manifestList.innerHTML = `<div class="empty-state"><div>Error loading: ${esc(e.message)}</div></div>`;
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

// ── SVG icons ─────────────────────────────────────────────────
const SVG_EDIT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

// ── Init ──────────────────────────────────────────────────────
switchTab('posts');
