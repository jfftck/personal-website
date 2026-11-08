import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const worldClockApp = defineAppDescriptor({
  type: 'world-clock',
  title: 'World Clock',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.4 4 2.4-1 1.7-5-3V6h2v6.4z"/></svg>',
  modulePath: './apps/world-clock.js',
  entryUrl: new URL('./world-clock.js', import.meta.url).href,
  styles: ['./apps/utility-apps.css'],
  buildExport: 'buildWorldClock',
  state: {
    persistence: 'local',
    disposeMethod: 'destroy',
  },
  modules: ['apps/world-clock.js'],
});
