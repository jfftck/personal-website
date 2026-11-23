const GAME_TYPES = 'klondike spider freecell pyramid tripeaks golf minesweeper chess reversi'.split(' ');
const SPECIAL_TITLES = { freecell: 'FreeCell', tripeaks: 'TriPeaks' };

export const GAME_WINDOW_TYPES = Object.freeze(GAME_TYPES.map(type => Object.freeze({
  type,
  title: SPECIAL_TITLES[type] || type[0].toUpperCase() + type.slice(1),
})));
