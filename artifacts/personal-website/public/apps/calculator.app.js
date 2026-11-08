import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const calculatorApp = defineAppDescriptor({
  type: 'calculator',
  title: 'Calculator',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 3v4h12V5H6z"/></svg>',
  launcherIconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 3v4h12V5H6zm0 7v2h2v-2H6zm5 0v2h2v-2h-2zm5 0v2h2v-2h-2zM6 16v2h2v-2H6zm5 0v2h2v-2h-2zm5 0v2h2v-2h-2z"/></svg>',
  modulePath: './apps/calculator.js',
  entryUrl: new URL('./calculator.js', import.meta.url).href,
  styles: ['./apps/calculator.css'],
  buildExport: 'buildCalculator',
  state: {
    persistence: 'local',
    disposeMethod: 'destroy',
  },
  modules: [
    'apps/calculator.js',
    'apps/calculator-graph-settings.js',
    'apps/calculator-math.js',
    'apps/calculator-session.js',
  ],
});
