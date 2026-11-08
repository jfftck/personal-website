import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const fileManagerApp = defineAppDescriptor({
  type: 'file-manager',
  title: 'File Manager',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
  modulePath: './apps/file-manager.js',
  entryUrl: new URL('./file-manager.js', import.meta.url).href,
  styles: ['./apps/file-manager.css'],
  buildExport: 'buildFileManager',
  state: {
    persistence: 'local',
    disposeMethod: 'destroy',
  },
  modules: ['apps/file-manager.js'],
});
