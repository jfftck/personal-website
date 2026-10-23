import { buildSolitaire } from './games/solitaire-ui.js';
import { buildMinesweeper } from './games/minesweeper-ui.js';
import { buildBoardGame } from './games/board-ui.js';

export const GAMES = [
  {
    type: 'klondike', title: 'Klondike', symbol: '♠',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 9.3 6.1C7.2 8.8 4 11.3 4 14.5a5 5 0 0 0 8 4 5 5 0 0 0 8-4c0-3.2-3.2-5.7-5.3-8.4L12 2.5zM8.5 14a3.5 3.5 0 0 0 2 3.2 3.5 3.5 0 0 1-5-3.2c0-1.4.9-2.8 2.3-4.3-.4 1.7-.1 3.1.7 4.3z"/></svg>',
  },
  {
    type: 'spider', title: 'Spider', symbol: '♣',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3a5 5 0 0 0-4.8 6.4L3 7.8l1.2 3.5L1 13l3.5 1.8L3 18l4.5-1.6A5 5 0 0 0 11 21v-4h2v4a5 5 0 0 0 3.5-4.6L21 18l-1.5-3.2L23 13l-3.2-1.7L21 7.8l-4.2 1.6A5 5 0 0 0 12 3zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
  },
  {
    type: 'freecell', title: 'FreeCell', symbol: '♦',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 8 10-8 10L4 12 12 2zm0 3.2L6.6 12 12 18.8 17.4 12 12 5.2zm-7 6.8h14v1.6H5V12z"/></svg>',
  },
  {
    type: 'minesweeper', title: 'Minesweeper', symbol: '⚑',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 21h2V4h2V2H5v19zm5-17v9c3-2 6 2 9 0V4c-3 2-6-2-9 0zm2 2c2-.4 3.5.9 5 1v3c-1.5-.1-3-1.4-5-1V6z"/></svg>',
  },
  {
    type: 'chess', title: 'Chess', symbol: '♞',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 21h14v-2H8v-2h10l-1-6-3-2 2-4-3-3-4 2 1 4-4 3v6H6v4zm5-12-.5-3 2-1 1 1-1.5 3H11zm-1 4 2-2 3 2 .5 2H10v-2z"/></svg>',
  },
  {
    type: 'reversi', title: 'Reversi', symbol: '◉',
    iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z"/></svg>',
  },
];

export function buildGame(type, id, ctx, initialState = null) {
  const game = GAMES.find(item => item.type === type);
  const { title, iconSvg } = game;
  if (['klondike', 'spider', 'freecell'].includes(type)) {
    return buildSolitaire(type, id, title, ctx, initialState, iconSvg);
  }
  if (type === 'minesweeper') return buildMinesweeper(id, ctx, initialState, iconSvg);
  return buildBoardGame(type, id, title, ctx, initialState, iconSvg);
}

export function initGameMenu(menu, openGame) {
  const root = menu.querySelector('#launcher-root');
  const submenu = menu.querySelector('#game-submenu');
  const entry = menu.querySelector('#game-center-entry');
  const back = menu.querySelector('#game-menu-back');
  const heading = menu.querySelector('#app-menu-title');
  const games = menu.querySelector('#game-list');
  for (const game of GAMES) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'app-launcher';
    btn.dataset.game = game.type;
    const icon = document.createElement('span');
    icon.className = 'app-launcher-icon game-launcher-icon';
    icon.innerHTML = game.iconSvg;
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.className = 'app-launcher-name';
    name.textContent = game.title;
    btn.append(icon, name);
    btn.addEventListener('click', () => openGame(game.type));
    games.append(btn);
  }
  function showGames(focus = true) {
    root.hidden = true; submenu.hidden = false; back.hidden = false;
    heading.textContent = 'Game Center';
    menu.setAttribute('aria-label', 'Game Center');
    entry.setAttribute('aria-expanded', 'true');
    if (focus) back.focus();
  }
  function showRoot(focus = true) {
    root.hidden = false; submenu.hidden = true; back.hidden = true;
    heading.textContent = 'Apps';
    menu.setAttribute('aria-label', 'App launcher');
    entry.setAttribute('aria-expanded', 'false');
    if (focus) entry.focus();
  }
  entry.addEventListener('click', () => showGames());
  back.addEventListener('click', () => showRoot());
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !submenu.hidden) {
      event.preventDefault(); event.stopPropagation(); showRoot();
    }
    if (event.key === 'Tab') {
      const focusable = [...menu.querySelectorAll('button')].filter(btn => !btn.disabled && btn.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  return { showRoot, showGames };
}
