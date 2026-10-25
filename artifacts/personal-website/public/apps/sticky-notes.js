'use strict';

const KEY = 'personal-desktop-sticky-notes-v1';

export function buildStickyNotes() {
  const root = document.createElement('section');
  root.className = 'utility-app notes-app';
  let notes = load();
  let selected = notes[0]?.id || null;
  root.innerHTML = `<aside class="notes-sidebar"><button type="button" class="util-action note-create">＋ New note</button><div class="notes-list"></div></aside><div class="note-editor"></div>`;
  const list = root.querySelector('.notes-list'), editor = root.querySelector('.note-editor');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {} };
  const render = () => {
    list.replaceChildren();
    notes.forEach(note => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = `note-select ${note.id === selected ? 'active' : ''}`;
      const title = document.createElement('strong'), preview = document.createElement('small');
      title.textContent = note.title || 'Untitled note'; preview.textContent = note.body || 'No additional text';
      item.append(title, preview); item.addEventListener('click', () => { selected = note.id; render(); }); list.append(item);
    });
    editor.replaceChildren();
    const note = notes.find(item => item.id === selected);
    if (!note) {
      editor.innerHTML = `<div class="weather-state util-muted"><strong>No notes yet</strong><p>Keep a small thought close at hand.</p><button type="button" class="util-action note-empty-create">Create a note</button></div>`;
      editor.querySelector('.note-empty-create').addEventListener('click', create);
      return;
    }
    editor.innerHTML = `<div class="note-toolbar"><span class="util-muted">Saved in this browser</span><button type="button" class="util-action note-delete">Delete</button></div><input aria-label="Note title" maxlength="100" placeholder="Untitled note"><textarea aria-label="Note text" placeholder="Write something worth remembering…"></textarea>`;
    const title = editor.querySelector('input'), body = editor.querySelector('textarea');
    title.value = note.title; body.value = note.body;
    const persistEdit = () => { note.title = title.value; note.body = body.value; save(); const active = list.querySelector('.note-select.active'); if (active) { active.querySelector('strong').textContent = note.title || 'Untitled note'; active.querySelector('small').textContent = note.body || 'No additional text'; } };
    title.addEventListener('input', persistEdit); body.addEventListener('input', persistEdit);
    editor.querySelector('.note-delete').addEventListener('click', () => { notes = notes.filter(item => item.id !== note.id); selected = notes[0]?.id || null; save(); render(); });
  };
  function create() {
    const note = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: '', body: '' };
    notes.unshift(note); selected = note.id; save(); render(); editor.querySelector('input')?.focus();
  }
  root.querySelector('.note-create').addEventListener('click', create);
  render();
  return root;
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(data)) return data.filter(note => note && typeof note.id === 'string').map(note => ({ id: note.id, title: String(note.title || ''), body: String(note.body || '') }));
  } catch {}
  return [];
}
