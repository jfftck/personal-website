import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const imgViewerApp = defineAppDescriptor({
  type: 'img-viewer',
  title: 'Image Viewer',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
  modulePath: './apps/img-viewer.js',
  entryUrl: new URL('./img-viewer.js', import.meta.url).href,
  styles: ['./apps/viewer-apps.css'],
  buildExport: 'buildImgViewer',
  state: {
    persistence: 'session',
    restoreArgument: 'initialState',
    snapshotMethod: 'getSessionState',
    commands: ['openFile'],
  },
  modules: ['apps/img-viewer.js'],
});
