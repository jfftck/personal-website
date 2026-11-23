import { defineAppDescriptor } from '../shared/app-descriptor.js';
import { GAME_WINDOW_TYPES } from './game-types.js';

const modulePath = './apps/game-center.js';
const entryUrl = new URL('./game-center.js', import.meta.url).href;
const gameWindowIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 8h10l2 9-5-3H9l-5 3z"/></svg>';
const styles = [
  './apps/games/games.css',
  './apps/games/artwork.css',
  './apps/games/glass.css',
  './shared/animation-picker.css',
];
const modules = ['apps/game-center.js', 'apps/games/**'];

export const gameWindowDescriptors = Object.freeze(GAME_WINDOW_TYPES.map(game => defineAppDescriptor({
  type: game.type,
  title: game.title,
  iconSvg: gameWindowIcon,
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
