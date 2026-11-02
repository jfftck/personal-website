import { GAMES } from './game-catalog.js';
export { GAMES, initGameMenu } from './game-catalog.js';

const SOLITAIRE_GAMES = new Set([
  'klondike', 'spider', 'freecell', 'pyramid', 'tripeaks', 'golf',
]);

export async function buildGame(type, id, ctx, initialState = null) {
  const game = GAMES.find(item => item.type === type);
  if (!game) throw new Error(`Unknown game: ${type}`);

  if (SOLITAIRE_GAMES.has(type)) {
    const { buildSolitaire } = await import('./games/solitaire-ui.js');
    return buildSolitaire(type, id, game.title, ctx, initialState, game.iconSvg);
  }
  if (type === 'minesweeper') {
    const { buildMinesweeper } = await import('./games/minesweeper-ui.js');
    return buildMinesweeper(id, ctx, initialState, game.iconSvg);
  }

  const { buildBoardGame } = await import('./games/board-ui.js');
  return buildBoardGame(type, id, game.title, ctx, initialState, game.iconSvg);
}
