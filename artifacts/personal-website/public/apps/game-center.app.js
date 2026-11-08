import { defineAppDescriptor } from '../shared/app-descriptor.js';
import { GAMES } from './games/catalog.js';

const modulePath = './apps/game-center.js';
const entryUrl = new URL('./game-center.js', import.meta.url).href;
const styles = [
  './apps/games/games.css',
  './apps/games/artwork.css',
  './apps/games/glass.css',
  './shared/animation-picker.css',
];
const modules = ['apps/game-center.js', 'apps/games/**'];

export const gameCenterApp = defineAppDescriptor({
  type: 'game-center',
  title: 'Game Center',
  iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6h10a4 4 0 0 1 3.9 3.1l1.5 6.6a3 3 0 0 1-5 2.8L15 16H9l-2.4 2.5a3 3 0 0 1-5-2.8l1.5-6.6A4 4 0 0 1 7 6zm0 3v2H5v2h2v2h2v-2h2v-2H9V9zm9 1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm3 3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>',
  modulePath,
  entryUrl,
  styles,
  modules,
  window: false,
  group: 'game-center',
  state: { persistence: 'game-windows' },
});

export const gameWindowDescriptors = Object.freeze(GAMES.map(game => defineAppDescriptor({
  type: game.type,
  title: game.title,
  iconSvg: game.iconSvg,
  modulePath,
  entryUrl,
  styles,
  launcher: false,
  group: 'game-center',
  modules,
  state: {
    persistence: 'session',
    restoreArgument: 'initialState',
    snapshotMethod: 'getSessionState',
    disposeMethod: 'destroy',
  },
  build: (module, id, initialState, ctx) => module.buildGame(game.type, id, ctx, initialState),
})));
