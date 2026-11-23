const GAME_TYPES = 'klondike spider freecell pyramid tripeaks golf minesweeper chess reversi'.split(' ');
const SPECIAL_TITLES = { freecell: 'FreeCell', tripeaks: 'TriPeaks' };
const GAME_ARTWORK = [
  {
    symbol: '♠',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 9.3 6.1C7.2 8.8 4 11.3 4 14.5a5 5 0 0 0 8 4 5 5 0 0 0 8-4c0-3.2-3.2-5.7-5.3-8.4L12 2.5zM8.5 14a3.5 3.5 0 0 0 2 3.2 3.5 3.5 0 0 1-5-3.2c0-1.4.9-2.8 2.3-4.3-.4 1.7-.1 3.1.7 4.3z"/></svg>',
  },
  {
    symbol: '♣',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3a5 5 0 0 0-4.8 6.4L3 7.8l1.2 3.5L1 13l3.5 1.8L3 18l4.5-1.6A5 5 0 0 0 11 21v-4h2v4a5 5 0 0 0 3.5-4.6L21 18l-1.5-3.2L23 13l-3.2-1.7L21 7.8l-4.2 1.6A5 5 0 0 0 12 3zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
  },
  {
    symbol: '♦',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 8 10-8 10L4 12 12 2zm0 3.2L6.6 12 12 18.8 17.4 12 12 5.2zm-7 6.8h14v1.6H5V12z"/></svg>',
  },
  {
    symbol: '△',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 2 21h20L12 3zm0 4.2 6.5 11.3h-13L12 7.2zM11 10h2v5h-2zm0 6h2v2h-2z"/></svg>',
  },
  {
    symbol: '♠',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m4 18 4-8 3 5 4-9 5 12H4zm-2 2h20v2H2z"/></svg>',
  },
  {
    symbol: '⚑',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 22h2V4h2v9c4-3 7 2 11-1V4c-4 3-7-2-11 1V2H5v20zm3-2c-1.7 0-3 .5-4 1.2V23c1-.7 2.3-1 4-1 2.6 0 4.3 1 6.5 1 1.7 0 3-.3 4.5-1v-1.8c-1.5.7-2.8 1-4.5 1-2.2 0-3.9-1.2-6.5-1.2z"/></svg>',
  },
  {
    symbol: '⚑',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 21h2V4h2V2H5v19zm5-17v9c3-2 6 2 9 0V4c-3 2-6-2-9 0zm2 2c2-.4 3.5.9 5 1v3c-1.5-.1-3-1.4-5-1V6z"/></svg>',
  },
  {
    symbol: '♞',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 21h14v-2H8v-2h10l-1-6-3-2 2-4-3-3-4 2 1 4-4 3v6H6v4zm5-12-.5-3 2-1 1 1-1.5 3H11zm-1 4 2-2 3 2 .5 2H10v-2z"/></svg>',
  },
  {
    symbol: '◉',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z"/></svg>',
  },
];

export const GAME_WINDOW_TYPES = Object.freeze(GAME_TYPES.map((type, index) => Object.freeze({
  type,
  title: SPECIAL_TITLES[type] || type[0].toUpperCase() + type.slice(1),
  ...GAME_ARTWORK[index],
})));
