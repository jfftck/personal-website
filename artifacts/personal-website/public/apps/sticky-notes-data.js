import { readJSON, writeJSON } from '../data-handler.js';
import { NOTE_COLORS } from '../shared/note-colors.js';

const KEY = 'personal-desktop-sticky-notes-v1';

export function loadStickyNotes() {
  const data = readJSON(KEY, [], { validate: Array.isArray });
  return data.filter(note => note && typeof note.id === 'string').map(note => ({
    id: note.id,
    title: String(note.title || ''),
    body: String(note.body || ''),
    desktop: note.desktop === true,
    color: NOTE_COLORS.some(option => option.value === note.color) ? note.color : 'yellow'
  }));
}

export function saveStickyNotes(notes) {
  writeJSON(KEY, notes, { validate: Array.isArray });
}
