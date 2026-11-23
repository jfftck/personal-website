import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const stickyNotesApp = defineAppDescriptor({
  type: 'sticky-notes',
  title: 'Sticky Notes',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v11l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>',
  launcherIconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v11l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 5v2h10V8H7zm0 4v2h7v-2H7z"/></svg>',
  modulePath: './apps/sticky-notes.js',
  entryUrl: new URL('./sticky-notes.js', import.meta.url).href,
  styles: ['./apps/utility-apps.css'],
  buildExport: 'buildStickyNotes',
  state: {
    persistence: 'local',
    restoreArgument: 'initialState',
    commands: ['openNote'],
  },
  modules: ['apps/sticky-notes.js', 'apps/sticky-notes-data.js', 'apps/sticky-notes/**'],
});
