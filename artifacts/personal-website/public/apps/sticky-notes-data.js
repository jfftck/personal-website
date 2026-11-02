const KEY = 'personal-desktop-sticky-notes-v1';

export const NOTE_COLORS = [
  { value: 'yellow', label: 'Yellow', hex: '#e5bb22' },
  { value: 'orange', label: 'Orange', hex: '#e47b27' },
  { value: 'red', label: 'Red', hex: '#d94a4a' },
  { value: 'purple', label: 'Purple', hex: '#9a69d4' },
  { value: 'blue', label: 'Blue', hex: '#3689cf' },
  { value: 'green', label: 'Green', hex: '#48945a' },
];

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

export function saveStickyNotes(notes) {
  try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {}
}
