'use strict';

const KEY = 'personal-desktop-sticky-notes-v1';
const NOTE_COLORS = [
  { value: 'yellow', label: 'Yellow' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'purple', label: 'Purple' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
];

export function buildStickyNotes(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app notes-app';
  let notes = loadStickyNotes();
  let selected = notes[0]?.id || null;
  root.innerHTML = `<aside class="notes-sidebar"><button type="button" class="util-action note-create">＋ New note</button><div class="notes-list"></div></aside><div class="note-editor"></div>`;
  const list = root.querySelector('.notes-list'), editor = root.querySelector('.note-editor');
  const publishDesktopNotes = () => ctx?.updateDesktopNotes?.(notes);
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {}
    publishDesktopNotes();
  };
  const render = () => {
    list.replaceChildren();
    notes.forEach(note => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = `note-select ${note.id === selected ? 'active' : ''}`;
      item.dataset.noteId = note.id;
      item.dataset.noteColor = note.color || 'yellow';
      item.setAttribute('aria-pressed', String(note.id === selected));
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
    editor.dataset.noteColor = note.color || 'yellow';
    editor.innerHTML = `<div class="note-toolbar"><span class="util-muted">Saved in this browser</span><label class="note-desktop-toggle"><input type="checkbox" aria-label="Show this note on the desktop"><span>Show on desktop</span></label><button type="button" class="util-action note-delete">Delete</button></div><fieldset class="note-color-picker"><legend>Background color</legend><div class="note-color-options"></div></fieldset><input aria-label="Note title" maxlength="100" placeholder="Untitled note"><textarea aria-label="Note text" placeholder="Write something worth remembering…"></textarea>`;
    const title = editor.querySelector('input[aria-label="Note title"]'), body = editor.querySelector('textarea');
    title.value = note.title; body.value = note.body;
    const colorOptions = editor.querySelector('.note-color-options');
    NOTE_COLORS.forEach(({ value, label }) => {
      const choice = document.createElement('label');
      choice.className = 'note-color-choice';
      choice.dataset.noteColor = value;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `note-color-${note.id}`;
      radio.value = value;
      radio.checked = note.color === value;
      radio.setAttribute('aria-label', `${label} note background`);
      const swatch = document.createElement('span');
      swatch.className = 'note-color-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const accessibleName = document.createElement('span');
      accessibleName.className = 'sr-only';
      accessibleName.textContent = label;
      choice.append(radio, swatch, accessibleName);
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        note.color = value;
        editor.dataset.noteColor = value;
        const noteButton = [...list.children].find(item => item.dataset.noteId === note.id);
        if (noteButton) noteButton.dataset.noteColor = value;
        save();
      });
      colorOptions.append(choice);
    });
    const desktopToggle = editor.querySelector('.note-desktop-toggle input');
    desktopToggle.checked = note.desktop;
    desktopToggle.addEventListener('change', () => { note.desktop = desktopToggle.checked; save(); });
    const persistEdit = () => { note.title = title.value; note.body = body.value; save(); const active = list.querySelector('.note-select.active'); if (active) { active.querySelector('strong').textContent = note.title || 'Untitled note'; active.querySelector('small').textContent = note.body || 'No additional text'; } };
    title.addEventListener('input', persistEdit); body.addEventListener('input', persistEdit);
    editor.querySelector('.note-delete').addEventListener('click', () => { notes = notes.filter(item => item.id !== note.id); selected = notes[0]?.id || null; save(); render(); });
  };
  function create() {
    const note = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: '', body: '', desktop: false, color: 'yellow' };
    notes.unshift(note); selected = note.id; save(); render(); editor.querySelector('input')?.focus();
  }
  root.querySelector('.note-create').addEventListener('click', create);
  if (ctx?.appApis && id) {
    ctx.appApis[id] = {
      openNote: noteId => {
        if (!notes.some(note => note.id === noteId)) return;
        selected = noteId;
        render();
      }
    };
  }
  publishDesktopNotes();
  render();
  return root;
}

export function loadStickyNotes() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(data)) return data.filter(note => note && typeof note.id === 'string').map(note => ({
      id: note.id,
      title: String(note.title || ''),
      body: String(note.body || ''),
      desktop: note.desktop === true,
      color: NOTE_COLORS.some(option => option.value === note.color) ? note.color : 'yellow'
    }));
  } catch {}
  return [];
}
