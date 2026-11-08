import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const calendarApp = defineAppDescriptor({
  type: 'calendar',
  title: 'Calendar',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2zm13 8H4v10h16V10z"/></svg>',
  launcherIconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2zm13 8H4v10h16V10zM6 12h3v3H6v-3zm5 0h3v3h-3v-3zm5 0h3v3h-3v-3z"/></svg>',
  modulePath: './apps/calendar.js',
  entryUrl: new URL('./calendar.js', import.meta.url).href,
  styles: ['./apps/utility-apps.css'],
  buildExport: 'buildCalendar',
  state: {
    persistence: 'local',
    disposeMethod: 'destroy',
  },
  modules: ['apps/calendar.js'],
});
