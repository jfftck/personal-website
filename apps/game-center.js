import { buildSolitaire } from './games/solitaire-ui.js';
import { buildMinesweeper } from './games/minesweeper-ui.js';
import { buildBoardGame } from './games/board-ui.js';

export const GAMES = [
  { type: 'klondike', title: 'Klondike', symbol: '♠', description: 'The classic solitaire' },
  { type: 'spider', title: 'Spider', symbol: '♣', description: 'Build eight complete runs' },
  { type: 'freecell', title: 'FreeCell', symbol: '♦', description: 'Every card in view' },
  { type: 'minesweeper', title: 'Minesweeper', symbol: '⚑', description: 'Find the safe squares' },
  { type: 'chess', title: 'Chess', symbol: '♞', description: 'Local play or computer' },
  { type: 'reversi', title: 'Reversi', symbol: '◉', description: 'Local play or computer' },
];

export const GAME_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6h10a4 4 0 0 1 3.9 3.1l1.5 6.6a3 3 0 0 1-5 2.8L15 16H9l-2.4 2.5a3 3 0 0 1-5-2.8l1.5-6.6A4 4 0 0 1 7 6zm0 3v2H5v2h2v2h2v-2h2v-2H9V9zm9 1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm3 3a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>';

export function buildGame(type, id, ctx) {
  const title = GAMES.find(game => game.type === type).title;
  if (['klondike', 'spider', 'freecell'].includes(type)) return buildSolitaire(type, id, title, ctx);
  if (type === 'minesweeper') return buildMinesweeper(id, ctx);
  return buildBoardGame(type, id, title, ctx);
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
    icon.className = 'app-launcher-icon game-launcher-symbol';
    icon.textContent = game.symbol; icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.className = 'app-launcher-name';
    name.textContent = game.title;
    const description = document.createElement('small'); description.textContent = game.description;
    btn.append(icon, name, description);
    btn.addEventListener('click', () => openGame(game.type));
    games.append(btn);
  }
  function showGames(focus = true) {
    root.hidden = true; submenu.hidden = false; back.hidden = false;
    heading.textContent = 'Game Center';
    entry.setAttribute('aria-expanded', 'true');
    if (focus) back.focus();
  }
  function showRoot(focus = true) {
    root.hidden = false; submenu.hidden = true; back.hidden = true;
    heading.textContent = 'Apps';
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
