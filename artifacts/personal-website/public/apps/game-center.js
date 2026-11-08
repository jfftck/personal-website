import { GAMES } from './games/catalog.js';
import { retryWithBackoff } from '../shared/retry.js';
export { GAMES, initGameMenu } from './games/catalog.js';

const SOLITAIRE_GAMES = new Set([
  'klondike', 'spider', 'freecell', 'pyramid', 'tripeaks', 'golf',
]);
let nextGameUiLoadId = 0;

function importGameUi(path, ctx) {
  const loadId = ++nextGameUiLoadId;
  let attempt = 0;
  return retryWithBackoff(() => {
    const currentAttempt = attempt++;
    const moduleUrl = new URL(path, import.meta.url);
    if (currentAttempt > 0) {
      moduleUrl.searchParams.set('retry', `${loadId}-${currentAttempt}`);
    }
    return import(/* @vite-ignore */ moduleUrl.href);
  }, {
    onRetry: retry => ctx?.reportLoadingRetry?.(retry),
  });
}

export async function buildGame(type, id, ctx, initialState = null) {
  const game = GAMES.find(item => item.type === type);
  if (!game) throw new Error(`Unknown game: ${type}`);

  if (SOLITAIRE_GAMES.has(type)) {
    const { buildSolitaire } = await importGameUi('./games/solitaire-ui.js', ctx);
    return buildSolitaire(type, id, game.title, ctx, initialState, game.iconSvg);
  }
  if (type === 'minesweeper') {
    const { buildMinesweeper } = await importGameUi('./games/minesweeper-ui.js', ctx);
    return buildMinesweeper(id, ctx, initialState, game.iconSvg);
  }

  const { buildBoardGame } = await importGameUi('./games/board-ui.js', ctx);
  return buildBoardGame(type, id, game.title, ctx, initialState, game.iconSvg);
}
