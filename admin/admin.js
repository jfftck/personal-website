'use strict';

import { renderMarkdown, esc } from '/shared/markdown.js';

// ── Clerk auth ────────────────────────────────────────────────
let clerk = null;

async function initClerk() {
  const API_BASE = (window.ADMIN_API_BASE != null) ? window.ADMIN_API_BASE : '';
  const cfgRes = await fetch(`${API_BASE}/api/clerk-config`);
  if (!cfgRes.ok) throw new Error('Could not load auth config');
  const { publishableKey } = await cfgRes.json();
  if (!publishableKey) throw new Error('Publishable key missing — check CLERK_PUBLISHABLE_KEY secret');

  // Load clerk-js. Try the local copy first (always available).
  // The admin server patches webpack's public path so chunk requests resolve
  // to /clerk-js/* regardless of how the page is accessed.
  const localClerkJsUrl = `${API_BASE}/clerk-js/clerk.browser.js`;

  await new Promise((resolve, reject) => {
    if (document.getElementById('clerk-js')) { resolve(); return; }
    const s = document.createElement('script');
    s.id  = 'clerk-js';
    s.src = localClerkJsUrl;
    // The bundle reads data-clerk-publishable-key to auto-init window.Clerk.
    // Without this attribute the bundle throws "Missing publishableKey" on load.
    s.setAttribute('data-clerk-publishable-key', publishableKey);
    s.onload  = () => { console.log('[auth] clerk-js loaded'); resolve(); };
    s.onerror = () => reject(new Error(`Failed to load Clerk JS from ${localClerkJsUrl}`));
    document.head.appendChild(s);
    console.log('[auth] loading clerk-js from', localClerkJsUrl);
  });

  if (!window.Clerk) {
    // Short poll — onload fires after script executes, Clerk should be set
    await new Promise((resolve, reject) => {
      const t = Date.now() + 3000;
      const id = setInterval(() => {
        if (window.Clerk) { clearInterval(id); resolve(); }
        else if (Date.now() > t) { clearInterval(id); reject(new Error('window.Clerk not set after script loaded')); }
      }, 50);
    });
  }

  clerk = window.Clerk;
  console.log('[auth] clerk.load()...');
  await clerk.load({ publishableKey });
  console.log('[auth] signed in:', !!clerk.user);
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
let activeSection = 'posts';
let manifests     = {};
let editorOpen    = false;
let editorDirty   = false;
let editorEntry   = null; // { dir, filename }

// ── Drag-to-reorder state ─────────────────────────────────────
let dragSrcIdx = -1;

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
async function apiFetch(path, opts = {}) {
  const token = await getAuthToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers });
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
    const res = await fetch(`${API}/api/clerk-config`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    if (activeSection === 'pictures' || activeSection === 'videos') {
      const thumbUrl = activeSection === 'pictures' ? (entry.url || '') : (entry.poster || '');
      const thumb = document.createElement('img');
      thumb.className = 'item-thumb';
      thumb.loading  = 'lazy';
      thumb.alt      = '';
      if (thumbUrl) {
        thumb.src = thumbUrl;
      } else {
        thumb.classList.add('item-thumb--empty');
      }
      thumb.addEventListener('error', () => {
        thumb.classList.add('item-thumb--empty');
        thumb.removeAttribute('src');
      });
      info.appendChild(thumb);
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
