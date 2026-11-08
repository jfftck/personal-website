import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const weatherApp = defineAppDescriptor({
  type: 'weather',
  title: 'Weather',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 18a5 5 0 1 1 .8-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8H7z"/></svg>',
  launcherIconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 18a5 5 0 1 1 .8-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8H7zm5-16v3h2V2h-2zM3.5 5.1 2.1 6.5l2.1 2.1 1.4-1.4-2.1-2.1zm17 0-2.1 2.1 1.4 1.4 2.1-2.1-1.4-1.4z"/></svg>',
  modulePath: './apps/weather.js',
  entryUrl: new URL('./weather.js', import.meta.url).href,
  styles: ['./apps/utility-apps.css'],
  buildExport: 'buildWeather',
  state: {
    persistence: 'local',
    disposeMethod: 'destroy',
  },
  modules: ['apps/weather.js'],
});
