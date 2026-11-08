import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const docViewerApp = defineAppDescriptor({
  type: 'doc-viewer',
  title: 'Document Viewer',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>',
  modulePath: './apps/doc-viewer.js',
  entryUrl: new URL('./doc-viewer.js', import.meta.url).href,
  styles: ['./apps/viewer-apps.css'],
  buildExport: 'buildDocViewer',
  state: {
    persistence: 'session',
    restoreArgument: 'initialState',
    snapshotMethod: 'getSessionState',
    commands: ['openFile'],
  },
  modules: ['apps/doc-viewer.js'],
});
