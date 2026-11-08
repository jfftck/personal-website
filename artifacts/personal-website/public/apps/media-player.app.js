import { defineAppDescriptor } from '../shared/app-descriptor.js';

export const mediaPlayerApp = defineAppDescriptor({
  type: 'media-player',
  title: 'Media Player',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM8 15l7-4-7-4v8z"/></svg>',
  modulePath: './apps/media-player.js',
  entryUrl: new URL('./media-player.js', import.meta.url).href,
  styles: ['./apps/viewer-apps.css'],
  buildExport: 'buildMediaPlayer',
  state: {
    persistence: 'none',
    commands: ['openFile'],
  },
  modules: ['apps/media-player.js'],
});
