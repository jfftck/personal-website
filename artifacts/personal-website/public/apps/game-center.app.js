import { defineAppDescriptor } from '../shared/app-descriptor.js';
import { GAME_WINDOW_TYPES } from './game-types.js';

const modulePath = './apps/game-center.js';
const entryUrl = new URL('./game-center.js', import.meta.url).href;
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
